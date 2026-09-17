# PLAN — Sistema de Reservas de Vuelos (Pipes & Filters)

> Estado: **v7, APROBADA por el revisor** (`VERDICT: APPROVED` en la ronda 5, la última). La §10 (documentación) sigue las reglas de la cátedra (`Recursos Documentacion/arquitectura.md`), recortada según R5. Incluye lo tomado del plan externo (`../plan-a0068662f1436408.md`). Falta la aprobación del usuario y elegir la ruta de construcción. Solo cambia por arbitraje de la Fase 2 (ver `PLAN-REVIEW-LOG.md`).
> Consigna: `../Ejercicio de Aplicación 1.md` (Universidad ORT — Arquitectura de Software, Tecnología).
> **Destino del código:** repo `C:\Users\nacho\source\repos\ejercicio1-arq-2026` (hoy vacío: `main` sin commits ni remoto), en una **rama que crea el usuario**. No se escribe nada en el repo hasta que exista esa rama. Al empezar, `PLAN.md` y `PLAN-REVIEW-LOG.md` se copian a `docs/plan/`.

## 1. Objetivo

Backend Node.js + TypeScript + Express que procesa un lote de reservas de vuelo a través de un pipeline de 8 filtros: los 7 de la consigna (validación de pasajero, validación de vuelo, tipo de cambio, precio base, lealtad, tipo de pasajero, impuestos) más la conversión de moneda al final (ADR-007), y devuelve por cada reserva el precio calculado, errores, warnings y el tiempo total de procesamiento.

Atributos de calidad priorizados: **Modificabilidad** y **Testeabilidad** (motivo del patrón), **Disponibilidad** ante la caída de la API de tipo de cambio (degradación a USD). Rendimiento: secundario (overhead de indirección aceptado).

## 2. Stack (igual al usado por la cátedra en `cryptoZJ`)

- Node >= 22, ESM (`"type": "module"`), TypeScript 5 `strict` + `noUncheckedIndexedAccess`.
- Express 5, `fetch` nativo (sin axios), variables con `node --env-file`.
- Zod 4 en tres fronteras: body HTTP, `env`, respuesta de la API de tipo de cambio.
- Pino para logging estructurado.
- **Dependencias con versión exacta** (sin `^` ni `~`, `save-exact=true` en `.npmrc`), elegidas entre versiones publicadas hace más de 7 días; se commitea `package-lock.json`. Tomado del plan externo.
- Jest 30 + babel-jest (preset-env + preset-typescript) + Supertest.
- ESLint (typescript-eslint strict), `max-lines-per-function: { max: 15, skipBlankLines: true, skipComments: true }` en `src/` (tests excluidos). Es un pedido de la cátedra que el usuario confirmó; ver R1 F8.
- **PROOF_CMD:** `npm run verify` = `typecheck && typecheck:test && lint && test` (Jest con umbral de cobertura 80% líneas/ramas).

## 3. Arquitectura

Capas estrictas (sin saltos): `routes → controllers → services → pipeline → filters`; `services → repositories`; filtro de tipo de cambio `→ ExchangeRateProvider` (interfaz, DIP).

```
src/
  app.ts, server.ts
  config/env.ts                  # Zod, fail-fast
  config/pipeline-config.ts      # esquema Zod + defaults + merge parcial
  data/mockPassengers.ts         # exigido por la consigna
  data/mockFlights.ts            # exigido por la consigna (fechas relativas al Clock)
  domain/types.ts                # Reservation, Passenger, Flight, ReservationContext, Issue, PriceBreakdown
  domain/age.ts                  # edad a una fecha dada
  pipeline/filter.ts             # interfaz Filter
  pipeline/pipeline.ts           # runner
  pipeline/context-guard.ts      # invariantes del contexto tras cada filtro
  filters/passenger-validation.filter.ts
  filters/flight-validation.filter.ts
  filters/exchange-rate.filter.ts
  filters/base-price.filter.ts
  filters/loyalty-discount.filter.ts
  filters/passenger-type.filter.ts
  filters/taxes.filter.ts
  filters/currency-conversion.filter.ts       # filtro 8 (ADR-007)
  providers/exchange-rate.provider.ts          # interfaz
  providers/exchangerate-api.provider.ts       # impl HTTP: timeout + retry + validación Zod
  providers/cached-exchange-rate.provider.ts   # decorador: TTL 1h, single-flight, stale fallback
  providers/country-currency.ts                # mapa país → moneda
  repositories/passenger.repository.ts, flight.repository.ts
  repositories/reservation-status.repository.ts # Map acotado (1000, FIFO)
  services/reservation-processing.service.ts   # source (carga) + pipeline + sink (resultado)
  controllers/, routes/, middlewares/ (error, not-found, request-logger)
  shared/clock.ts, shared/logger.ts, shared/money.ts (redondeo)
tests/  unit/filters/*, unit/pipeline/*, unit/providers/*, integration/*.test.ts
postman/flight-reservations.postman_collection.json
README.md
docs/architecture/architecture.md            # estructura SADP 2.0 (§10.1)
docs/architecture/diagrams/                  # D1–D9 en .mmd + Archify HTML/SVG (§10.4)
docs/adr/ADR-00N-<slug>.md                   # plantilla oficial en español (§10.8)
docs/plan/PLAN.md, docs/plan/PLAN-REVIEW-LOG.md
```

### 3.1 Contrato del filtro

```ts
type FilterName = 'passengerValidation' | 'flightValidation' | 'exchangeRate'
  | 'basePrice' | 'loyaltyDiscount' | 'passengerType' | 'taxes' | 'currencyConversion';

interface Filter {
  readonly name: FilterName;
  readonly critical: boolean;             // excepción → FAILED (true) o warning y continuar (false)
  execute(ctx: ReservationContext, cfg: PipelineConfig): Promise<ReservationContext>;
}
```

- Los filtros **no se conocen entre sí**; solo leen/escriben el `ReservationContext`.
- Devuelven un **contexto nuevo** (no mutan el recibido).
- Un filtro que detecta un problema de negocio agrega un `Issue { code, message, filter, severity: 'error' | 'warning' }`; **no lanza**.

### 3.2 ReservationContext

