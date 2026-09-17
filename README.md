# Sistema de Reservas de Vuelos — Pipes & Filters

Backend en Node.js + TypeScript + Express que procesa lotes de reservas de vuelo a traves de un pipeline de filtros independientes. Cada filtro valida, enriquece o calcula una parte del precio, y el contexto de la reserva fluye de un filtro al siguiente.

- Estilo arquitectonico: **Pipes & Filters** en proceso.
- Integracion externa: **ExchangeRate-API** (sin API key) con timeout, reintentos, cache y tasas de respaldo.
- Documentacion arquitectonica: [`docs/architecture/architecture.md`](docs/architecture/architecture.md), ADRs en [`docs/adr`](docs/adr) y escenarios de calidad en [`docs/architecture/quality-scenarios`](docs/architecture/quality-scenarios).

## Requisitos

- Node.js >= 20 (probado con v22.22.3)
- npm >= 10

## Instalacion

```bash
npm install
```

## Ejecucion

```bash
npm run dev      # modo desarrollo con recarga (tsx watch)
npm run build    # compila TypeScript a dist/
npm start        # ejecuta dist/server.js
```

El servidor escucha en `http://localhost:3000` (configurable con la variable de entorno `PORT`). El nivel de log se controla con `LOG_LEVEL` (`debug`, `info`, `warn`, `error`).

## Pruebas

```bash
npm test             # 58 pruebas unitarias y de integracion
npm run test:coverage
npm run typecheck    # tsc estricto sobre src y tests
```

Las pruebas nunca llaman a la API externa: el proveedor de tasas y el transporte HTTP se inyectan.

## Endpoints

| Metodo | Ruta | Descripcion |
|---|---|---|
| `POST` | `/reservations/process` | Procesa un array de reservas a traves del pipeline |
| `GET` | `/reservations/:id/status` | Resultado del ultimo procesamiento de una reserva |
| `GET` | `/pipeline/config` | Configuracion vigente del pipeline |
| `PUT` | `/pipeline/config` | Modifica parcialmente la configuracion de los filtros |
| `POST` | `/pipeline/config/reset` | Restaura la configuracion por defecto e invalida la cache de tasas |
| `GET` | `/health` | Chequeo de vida |

### POST /reservations/process

Request:

```json
{
  "reservations": [
    {
      "reservationId": "R-1001",
      "passengerId": "P012",
      "flightCode": "AA001",
      "origin": "EZE",
      "destination": "MIA",
      "seatClass": "economy",
      "seats": 1
    }
  ],
  "config": { "enabledFilters": { "loyaltyDiscount": false } }
}
```

`config` es opcional y aplica **solo a ese request**, sin mutar la configuracion global.

Response:

```json
{
  "processingTimeMs": 12.4,
  "summary": { "total": 1, "processed": 1, "processedWithWarnings": 0, "rejected": 0, "failed": 0 },
  "results": [
    {
      "reservationId": "R-1001",
      "status": "processed",
      "passenger": { "id": "P012", "fullName": "Luis Fernandez", "passengerType": "adult", "loyaltyTier": "none" },
      "flight": { "flightCode": "AA001", "origin": "EZE", "destination": "MIA", "destinationCountryCode": "US" },
      "pricing": {
        "flightBasePriceUsd": 450,
        "classAdjustedPriceUsd": 450,
        "loyaltyDiscountUsd": 0,
        "passengerTypeDiscountUsd": 0,
        "netPriceUsd": 450,
        "taxesUsd": 54,
        "airportFeeUsd": 25,
        "fuelSurchargeUsd": 36,
        "totalUsd": 565
      },
      "currency": { "baseCurrency": "USD", "targetCurrency": "USD", "rate": 1, "rateSource": "identity" },
      "errors": [],
      "warnings": [],
      "trace": [{ "filter": "validatePassenger", "status": "executed", "durationMs": 0.6 }]
    }
  ]
}
```

Estados posibles de una reserva:

