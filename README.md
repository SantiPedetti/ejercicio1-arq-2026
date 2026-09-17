# Sistema de Procesamiento de Reservas de Vuelos (Pipes & Filters)

Backend en Node.js, TypeScript y Express.js que procesa solicitudes de reservas de vuelos aplicando el patrón arquitectónico **Pipes & Filters** en el mismo proceso. El sistema valida la elegibilidad de pasajeros y vuelos, enriquece las solicitudes con tasas de cambio obtenidas de un servicio externo resiliente, liquida tarifas y descuentos encadenados, aplica tasas e impuestos, y convierte los montos a la moneda local del país de destino.

- **Estilo arquitectónico:** Pipes & Filters en memoria con arquitectura de capas estrictas (Routes → Controllers → Services → Pipeline/Filters → Repositories/Providers).
- **Integración externa:** ExchangeRate-API v4 pública con timeout de 5 s, hasta 3 reintentos con backoff y jitter, caché en memoria (TTL 1 h), *single-flight* y degradación controlada (*stale-cache* o USD).
- **Documentación de arquitectura completa (SADP 2.0):** [`docs/architecture/architecture.md`](docs/architecture/architecture.md).
- **Registros de Decisiones de Arquitectura (ADR):** [`docs/adr/`](docs/adr/) (ADR-001 al ADR-008).

---

## Arquitectura del Pipeline

El procesamiento de cada reserva atraviesa una secuencia estrictamente ordenada de 8 filtros independientes desacoplados entre sí:

```
[ Cliente HTTP ]
       │
       ▼
[ Source (Validación Zod + Enriquecimiento inicial) ]
       │
       ├─► F1: validatePassenger (Existencia, estado activo, email, coherencia edad/tipo) [Crítico]
       ├─► F2: validateFlight (Existencia, asientos disponibles > 0, ruta, fecha futura) [Crítico]
       ├─► F3: exchangeRateEnrichment (Detección de divisa de destino y consulta de tasa) [No crítico]
       ├─► F4: basePrice (Tarifa según clase: Economy x1, Business x2.5, First x4) [Crítico]
       ├─► F5: loyaltyDiscount (Descuento lealtad sobre currentPrice: Bronze 5%, Silver 10%, Gold 15%) [Crítico]
       ├─► F6: passengerTypeAdjustment (Descuento edad sobre currentPrice: Child 25%, Senior 15%) [Crítico]
       ├─► F7: taxesAndFees (Impuestos 12%, tasa fija $25, combustible 8% de classPrice) [Crítico]
       ├─► F8: currencyConversion (Cálculo de baseFareLocal y totalLocal con la tasa) [No crítico]
       │
       ▼
[ Sink (Proyección JSON + Redondeo a 2 decimales round2 + Almacenamiento en Store) ]
```

Cada filtro recibe un contexto inmutable `ReservationContext`, devuelve una nueva copia del contexto y es supervisado tras su ejecución por `context-guard`, garantizando que ningún importe sea corrupto (`NaN` o negativo).

---

## Requisitos

- **Node.js:** `>= 22.0.0` (LTS recomendado, probado en Node 22).
- **npm:** `>= 10.0.0`.

---

## Instalación

Las dependencias están fijadas con versiones exactas en `package.json` (`save-exact=true`):

```bash
npm install
```

---

## Variables de Entorno

La configuración de infraestructura se carga y valida al inicio con Zod de forma *fail-fast* (`src/config/env.ts`):

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `PORT` | Puerto TCP en el que escucha el servidor Express | `3000` |
| `EXCHANGE_API_BASE_URL` | URL base de la API externa de tipo de cambio | `https://api.exchangerate-api.com/v4/latest` |
| `LOG_LEVEL` | Nivel mínimo de emisión de logs estructurados (Pino) | `info` (`debug`, `info`, `warn`, `error`) |

Existe una plantilla `.env.example` en el repositorio:
```bash
cp .env.example .env
```

---

## Ejecución

```bash
# Modo desarrollo con recarga automática (tsx watch)
npm run dev

# Compilación estricta a dist/ (solo src/, tests excluidos)
npm run build

# Ejecución en producción
npm start
```

---

## Verificación y Tests

El proyecto cuenta con una suite completa de pruebas unitarias y de integración que validan los 16 casos de la consigna y los 7 escenarios de calidad arquitectónicos (AC 1 a AC 7).

```bash
# Verificación estricta de tipos en TypeScript (src y tests)
npm run typecheck

# Verificación de linter estricto (ESLint flat config)
npm run lint

# Ejecución de pruebas automatizadas con Jest y Supertest
npm test
```