```ts
interface ReservationContext {
  reservation: ReservationInput;        // ya validada por Zod
  passenger?: Passenger;                // cargado por el source (puede faltar)
  flight?: Flight;                      // cargado por el source (puede faltar)
  pricing: {                            // todo en USD, sin redondear
    baseFare?: number;                  // lo inicializa el source = flight.baseFare (R1 F1)
    classPrice?: number;                // filtro 4; base del recargo de combustible
    currentPrice?: number;              // precio acumulado: lo fija el 4 y lo actualizan el 5 y el 6 (R1 F4)
    loyaltyDiscount?: number; passengerTypeDiscount?: number;   // montos descontados (informativos)
    subtotal?: number; taxes?: number; fuelSurcharge?: number; airportFee?: number; total?: number;
  };
  exchangeRate?: { currency: string; rate: number; source: 'api' | 'cache' | 'stale-cache';
                   fetchedAt: string };                       // lo escribe el filtro 3; ausente = sin tasa (R1 F7)
  conversion?: { baseFareLocal: number; totalLocal: number };  // lo escribe el filtro 8, sin redondear (ADR-007)
  errors: Issue[]; warnings: Issue[];
  trace: { filter: FilterName; status: 'COMPLETED' | 'SKIPPED' | 'FAILED' | 'NOT_RUN'; durationMs: number }[];
}
```

### 3.3 Semántica del runner (decisión Q1)

Por cada reserva, en orden fijo:
1. Filtro deshabilitado → `trace SKIPPED`, sigue.
2. `execute` → `context-guard` valida invariantes (montos finitos y >= 0, `classPrice` presente si `basePrice` corrió). Violación → `error DATA_CORRUPTED`, **FAILED**, se corta.
3. Si el filtro agregó un `error` → **REJECTED**, filtros restantes `NOT_RUN`.
4. Excepción: filtro `critical` → **FAILED** y se corta; no crítico (`exchangeRate` o `currencyConversion`) → warning `FILTER_EXCEPTION` y sigue.
5. Fin sin errores → **CONFIRMED**.
- El pipeline **nunca lanza**; cada reserva es independiente. Log Pino por filtro `{ pipeline, reservationId, correlationId, filter, status, durationMs }`.
- Criticidad: validaciones y precios `critical: true`; `exchangeRate` y `currencyConversion` `critical: false`.
- Estados: `PENDING | PROCESSING | CONFIRMED | REJECTED | FAILED`.

### 3.4 Source y sink

- **Source** (servicio): valida cada reserva con Zod de forma individual; carga `passenger` por `passengerId` y `flight` por `flightCode` desde repositorios. Si el vuelo existe, inicializa `pricing.baseFare = classPrice = currentPrice = flight.baseFare`: son los valores neutros, como si el multiplicador fuera 1. El filtro 4 los reemplaza; si está deshabilitado, los filtros siguientes usan la tarifa base (R2 F11). Reserva malformada → se toma su `id` si es un string; si no, se genera un UUID (R3 F18). Queda `REJECTED` con `error INVALID_RESERVATION` sin pasar por filtros (el resto del lote sigue).
- **Sink**: **no calcula nada**. Redondea todos los montos, incluidos los locales (R3 F16), con `round2` (`Math.round((x + Number.EPSILON) * 100) / 100`), arma el resultado y lo guarda en `reservation-status.repository`. La conversión del total pasó al filtro 8, lo que cierra la objeción que había quedado rechazada en R1 F1.
- Si un filtro de precio necesita datos que faltan (p. ej. validación de vuelo deshabilitada y vuelo inexistente) → `error MISSING_DATA` → REJECTED.

## 4. Filtros

| # | Filtro | Reglas | Códigos de error/warning |
|---|---|---|---|
| 1 | passengerValidation | existe; `isActive`; email válido (Zod `.email()`); `name.trim()` no vacío; edad **en años cumplidos** (desde `birthDate` ISO) a `reservation.departureDate`, sin depender de que el vuelo exista (R2 F13), coherente con el `passengerType` declarado: child < 12, senior > 65, adult 12–65 inclusive. Se respeta literal el "> 65" de la consigna, con tests en los bordes 11/12 y 65/66 (R1 F9) | `PASSENGER_NOT_FOUND`, `PASSENGER_INACTIVE`, `INVALID_CONTACT`, `PASSENGER_TYPE_MISMATCH` |
| 2 | flightValidation | existe por código; `availableSeats > 0`; `origin`/`destination` de la reserva = los del vuelo; `new Date(flight.departureAt) > clock.now()`; `reservation.departureDate === flight.departureAt.slice(0, 10)` (día UTC) (R2 F13) | `FLIGHT_NOT_FOUND`, `NO_SEATS`, `ROUTE_MISMATCH`, `FLIGHT_DEPARTED`, `DATE_MISMATCH` |
| 3 | exchangeRate | Si falta `ctx.flight` → warning `EXCHANGE_RATE_SKIPPED_NO_FLIGHT`, USD, sin lanzar excepción (R3 F17). `flight.destinationCountry` (ISO-2, campo del vuelo; R1 F3) → moneda (`AR→ARS, BR→BRL, US→USD, EU→EUR, ES/FR/DE→EUR, CL→CLP, UY→UYU, MX→MXN`); si USD → sin conversión; si no, obtiene la tasa y la guarda en `ctx.exchangeRate` (**no convierte montos**; ADR-007). **Fallo (Q3):** tasa vencida en caché (`stale-cache`, warning `STALE_RATE`); si no hay → **no se agrega `exchangeRate`**, los precios quedan solo en USD y se emite el warning `EXCHANGE_RATE_UNAVAILABLE` (R1 F7). País sin mapeo o moneda ausente en la respuesta → warning `UNKNOWN_CURRENCY`, USD | warnings solamente |
| 4 | basePrice | `classPrice = baseFare × {economy: 1, business: 2.5, first: 4}`; `currentPrice = classPrice` | — |
| 5 | loyaltyDiscount | `loyaltyDiscount = currentPrice × {NONE: 0, BRONZE: .05, SILVER: .10, GOLD: .15}[tier]`; `currentPrice −= loyaltyDiscount` | — |
| 6 | passengerType | `passengerTypeDiscount = currentPrice × {CHILD: .25, SENIOR: .15, ADULT: 0}[passengerType declarado]`; `currentPrice −= passengerTypeDiscount` (encadenado) | — |
| 7 | taxes | `subtotal = currentPrice` (**no recalcula descuentos**; R1 F4); `taxes = subtotal × .12`; `fuelSurcharge = classPrice × .08`; `airportFee = 25`; `total = subtotal + taxes + fuelSurcharge + airportFee` | — |
| 8 | currencyConversion | Si no hay `ctx.exchangeRate`, o faltan `baseFare` o (`total` y `currentPrice`) → no hace nada, sin lanzar ni generar `NaN` (R4 F19). El warning ya lo emitió el filtro 3. Si hay: `baseFareLocal = baseFare × rate`; `totalLocal = (total ?? currentPrice) × rate` | — (no crítico) |