| Estado | Significado |
|---|---|
| `processed` | Procesada sin errores ni warnings |
| `processed_with_warnings` | Procesada, con avisos no bloqueantes (por ejemplo, tasa de respaldo) |
| `rejected` | Error de negocio detectado por un filtro de validacion |
| `failed` | Un filtro lanzo una excepcion inesperada |

El campo `trace` indica, por filtro, si fue `executed`, `skipped` (reserva ya rechazada), `disabled` (apagado por configuracion) o `failed`.

## Pipeline de filtros

Orden por defecto:

1. `validatePassenger` — existencia, estado activo, contacto y coherencia edad/tipo.
2. `validateFlight` — existencia, asientos disponibles, ruta y fecha futura.
3. `exchangeRateEnrichment` — detecta la moneda del pais de destino y obtiene la tasa vigente (unica llamada externa).
4. `basePrice` — precio base x asientos x multiplicador de clase.
5. `loyaltyDiscount` — descuento por tier de lealtad.
6. `passengerTypeAdjustment` — ajuste por tipo de pasajero.
7. `taxesAndFees` — impuestos, tasa de aeropuerto y sobrecargo por combustible.
8. `currencyConversion` — aplica la tasa ya obtenida sobre el total final.

### Por que el tipo de cambio esta partido en dos filtros

La consigna ubica el filtro de tipo de cambio en la posicion 3, antes del calculo del precio. Convertir un precio que todavia no existe no tiene sentido, por lo que la responsabilidad se dividio: `exchangeRateEnrichment` conserva la posicion 3 y hace la llamada externa (deteccion de moneda, timeout, reintentos, cache, fallback), y `currencyConversion` aplica la tasa al cierre del pipeline, cuando ya hay un total. La justificacion completa esta en [ADR-007](docs/adr/ADR-007-orden-pipeline-tipo-de-cambio.md).

### Reglas de negocio

Todas viven en la configuracion, no en el codigo de los filtros:

| Regla | Valor por defecto |
|---|---|
| Clase economy / business / first | x1 / x2.5 / x4 |
| Lealtad bronze / silver / gold | 5% / 10% / 15% |
| Tipo child (<12) / adult / senior (>65) | 25% / 0% / 15% |
| Impuestos | 12% del precio neto |
| Tasa de aeropuerto | USD 25 fijos |
| Sobrecargo por combustible | 8% del precio base del vuelo |

Los descuentos se aplican **en cascada**, en el orden de los filtros: el descuento por tipo de pasajero se calcula sobre el precio ya descontado por lealtad.

Ejemplo (nino silver en business, vuelo IB6841 de USD 890):

```
890 x 2.5            = 2225.00   precio ajustado por clase
- 10% lealtad        = 2002.50
- 25% tipo pasajero  = 1501.87   precio neto
+ 12% impuestos      =  180.22
+ tasa aeropuerto    =   25.00
+ 8% combustible     =   71.20   (sobre los 890 originales)
= total              = 1778.29 USD
```

## Integracion con la API de tipo de cambio

- Proveedor: `https://api.exchangerate-api.com/v4/latest/{base}` (sin autenticacion).
- Timeout de 5 s por intento (`AbortController`), hasta 3 intentos con backoff lineal.
- Cache en memoria de las tasas por moneda base, TTL de 1 hora, invalidable con `POST /pipeline/config/reset` o al modificar `exchangeRate` via `PUT /pipeline/config`.
- Si la API falla, se usa la tasa de respaldo configurada y se agrega el warning `EXCHANGE_RATE_FALLBACK`. Si tampoco hay respaldo para la moneda, la reserva continua en USD con el warning `EXCHANGE_RATE_UNAVAILABLE`.
- El mapa pais -> moneda esta en `src/services/exchangeRate/countryCurrency.ts` (`AR` -> `ARS`, `BR` -> `BRL`, `US` -> `USD`, `ES`/`IT`/`FR` -> `EUR`, etc.).

Ningun fallo de la integracion externa rechaza una reserva.