> **Aislamiento de red:** Las pruebas automatizadas nunca realizan llamadas a la red. El servicio inyecta stubs y simuladores del proveedor de tasas (`ExchangeRateProvider`) y relojes deterministas (`Clock`).

---

## Endpoints de la API

La colección completa de Postman con ejemplos y respuestas guardadas se encuentra en [`postman/flight-reservations.postman_collection.json`](postman/flight-reservations.postman_collection.json).

### 1. `POST /reservations/process`
Procesa un lote de 1 a 100 reservas de forma concurrente (`Promise.all`). Permite configurar overrides temporales válidos únicamente para ese lote (no muta la configuración global).

**Ejemplo de Request:**
```json
{
  "reservations": [
    {
      "id": "R-1001",
      "passengerId": "P001",
      "flightCode": "AA001",
      "origin": "JFK",
      "destination": "EZE",
      "departureDate": "2026-10-08",
      "seatClass": "economy",
      "passengerType": "adult"
    }
  ],
  "config": {
    "enabledFilters": {
      "loyaltyDiscount": true
    }
  }
}
```

**Ejemplo de Response (HTTP 200 OK):**
```json
{
  "processingTimeMs": 14.5,
  "summary": {
    "total": 1,
    "confirmed": 1,
    "rejected": 0,
    "failed": 0
  },
  "results": [
    {
      "reservationId": "R-1001",
      "status": "CONFIRMED",
      "passenger": {
        "id": "P001",
        "fullName": "Ana Gomez",
        "passengerType": "adult",
        "loyaltyTier": "gold"
      },
      "flight": {
        "flightCode": "AA001",
        "origin": "JFK",
        "destination": "EZE",
        "departureDate": "2026-10-08",
        "destinationCountry": "AR"
      },
      "pricing": {
        "baseFare": 450,
        "classPrice": 450,
        "currentPrice": 382.5,
        "loyaltyDiscount": 67.5,
        "passengerTypeDiscount": 0,
        "subtotal": 382.5,
        "taxes": 45.9,
        "fuelSurcharge": 36,
        "airportFee": 25,
        "total": 489.4
      },
      "conversion": {
        "currency": "ARS",
        "rate": 1400,
        "source": "api",
        "fetchedAt": "2026-09-17T19:00:00.000Z",
        "baseFareLocal": 630000,
        "totalLocal": 685160
      },
      "errors": [],
      "warnings": [],
      "trace": [
        { "filter": "validatePassenger", "status": "COMPLETED", "durationMs": 0.5 },
        { "filter": "validateFlight", "status": "COMPLETED", "durationMs": 0.4 },
        { "filter": "exchangeRateEnrichment", "status": "COMPLETED", "durationMs": 8.2 },
        { "filter": "basePrice", "status": "COMPLETED", "durationMs": 0.2 },
        { "filter": "loyaltyDiscount", "status": "COMPLETED", "durationMs": 0.2 },
        { "filter": "passengerTypeAdjustment", "status": "COMPLETED", "durationMs": 0.1 },
        { "filter": "taxesAndFees", "status": "COMPLETED", "durationMs": 0.2 },
        { "filter": "currencyConversion", "status": "COMPLETED", "durationMs": 0.2 }
      ],
      "processedAt": "2026-09-17T19:00:00.020Z"
    }
  ]
}
```

---

### 2. `GET /reservations/:id/status`
Recupera el estado y desglose de procesamiento de una reserva individual almacenada en el historial en memoria (acotado a 1000 entradas FIFO).

**Response (HTTP 200 OK):**
```json
{
  "reservationId": "R-1001",
  "status": "CONFIRMED",
  "updatedAt": "2026-09-17T19:00:00.020Z",
  "result": {
    "reservationId": "R-1001",
    "status": "CONFIRMED",
    "pricing": { "total": 489.4 }
  }
}
```
*Si la reserva no fue procesada o fue desalojada por el límite de 1000 registros, retorna HTTP 404.*

---

### 3. `GET /pipeline/config`
Retorna la configuración global vigente del pipeline, los filtros habilitados y el orden inmutable de etapas.

---

### 4. `PUT /pipeline/config`
Modifica en caliente la configuración global de los filtros (parches parciales). Valida estrictamente el esquema con Zod (rechaza campos desconocidos como `filterOrder` o `apiBaseUrl` con HTTP 400).

**Request:**
```json
{
  "enabledFilters": {
    "loyaltyDiscount": false
  },
  "taxes": {
    "airportFeeUsd": 30
  }
}
```