Filtro 5 o 6 deshabilitado ⇒ no toca `currentPrice` (queda como paso pasivo). Si `taxes` está deshabilitado, el sink usa `subtotal = total = currentPrice`. Filtro 3 deshabilitado ⇒ el 8 no tiene tasa y no convierte. Filtro 8 deshabilitado ⇒ la salida muestra la tasa pero no los montos locales.

**Ejemplo canónico (Q2)** — base 200, business, GOLD, CHILD: 500 → 425 → 318.75; taxes 38.25; fuel 40; airport 25; **total 422.00 USD**.

## 5. Proveedor de tipo de cambio (Release It!)

- Interfaz: `getRates(base: string, opts: { timeoutMs: number; maxAttempts: number; cacheTtlMs: number }): Promise<RatesResult>` con `RatesResult = { rates: Record<string, number>; source: 'api' | 'cache' | 'stale-cache'; fetchedAt: Date }`. Si no hay tasa posible, lanza `ExchangeRateError` y el filtro 3 lo traduce a `EXCHANGE_RATE_UNAVAILABLE` (R1 F6).
- Las opciones salen del **snapshot global** de la configuración en cada llamada, así los singletons no guardan estado mutable de configuración (R1 F5).
- `ExchangeRateApiProvider.getRates('USD')` → `GET {EXCHANGE_API_BASE_URL}/USD`.
- Timeout **5 s** por intento con `AbortSignal.timeout`.
- **3 intentos en total** (1 + 2 reintentos), backoff 200 ms y 400 ms con jitter ±20%. Reintenta solo por red/timeout/5xx/429. No reintenta 4xx ni respuesta con esquema inválido.
- Respuesta validada con Zod `{ base: string, rates: Record<string, number.positive()> }`; inválida → error `ExchangeRateError('INVALID_RESPONSE')`.
- `CachedExchangeRateProvider` (decorador): Map por moneda base; TTL **1 h** (configurable); **single-flight** (las reservas concurrentes del lote comparten la misma promesa). La promesa en curso se borra en un `.finally()`, así un fallo no queda cacheado y el próximo lote reintenta (R1 F6). El TTL llega en `opts.cacheTtlMs` en cada consulta (R2 F14). Guarda el último valor aunque venza para `stale-cache`; `invalidate()`.
- Logging de errores de integración con Pino (`warn` por reintento, `error` al agotar).
- Tests: provider falso inyectado; los tests **nunca** llaman a la red. `jest.useFakeTimers` para TTL y backoff.

## 6. Configuración del pipeline (Q4)

```ts
{
  filters: { passengerValidation: { enabled: true }, ..., taxes: { enabled: true }, currencyConversion: { enabled: true } },
  params: {
    classMultipliers: { economy: 1, business: 2.5, first: 4 },
    loyaltyDiscounts: { NONE: 0, BRONZE: 0.05, SILVER: 0.10, GOLD: 0.15 },
    passengerTypeDiscounts: { CHILD: 0.25, SENIOR: 0.15, ADULT: 0 },
    taxRate: 0.12, fuelSurchargeRate: 0.08, airportFee: 25,
    exchange: { timeoutMs: 5000, maxAttempts: 3, cacheTtlMs: 3600000 }
  }
}
```

- Orden de filtros **fijo** (no configurable).
- `GET /pipeline/config` → config global + orden.
- `PUT /pipeline/config` → **merge parcial profundo** validado con Zod `.strict()` (claves desconocidas → 400; porcentajes 0–1; multiplicadores > 0; timeout 100–30000; intentos 1–5). Responde la config resultante.
- `POST /reservations/process` acepta `config` opcional con el mismo esquema parcial **excepto `params.exchange`**, que es infraestructura compartida y solo se cambia con PUT (R1 F5). Se aplica **solo a esa request** y no modifica la configuración global.
- Config global en un objeto inmutable reemplazado atómicamente; cada lote toma un snapshot al comenzar.

## 7. API (Q5)

| Método | Ruta | Respuesta |
|---|---|---|
| POST | `/reservations/process` | Body = sobre `{ reservations: unknown[] (1..100), config?: PartialRequestConfig }` (R1 F2). 200 `{ results[], summary{ total, confirmed, rejected, failed }, processingTimeMs }`. 400 si el sobre es inválido: `reservations` no es un array, está vacío o tiene más de 100 elementos, `config` es inválida o hay ids repetidos. Cada elemento se valida por separado en el source. |
| GET | `/reservations/:id/status` | 200 `{ reservationId, status, updatedAt, result? }`; 404 si no existe |
| GET | `/pipeline/config` | 200 config |
| PUT | `/pipeline/config` | 200 config nueva; 400 |
| POST | `/pipeline/cache/invalidate` | 204 |
| GET | `/health` | 200 |

Entrada de cada reserva (Q6):

```json
{ "reservations": [
    { "id": "R-001", "passengerId": "P001", "flightCode": "AA001",
      "origin": "JFK", "destination": "EZE", "departureDate": "2026-10-20",
      "seatClass": "economy", "passengerType": "ADULT" }
  ],
  "config": { "filters": { "loyaltyDiscount": { "enabled": false } } } }
```

Modelos de los datos mock (R1 F3, F9):

- `Passenger { id, name, email, birthDate: 'YYYY-MM-DD', country, loyaltyTier: 'NONE'|'BRONZE'|'SILVER'|'GOLD', isActive }`
- `Flight { code, origin, destination, originCountry, destinationCountry, departureAt: ISO, durationMinutes, baseFare, availableSeats }`