## Configuracion del pipeline

`GET /pipeline/config` devuelve el objeto completo. `PUT /pipeline/config` acepta un parche parcial validado:

```json
{
  "enabledFilters": { "currencyConversion": false },
  "loyaltyDiscounts": { "gold": 0.2 },
  "taxes": { "airportFeeUsd": 30 },
  "filterOrder": ["validatePassenger", "validateFlight", "basePrice", "taxesAndFees"],
  "exchangeRate": { "timeoutMs": 3000, "maxRetries": 2, "cacheTtlMs": 600000 }
}
```

Claves desconocidas o valores fuera de rango devuelven `400 INVALID_CONFIG` con el detalle por campo.

## Datos de prueba

Los datos mock se cargan en memoria al iniciar la aplicacion.

Pasajeros (`src/data/mockPassengers.ts`):

| ID | Edad | Tipo | Lealtad | Pais | Activo | Uso |
|---|---|---|---|---|---|---|
| P001 | 34 | adult | gold | AR | si | descuento por lealtad maximo |
| P002 | 41 | adult | silver | BR | si | caso general |
| P003 | 8 | child | silver | ES | si | descuentos combinados |
| P004 | 71 | senior | gold | US | si | multiples ajustes |
| P005 | 29 | adult | bronze | MX | si | descuento minimo |
| P006 | 50 | adult | silver | IT | **no** | validacion de estado |
| P007 | 68 | senior | silver | BR | si | senior con lealtad |
| P008 | 10 | child | none | AR | si | nino sin lealtad |
| P009 | 9 | adult | none | CL | si | incoherencia edad/tipo |
| P010 | 70 | adult | bronze | PE | si | incoherencia edad/tipo |
| P011 | 37 | adult | none | UY | si | contacto invalido |
| P012 | 45 | adult | none | US | si | caso base sin descuentos |

Vuelos (`src/data/mockFlights.ts`): `AA001` EZE-MIA (450 USD, 12 asientos), `LA4567` EZE-GRU (180, 3), `IB6841` EZE-MAD (890, 40), `AR1140` AEP-MDZ (95, 60), `AM0404` MEX-JFK (320, **0 asientos**), `AF0416` CDG-EZE (1100, 8), `LA800` SCL-LIM (210, 25), `QF0012` SYD-LAX (1450, 5), `LA4570` EZE-GRU (**fecha ya pasada**).

Las fechas de salida se calculan relativas al momento de carga para que los datos no caduquen.

## Coleccion de Postman

`postman/flight-reservations.postman_collection.json` — importar en Postman y ajustar la variable `baseUrl`. Incluye los grupos: flujo basico, calculo de precios, integracion con tipo de cambio (incluidos fallback y timeout forzados) y configuracion del pipeline.

## Estructura del proyecto

```
src/
  app.ts, server.ts            arranque HTTP
  api/                         rutas, validacion con zod, manejo de errores
  config/pipelineConfig.ts     configuracion mutable del pipeline
  data/                        datos mock de pasajeros y vuelos
  domain/                      tipos y contexto de reserva
  pipeline/                    orquestador, contrato de filtro, registry y filtros
  repositories/                acceso de lectura a los datos mock
  services/exchangeRate/       puerto, cliente HTTP, cache y mapa de monedas
  services/                    servicio de procesamiento y proyeccion de resultados
  store/processingStore.ts     estado de procesamiento por reserva
  support/                     logger y utilidades monetarias
tests/                         pruebas unitarias por filtro e integracion HTTP
docs/                          documentacion arquitectonica y ADRs
postman/                       coleccion de ejemplos
```

## Limitaciones conocidas

- Todo el estado (configuracion, cache de tasas, resultados) vive en memoria del proceso: se pierde al reiniciar y no es compartido entre instancias.
- `PUT /pipeline/config` no tiene autenticacion; en un entorno real requeriria control de acceso.
- El pipeline procesa las reservas de un lote de forma secuencial.
- Los precios base se asumen en USD, segun la consigna.