---

### 5. `POST /pipeline/cache/invalidate`
Purga inmediatamente la memoria caché de tasas de cambio (HTTP 204 No Content).

---

### 6. `POST /pipeline/config/reset`
Restaura la configuración a sus valores por defecto de fábrica y limpia la caché de tasas.

---

## Desvíos Aceptados del Proyecto

- **D1. Procesamiento concurrente del lote con `Promise.all` (Anulado el procesamiento secuencial en F6):**  
  Para cumplir el escenario de calidad **AC 1** (asegurar un máximo de 3 intentos de red por lote gracias a la táctica de *single-flight*), las reservas de un lote deben procesarse concurrentemente en lugar de secuencialmente. En secuencial, cada reserva abría su propia tanda de reintentos porque la anterior ya había vaciado la promesa. Se restituyó `Promise.all` conforme al PLAN original §7.
- **D2. Mantenimiento de `ts-jest` y `tsx`:**  
  Se conservaron las herramientas `ts-jest` para la ejecución de pruebas y `tsx watch` para desarrollo en lugar de babel-jest y `node --watch`, garantizando tipado estricto inmediato y estabilidad.
- **D3. Enums de dominio en minúscula:**  
  Los valores de enums de negocio se definen en minúscula (`gold`, `child`, `economy`, `silver`, etc.) para máxima compatibilidad con cargas JSON habituales, mientras que los estados de ciclo de vida (`CONFIRMED`, `REJECTED`, `FAILED`) y códigos de error (`PASSENGER_NOT_FOUND`, `NO_SEATS`, etc.) permanecen en MAYÚSCULAS.

---

## Riesgos y Limitaciones Conocidas (PLAN §12.1)

1. **Ausencia de autenticación en endpoints de administración:**  
   `PUT /pipeline/config` y `POST /pipeline/cache/invalidate` no implementan autenticación ni autorización por rol. Esta es una limitación deliberada del alcance académico (ADR-006). En entornos productivos, estas rutas deben restringirse a nivel perimetral o protegerse con JWT/API Keys.
2. **Falta de persistencia y escalado horizontal:**  
   La configuración, la caché de cotizaciones y el almacén de resultados (`ProcessingStore`) residen exclusivamente en la memoria RAM de la instancia de Node.js (ADR-008). Múltiples réplicas en balanceador tendrían estados desincronizados.
3. **Deprecación de ExchangeRate-API v4:**  
   El servicio público v4 de ExchangeRate-API está marcado como legado por el proveedor (devuelve `"WARNING_UPGRADE_TO_V6"`). Como mitigación, la URL es configurable vía variable de entorno (`EXCHANGE_API_BASE_URL`), la integración se aísla tras la interfaz `ExchangeRateProvider` y el esquema Zod ignora campos adicionales de advertencia.
4. **No decremento de asientos en vuelos:**  
   El filtro `validateFlight` constata cupo disponible (`availableSeats > 0`), pero no decrementa el cupo en los datos mock para preservar el determinismo y la repetibilidad de la suite de pruebas automatizadas.

---

## Uso de Inteligencia Artificial

En estricto cumplimiento con el reglamento de la cátedra (`Condiciones de uso de IA en Obligatorios.pdf`), se declara el uso asistido de herramientas de IA Generativa durante el desarrollo:

| Herramienta | Uso principal | Componentes / Documentos afectados | Método de verificación humana |
|---|---|---|---|
| **Claude Code (Anthropic)** | Análisis de requerimientos, diseño del plan de construcción y revisión cruzada de diffs. | `docs/plan/PLAN.md`, contratos de dominio y estructuración de tests de integración. | Ejecución de suite completa de pruebas Supertest y cálculo manual de desgloses de precio. |
| **Google Antigravity (Gemini)** | Construcción del pipeline, filtros, esquemas Zod, diagramas Mermaid y documentación SADP 2.0. | `src/pipeline/`, `src/services/`, `architecture.md`, `README.md`, `postman/` y ADRs. | Compilación estricta con `tsc`, linteo estricto con `eslint` y auditoría de código línea por línea. |
| **Devin (`devin-local`)** | Análisis comparativo de alternativas de desglose tarifario y riesgos. | Definición de la separación del filtro 8 (`currencyConversion`) en ADR-007. | Contraste crítico documentado en `docs/plan/PLAN-REVIEW-LOG.md`. |

*Todo el código y la arquitectura han sido comprendidos, verificados y preparados para su defensa individual obligatoria.*