- `id` opcional (UUID si falta). La unicidad se controla **solo entre los ids enviados**; los que faltan no cuentan como repetidos (R2 F15).
- Procesamiento **síncrono**; reservas del lote en paralelo (`Promise.all`; el lote está acotado a 100).
- Estado `PROCESSING` al empezar y el final al terminar.
- **No** se descuentan asientos.
- Resultado por reserva: `{ reservationId, status, pricing (USD, redondeado), conversion | null, errors[], warnings[], filters[] (trace) }`. `conversion` en la salida = `{ currency, rate, source, fetchedAt, baseFareLocal?, totalLocal? }` (tipo `ConversionResult` en `domain/types.ts`): une `ctx.exchangeRate` con `ctx.conversion`, ya redondeado (R2 F10, ADR-007). Es `null` si no hubo tasa. Con el filtro 8 deshabilitado, `baseFareLocal` y `totalLocal` se **omiten** (nunca `null`), y hay un test que lo verifica (R4 F20).
- Errores HTTP con formato `{ error: { code, message, details? } }`.

## 8. Datos mock (fechas relativas a `clock.now()` al arrancar)

- **Pasajeros (9, para que la colección de Postman pueda cubrir todos los casos contra el servidor real):**
  - `P001` GOLD adulto AR activo.
  - `P002` SILVER adulto BR activo.
  - `P003` BRONZE niño de 8 años US activo.
  - `P004` NONE senior de 70 años ES activo.
  - `P005` inactivo.
  - `P006` activo con email inválido.
  - `P007` NONE adulto UY activo.
  - `P008` GOLD niño de 8 años AR activo (R2 F12).
  - `P009` SILVER senior de 70 años UY activo (R2 F12).
- **Vuelos (6), con distintas rutas y duraciones:**
  - `AA001` JFK→EZE (US→AR), 450 USD.
  - `LA4567` SCL→GRU (CL→BR), 200 USD.
  - `IB6841` MAD→EZE (ES→AR), 900 USD.
  - `AF0010` JFK→CDG (US→FR), 700 USD.
  - `AA0002` MIA→JFK (US→US), 150 USD, `availableSeats: 0`.
  - `UX0099` MAD→MIA (ES→US), 500 USD, ya partido.
- **Carga:** `buildMockFlights(now)` y `buildMockPassengers(now)` se invocan una vez al arrancar. En los tests se llaman con un reloj fijo.

## 9. Pruebas (mapeo 1:1 con la consigna)

- **Unit:** un archivo por filtro (casos felices + cada código de error), `pipeline.test.ts` (SKIPPED, REJECTED corta, excepción crítica/no crítica, guard de datos corruptos), providers (timeout, retry, no-retry 4xx, esquema inválido, TTL, single-flight, stale, invalidate), `pipeline-config` (merge, validación), `age`.
- **Integración (Supertest, app con dependencias inyectadas):**
  - **Flujo básico:**
    1. Reserva válida → CONFIRMED.
    2. Pasajero inexistente → REJECTED `PASSENGER_NOT_FOUND`.
    3. Vuelo sin asientos → REJECTED `NO_SEATS`.
    4. Reserva malformada → REJECTED `INVALID_RESERVATION`, y el resto del lote sigue.
  - **Precios (valores exactos):**
    1. Economy sin descuentos: P007 en AA001 → 450 + 54 + 36 + 25 = **565.00**.
    2. GOLD: P001 economy en AA001 → 382.5 + 45.90 + 36 + 25 = **489.40**.
    3. Niño en business: P008 en LA4567 (200 USD, destino BR) → **422.00 USD** (caso canónico), además de la conversión a BRL.
    4. Senior en first: P009 en IB6841 → 3600 × 0.90 = 3240 × 0.85 = 2754 + 330.48 + 288 + 25 = **3397.48**. Caso extra sin lealtad: P004 → **3740.20**.
  - **Tipo de cambio:**
    1. Conversión aplicada (AR→ARS).
    2. Destino con moneda diferente (FR→EUR).
    3. La API falla → warning y USD.
    4. Segunda llamada usa la caché (provider falso llamado 1 vez).
  - **Errores:**
    1. Timeout de la API externa → `EXCHANGE_RATE_UNAVAILABLE`.
    2. Un filtro lanza una excepción → FAILED.
    3. Falla de red a mitad del lote → las reservas siguen en USD.
    4. Filtro que corrompe datos (NaN) → FAILED `DATA_CORRUPTED`.
  - **Filtro 8:** convierte con la tasa del filtro 3; sin tasa no hace nada; deshabilitado → sin montos locales; `totalLocal` correcto con `taxes` deshabilitado.
  - **Endpoints:** status 200/404, config GET/PUT 200/400, override por request que no muta la config global.
- **Verificación de los escenarios de calidad (§10.3):**
  - **AC 1:** con fake timers, un lote de 10 reservas con la API caída hace ≤ 3 intentos **en total**; todas quedan con estado final y HTTP 200.
  - **AC 2:** se verifica con un checklist de revisión en la Fase 3: al agregar un filtro de prueba, el diff de `pipeline.ts` queda vacío.
  - **AC 3:** un `PUT` mientras corre un lote no cambia el resultado de ese lote, pero sí el del siguiente.
  - **AC 4:** está cubierto por el caso de error 2.
  - **AC 5:** un lote de 100 reservas hace 1 llamada al proveedor falso; un segundo lote dentro del TTL no hace ninguna.
  - **AC 6:** umbral de cobertura en `jest.config` y ningún test con red (`fetch` global falso que falla si se lo llama sin mock).
  - **AC 7:** está cubierto por el flujo básico 4 y por el 400 del sobre.

## 10. Entregables

1. Código fuente TypeScript.
2. Tests (Jest).
3. Colección de Postman: un request por endpoint, más un ejemplo guardado por caso de prueba con su response.
4. `README.md`: instalación, variables de entorno, ejecución, tests, endpoints con ejemplos, resumen de la arquitectura con el diagrama del pipeline y un link a `docs/architecture/architecture.md`, y la sección **"Uso de IA"** (§10.7).
5. **Documentación de arquitectura** según las reglas de la cátedra (`Recursos Documentacion/arquitectura.md`). La consigna no la pide, pero la materia la evalúa (§10.1–10.8).

Reglas generales de la documentación:
- Está en español y en Markdown, dentro del repo.
- Cada afirmación lleva una etiqueta de evidencia: **Propuesta** mientras no exista el código y **Confirmada** (con la ruta del archivo) una vez implementada.
- No se inventan métricas: lo que no se midió dice `Pendiente de validación`.
- Al terminar la Fase 3, cada diagrama se contrasta con el código; si no coincide, se actualiza o se marca como desactualizado (tip 6).

### 10.1 `docs/architecture/architecture.md`: estructura del SADP 2.0

Carátula: **Sistema de Reservas de Vuelos (Pipes & Filters)** · fecha · autores · índice.

| § SADP | Contenido planificado |
|---|---|
| **1 Introducción** | Visión general y guía de lectura: qué sección responde qué pregunta, qué plantillas se usan (SADP 2.0, vistas y ADR de Merson) y cómo se relaciona con `docs/adr/` y `docs/plan/`. |
| 1.1 Propósito | "Proveer una especificación completa de la arquitectura del Sistema de Reservas de Vuelos". |
| **2 Antecedentes** | |
| 2.1 Propósito del sistema | Backend que procesa lotes de reservas mediante un pipeline de filtros. Usuarios: cliente HTTP (Postman) y operador (configuración). Referencia a la consigna. |
| 2.2.1 Resumen de requerimientos funcionales | Tabla **ID · Descripción · Actor** (§10.2). |
| 2.2.2 Resumen de requerimientos de atributos de calidad | Tabla **ID requerimiento · ID AC/RS · Descripción** (§10.2) y, a continuación, **los 7 escenarios completos en esta misma sección** (§10.3; R5 F21). |
| **3 Documentación de la arquitectura** | Una sección por punto de vista. Se declaran los patrones que se usan: **Pipes & Filters** (principal), **Layers**, **Repository**, **Adapter/ACL** (proveedor de tasas) y **Decorator** (caché). |
| 3.1 Diagrama de contexto | §10.4 D1. |
| 3.2 Vistas de módulos | Descomposición (D2) y un **único diagrama de capas con las relaciones «usa» permitidas (D3)**, que es la representación primaria de 3.2.2 (uso) y de 3.2.3 (layers) (R5 F21). Cada vista tiene sus propias decisiones de diseño enlazadas a los ADR. **Un solo catálogo de elementos** para las tres, porque los módulos son los mismos (3.2.4). Interfaces (3.2.5) y comportamiento (3.2.6: D4, D5 y D6). "Otras vistas de módulos": el modelo de datos en memoria (D7). |
| 3.3 Vistas de componentes y conectores | Representación primaria D8 (pipeline). Tablas **Componente/conector · Tipo · Descripción**, **Interfaz · Componente que la provee · Servicio · Descripción** y **Componente · Paquetes** (3.3.5). Comportamiento: reutiliza D4 y D5 con los componentes en ejecución. Incluye la **guía de variabilidad** (§10.4) y las decisiones de diseño con links a los ADR. |
| 3.4.1 Vista de despliegue | D9. Tablas **Nodo · Características · Descripción** y **Conector · Características · Descripción**. Se aclara que las layers de 3.2.3 viven en **un solo tier** (un proceso Node) y que el único límite físico es la API externa. |
| 3.4.2 Vista de instalación | **Sin diagrama** (R5 F21): tabla de catálogo con los artefactos: `dist/`, `package.json`, `package-lock.json`, `.env` y `node_modules` de producción. Pasos `npm ci`, `npm run build`, `npm start`. Decisiones con links a los ADR. |
| **Anexos** (documentación transversal) | A. Tabla atributo → táctica → tecnología (§10.5). B. Matriz de trazabilidad (§10.6). C. Uso de IA (§10.7). D. Glosario (pipe, filtro, source, sink, contexto, tasa vencida, single-flight, snapshot, AC, RS, ADR). |

### 10.2 Requerimientos significativos (IDs con el formato del SADP)

**Funcionales**

| ID | Descripción | Actor |
|---|---|---|
| RF 1 Procesar lote | Recibe entre 1 y 100 reservas y las pasa por el pipeline. Devuelve resultados, errores y warnings por reserva, y el tiempo total. | Cliente HTTP |
| RF 2 Validar pasajero | Existencia, estado activo, datos de contacto, y edad coherente con el tipo de pasajero. | Sistema (filtro 1) |
| RF 3 Validar vuelo | Existencia, asientos disponibles, ruta y fecha futura. | Sistema (filtro 2) |
| RF 4 Enriquecer con tipo de cambio | Moneda del destino, tasa actual y conversión guardada en la metadata. | Sistema (filtros 3 y 8) |
| RF 5 Calcular precio | Precio por clase, lealtad, tipo de pasajero, impuestos y tasas. | Sistema (filtros 4 a 7) |
| RF 6 Consultar estado | Estado del procesamiento de una reserva. | Cliente HTTP |
| RF 7 Ver configuración | Filtros habilitados, orden y parámetros. | Operador |
| RF 8 Modificar configuración | Habilitar o deshabilitar filtros y cambiar parámetros. | Operador |
| RF 9 Invalidar caché | Vaciar la caché de tasas a pedido. | Operador |

**Atributos de calidad y restricciones**

| ID requerimiento | ID AC / RS | Descripción |
|---|---|---|
| RF 4 | AC 1 Disponibilidad | Si la API de tipo de cambio falla, el lote se completa con warnings y precios en USD. |
| RF 1, RF 8 | AC 2 Modificabilidad | Se puede agregar un filtro sin tocar el runner ni los demás filtros. |
| RF 8 | AC 3 Modificabilidad (en ejecución) | Deshabilitar un filtro por configuración tiene efecto sin reiniciar el sistema. |
| RF 1 | AC 4 Disponibilidad (aislamiento de fallos) | La excepción de un filtro afecta solo a esa reserva. |
| RF 4 | AC 5 Rendimiento | La caché y el single-flight evitan llamadas redundantes a la API. |
| todos | AC 6 Testeabilidad | Cada filtro se prueba aislado y los tests no usan la red. |
| RF 1 | AC 7 Confiabilidad de la entrada | Los datos malformados se rechazan uno por uno, sin excepciones no controladas. |
| — | RS 1 Tecnología | Node.js, TypeScript y Express.js (consigna). |
| — | RS 2 Estilo | Pipes & Filters, con los filtros en el orden definido (consigna). |
| — | RS 3 Datos | Datos mock en memoria en `/data/mockPassengers.ts` y `/data/mockFlights.ts`, cargados al iniciar (consigna). |
| — | RS 4 Integración | API pública de tipo de cambio; ExchangeRate-API v4 sin clave. Los precios base están en USD (consigna). |
| — | RS 5 Entregables | Tests unitarios y/o de integración, colección de Postman y README (consigna). |
| — | RS 6 Organizacional | Plazo de entrega que fije la cátedra; uso de IA citado y verificado; defensa obligatoria (`Condiciones de uso de IA en Obligatorios.pdf`). |

### 10.3 Escenarios de calidad (dentro de `architecture.md` §2.2.2)

Los IDs siguen el formato del template SADP (`AC 1` … `AC 7`) en tablas, trazabilidad y tests (R5 F25). Cada escenario usa la plantilla de 6 partes de `arquitectura.md` §2.2, más "Tácticas", "ADR" y "Test que lo verifica". Las medidas son **Propuestas** hasta que un test o una medición las confirme.

| AC | Fuente | Estímulo | Artefacto | Entorno | Respuesta | Medida de respuesta |
|---|---|---|---|---|---|---|
| 1 | ExchangeRate-API | No responde en 5 s o devuelve 5xx en todos los intentos | Proveedor de tasas y filtro 3 | Operación normal, caché vacía | Se usa la tasa vencida si existe (`STALE_RATE`); si no, se sigue en USD (`EXCHANGE_RATE_UNAVAILABLE`) | El 100 % de las reservas del lote termina con estado final; HTTP 200; 0 errores 5xx; como máximo 3 intentos y ≤ 16 s de espera adicional (5 s × 3 + backoff con jitter) **por lote**, no por reserva, gracias al single-flight |
| 2 | Desarrollador | Pide agregar un filtro nuevo | Pipeline y lista de filtros | Tiempo de desarrollo | Crea el filtro y lo registra en la lista | 0 líneas cambiadas en `pipeline.ts` (el runner no depende de la lista concreta de filtros) y en los otros filtros; ≤ 4 archivos de `src/` tocados o creados (el filtro, la unión `FilterName`, el esquema de configuración y el registro en el service), más su test (R5 F22) |
| 3 | Operador | `PUT /pipeline/config` deshabilita `loyaltyDiscount` | Configuración y runner | En ejecución, con lotes en curso | Los lotes nuevos no aplican el descuento; los que están en curso terminan con su snapshot | Efecto desde el lote siguiente; 0 reinicios; 0 lotes con configuración mezclada |
| 4 | Filtro de precio | Lanza una excepción no controlada en una reserva | Runner | Lote de N reservas | Esa reserva queda `FAILED` con `FILTER_EXCEPTION` y las demás siguen | N−1 reservas con su estado normal; HTTP 200; el proceso no se cae |
| 5 | Cliente HTTP | Lote de 100 reservas con destinos en moneda no-USD | Caché y proveedor de tasas | Caché fría y, después, caliente | Una sola consulta compartida; luego se sirve desde la caché | ≤ 1 llamada HTTP con la caché fría; 0 llamadas durante 1 h con la caché caliente; tiempo del lote con caché caliente `Pendiente de validación` (objetivo ≤ 200 ms en la máquina de desarrollo) |
| 6 | Desarrollador | Corre `npm run verify` | Suite de tests | Sin acceso a internet | Todos los tests pasan | 100 % de los tests en verde sin red; cobertura ≥ 80 % de líneas y ramas; cada filtro se prueba sin levantar Express |
| 7 | Cliente HTTP | Lote con 1 reserva malformada entre N válidas | Source y validación | Operación normal | La malformada queda `REJECTED` (`INVALID_RESERVATION`) y las otras se procesan; si el sobre es inválido, HTTP 400 | 0 excepciones no controladas; N−1 reservas procesadas; la reserva rechazada lleva su `Issue` en `results[i].errors` con HTTP 200, y solo el sobre inválido responde 400 con `{ error: { code, message } }` (R5 F23) |

### 10.4 Vistas y diagramas

Reglas para **todos** los diagramas (`arquitectura.md` §5):
- **Leyenda obligatoria**, incluidos los colores y cada tipo de línea.
- Cada tipo de elemento o conector tiene su propio símbolo, y se reutiliza en todos los diagramas del mismo tipo.
- Se ve el patrón: los filtros se marcan como «filter», las tuberías como «pipe» y hay un source y un sink.
- **Sin flechas dobles** en llamada-respuesta; la flecha va de quien llama a quien es llamado.
- Se distinguen las llamadas **locales o remotas** y **síncronas o asíncronas**.
- Hay refinamiento: D1 → D8 → detalle del proveedor.
- Se hacen **9 diagramas, no 11**: la vista de uso y la de layers comparten diagrama, y la vista de instalación es una tabla (R5 F21, regla de oro 7).

Los diagramas se escriben en **Mermaid** dentro del `.md`, para que GitHub los muestre, y se guardan también en `docs/architecture/diagrams/*.mmd`. D1 y D8 se generan además con **Archify** (HTML + SVG) para la presentación.

| Id | Vista (SADP) | Qué muestra | Notación |
|---|---|---|---|
| D1 | 3.1 Contexto | El sistema como caja. Actores: cliente HTTP y operador (HTTP/JSON, síncrono). Externos: ExchangeRate-API (HTTPS GET remoto síncrono, timeout 5 s) y el destino de los logs (Pino a stdout, JSON). | C&C informal con leyenda |
| D2 | 3.2.1 Descomposición | Paquetes de `src/` según §3 y su jerarquía «es parte de». | Paquetes UML |
| D3 | 3.2.2 Uso **y** 3.2.3 Layers | Capas: HTTP (routes, controllers, middlewares) → Aplicación (services) → Procesamiento (pipeline, filters) → Acceso a datos e integración (repositories, providers); `config`, `shared` y `domain` son transversales. Las flechas «usa» son las permitidas, sin saltos de capa. Se resalta que **ningún filtro usa a otro** y que el filtro 3 usa la **interfaz** del proveedor. | Capas apiladas con «use» y leyenda |
| D4 | 3.2.6 y 3.3.4 Comportamiento | Secuencia de `POST /reservations/process`: controller → service (source) → runner → filtros 1 a 8 → sink → repositorio de estados → respuesta. | Secuencia UML |
| D5 | 3.2.6 y 3.3.4 Comportamiento | Secuencia de la falla de la API: filtro 3 → caché (sin dato o vencido) → proveedor HTTP con 3 intentos y backoff → `stale-cache` o USD con warning. | Secuencia UML |
| D6 | 3.2.6 Comportamiento | Estados de una reserva: `PENDING → PROCESSING → CONFIRMED / REJECTED / FAILED`. | Estados UML |
| D7 | 3.2.3.4 Otras vistas: modelo de datos | `Passenger`, `Flight`, `ReservationInput`, `ReservationContext`, `ReservationResult` y sus relaciones (en memoria, sin base de datos). | Clases UML |
| D8 | 3.3.1 C&C: pipeline | Source → pipe → F1 … F8 → pipe → sink. Las tuberías son llamadas **locales asíncronas** (`await`) que pasan el contexto. Las reservas corren en paralelo. F3 → caché → proveedor → API (remota). Además: el servidor Express, los repositorios (almacenes) y el logger. | C&C con leyenda (filtro, pipe, almacén, conector remoto) |
| D9 | 3.4.1 Despliegue | Nodo «máquina de desarrollo» con el entorno Node.js 22 y el proceso de la app; Postman (cliente); conector HTTPS hacia el nodo externo ExchangeRate-API. | Despliegue UML |

**Catálogos y guías** que acompañan a las vistas:
- **Catálogo de elementos (3.2.4):** una fila por paquete o archivo de `src/` con su responsabilidad. Reutiliza los comentarios de §3.
- **Interfaces (3.2.5 / 3.3.3):**
  - `Filter`: contrato de §3.1, con su semántica (devuelve un contexto nuevo, no lanza por errores de negocio, `critical`).
  - `ExchangeRateProvider`: firma, `RatesResult`, errores y política de timeout y reintentos de §5.
  - Repositorios: búsqueda por id o código.
  - API HTTP: tabla de §7 con sus códigos de error.
- **Guía de variabilidad (3.3):**
  - Habilitar o deshabilitar cada filtro y ajustar sus parámetros: `PUT` global u override por request (§6).
  - Variables de entorno (§11).
  - Cambiar el proveedor de tasas implementando la interfaz.
  - Reemplazar los datos mock por otra fuente cambiando solo los repositorios.
  - Tamaño máximo del lote (100) y del repositorio de estados (1000).

### 10.5 Atributo → táctica → tecnología (anexo A)

| AC | Táctica (Bass) | Implementación |
|---|---|---|
| AC 1 | Timeout / detección de fallas | `AbortSignal.timeout(5000)` en `fetch` |
| AC 1 | Reintento (*retry*) | 3 intentos con backoff 200/400 ms y jitter; solo para errores transitorios |
| AC 1 | Degradación | Tasa vencida (`stale-cache`) y, si no hay, USD con warning |
| AC 1, AC 7 | Validación de la entrada (monitor de condiciones) | Zod en el body, `env` y la respuesta de la API |
| AC 2 | Encapsulamiento, interfaz estable y bajo acoplamiento | Interfaz `Filter`; filtros que no se conocen entre sí |
| AC 2, AC 6 | Usar un intermediario / abstraer servicios comunes | `ExchangeRateProvider` (DIP) con Adapter/ACL |
| AC 3 | Vinculación diferida (configuración en ejecución) | `PUT /pipeline/config` con un snapshot inmutable por lote |
| AC 4 | Aislamiento de fallos / supervisión | Runner con `try/catch` por filtro, criticidad y `context-guard` |
| AC 5 | Mantener copias de los datos (caché) | `CachedExchangeRateProvider` con TTL 1 h y single-flight |
| AC 6 | Interfaces especializadas / fuentes de datos controlables | Reloj inyectable, proveedor falso y app con dependencias inyectadas |
| todos | Observabilidad (monitoreo) | Pino: un log JSON por filtro con `correlationId` y `durationMs` |
| RS 6 | *Fail-fast* en el arranque | `config/env.ts` aborta si la configuración es inválida |

Además, se explica por qué **Pipes & Filters** es un paquete de tácticas: bajo acoplamiento, composición, aislamiento y observabilidad en cada frontera. Se aclara su trade-off: favorece la modificabilidad y la testeabilidad, y penaliza el rendimiento por la indirección (clase del 10/09).

### 10.6 Matriz de trazabilidad (anexo B)

Una fila por RF o AC: **requerimiento → táctica → elemento (paquete o componente) → ADR → test**. No puede quedar ningún RF o AC sin elemento y sin test, ni ningún ADR sin requerimiento. Esto se verifica al cerrar la Fase 3.

### 10.7 Uso de IA (anexo C y README), obligatorio

Tabla **Herramienta · Uso · Partes afectadas · Cómo se verificó**, según las condiciones de uso de IA de la cátedra:

| Herramienta | Uso |
|---|---|
| Claude Code (Claude Opus 5) | Análisis de la consigna, plan, interrogatorio de decisiones, implementación o revisión (según la ruta de la Fase 3) y redacción de la documentación. |
| Antigravity (`agy`, Gemini) | Revisión adversarial del plan (4 rondas registradas en `PLAN-REVIEW-LOG.md`) y auditoría del código (Fase 3). |
| Devin (`devin-local`) | Plan externo comparado; de ahí se tomaron el filtro 8, la documentación y los riesgos. |

- **Verificación:** `npm run verify`; totales de precio calculados a mano (§9); API real probada con curl y Postman; arbitraje de cada hallazgo, con su justificación, en el log.
- Todas las decisiones deben poder defenderse de forma individual; la defensa es obligatoria y eliminatoria.

### 10.8 ADRs: `docs/adr/ADR-00N-<slug>.md`

Siguen la **plantilla oficial en español** (Merson): un párrafo inicial con las fuerzas y el contexto, y después **Decisión** (voz activa, "Nosotros haremos…"), **Justificación** (con las alternativas rechazadas), **Estado** y **Consecuencias** (positivas **y negativas**). Cada ADR ocupa 1 o 2 páginas y va numerado.

- El estado es `Propuesto` hasta que el código exista y pase a `Aceptado`.
- Las rondas de revisión se citan como alternativas descartadas.
- Cada ADR se enlaza desde la sección "Decisiones de diseño" de la vista correspondiente.

| ADR | Decisión | Alternativas rechazadas (fuente) | Vistas |
|---|---|---|---|
| 001 | Pipes & Filters en el mismo proceso, dentro de capas estrictas | Service con una sola función; pipeline distribuido con colas (sobreingeniería, clase del 10/09) | 3.2.3, 3.3 |
| 002 | Contexto inmutable por reserva, precio acumulado (`currentPrice`), `context-guard` y **validación con Zod en las 3 fronteras con *fail-fast* de la configuración** (R5 F24) | Contexto mutable compartido; recalcular descuentos en el filtro 7 (R1 F4); validación manual con `if`; confiar en los tipos de TypeScript, que no existen en ejecución | 3.2.5, 3.3 |
| 003 | Fallos según la criticidad del filtro; el pipeline nunca lanza (Q1) | Seguir siempre; cortar al primer error | 3.3 |
| 004 | Fórmula de precio encadenada (Q2) | Descuentos sumados; combustible sobre la tarifa base | 3.2.6 |
| 005 | ExchangeRate-API con timeout, reintentos, caché, single-flight y tasa vencida (Q3) | Tabla fija de tasas; tasa 1 con la moneda local (R1 F7); Fixer, CurrencyAPI u Open Exchange Rates (necesitan clave) | 3.3, 3.4.1 |
| 006 | Configuración: orden fijo, PUT global con snapshot por lote y override por request sin `exchange` (Q4, R1 F5) | Reordenar filtros; override que modifica la configuración global | 3.3 (variabilidad) |
| 007 | Separar la obtención de la tasa (filtro 3) de la conversión (filtro 8) | Conversión en el sink (R1 F1); un único filtro de cambio al final (se aparta del orden de la consigna) | 3.3 |
| 008 | Estado y datos en memoria; procesamiento síncrono; sin descontar asientos (Q5) | Procesamiento asíncrono con 202 (choca con el tiempo total pedido); descontar asientos (race condition) | 3.4.1 |

Pino no lleva ADR porque es una decisión de detalle (R5 F24). Se justifica en las "Decisiones de diseño" de la vista C&C (3.3.6): un log por filtro con `correlationId`, en lugar de `console.log`, que es bloqueante y no tiene estructura.

`docs/plan/` guarda `PLAN.md` y `PLAN-REVIEW-LOG.md` como evidencia del proceso de diseño.

**Checklist de cierre de la documentación** (de `arquitectura.md` §9): carátula; RF, AC y RS con IDs; 7 escenarios con medida; D1 a D9 con leyenda y sin flechas dobles; catálogos e interfaces; variabilidad; ADRs con Estado y consecuencias negativas; layers ≠ tiers; trazabilidad sin huecos; "Uso de IA"; diagramas contrastados con el código.

## 11. Variables de entorno

| Variable | Valor por defecto / regla |
|---|---|
| `PORT` | 3000 |
| `EXCHANGE_API_BASE_URL` | `https://api.exchangerate-api.com/v4/latest` |
| `LOG_LEVEL` | `info` |

`.env.example` versionado y `.env` en `.gitignore`.

## 12. Trade-offs asumidos

- Indirección (8 filtros, contexto inmutable, guard) a cambio de modificabilidad y testeabilidad.
- El orden fijo de los filtros resigna flexibilidad para evitar configuraciones inválidas.
- El procesamiento síncrono limita el tamaño del lote (100 reservas), pero permite devolver el tiempo total que pide la consigna.
- Usar una tasa vencida (`stale-cache`) prioriza la disponibilidad sobre la exactitud; el warning lo hace visible.
- Los resultados se guardan solo en memoria: se pierden al reiniciar.
- El filtro 8 es uno más de los 7 que pide la consigna, a cambio de que el sink no calcule nada (ADR-007).

## 12.1 Riesgos y limitaciones conocidas

- **`PUT /pipeline/config` y `POST /pipeline/cache/invalidate` no tienen autenticación**: cualquiera que llegue al puerto puede cambiar precios. Es una limitación deliberada del alcance académico, documentada en el README y en ADR-006.
- **No escala horizontalmente**: configuración, caché y resultados viven en la memoria del proceso, así que dos instancias responderían distinto (ADR-008).
- **ExchangeRate-API v4 está marcada como legada**: la respuesta real (verificada el 17/09/2026) trae `"WARNING_UPGRADE_TO_V6"`. Puede dejar de funcionar o limitar pedidos. Mitigación: la URL es configurable (`EXCHANGE_API_BASE_URL`), el proveedor está detrás de una interfaz y, si falla, se usa la tasa vencida o se sigue en USD. El esquema Zod ignora los campos extra (`provider`, `terms`, `date`, `time_last_updated`).
- **Los tests nunca usan la red**: la API real solo se prueba a mano con Postman.

## 13. No-objetivos

- Base de datos real.
- Autenticación.
- Descontar asientos o manejar inventario.
- Procesamiento asíncrono o colas.
- Reordenar filtros.
- Pagos.
- Docker (opcional, fuera del alcance).
- Múltiples monedas base (todo parte de USD).

## 14. Flujo de trabajo en git

- Se trabaja **solo en la rama que crea el usuario** en `ejercicio1-arq-2026`; nunca en `main`.
- Commits chicos por paso (proyecto base, dominio, pipeline, filtros, proveedor, HTTP, tests, Postman, docs), **sin líneas de atribución de Claude ni links de sesión**.
- No se hace push ni PR sin pedido explícito del usuario.
- `.gitignore`: `node_modules/`, `dist/`, `coverage/`, `.env`.
