# BUILD-TASKS — Ajustes para que el código cumpla `docs/plan/PLAN.md` (v7)

- **Rama:** `version/claude-antigravity`.
- **Punto de partida:** el commit `bede58d`, hecho a partir del plan externo. Compila y pasan sus 58 tests.
- **Decisión (17/09/2026):** se **ajusta** lo que ya existe; no se reescribe desde cero. La base, con 8 filtros, inyección de dependencias, configuración por request y sobre `{ reservations, config }`, ya coincide con el plan.
- **Reparto (ruta B):** Antigravity construye y Claude revisa el diff y corre `npm run verify`.

## Reglas para quien construye

1. **Fuentes de verdad, en este orden:**
   1. `docs/plan/PLAN.md`.
   2. `docs/plan/CONSIGNA.md`.
   3. `docs/plan/REGLAS-CATEDRA.md`, solo para la documentación.
   4. `AGENTS.md`, para las convenciones del código.
   - Si algo del código actual contradice el PLAN, gana el PLAN, salvo en los desvíos aceptados que se listan abajo.
2. Trabajar **una fase por vez**. Al terminar cada fase, dejar `tsc` (src y tests) y, desde F1, `eslint` en verde (ver regla 4).
3. **No hacer commits, push, ni cambiar de rama.** Los commits los hace el revisor después de revisar.
4. **Quien construye NO ejecuta Jest** (`npm test`, `npm run verify` ni `jest`): dentro del entorno del agente, Jest se cuelga sin mostrar nada, incluso con `--runInBand`. Para verificar su trabajo usa solo `npx tsc -p tsconfig.json --noEmit`, `npx tsc -p tsconfig.test.json` y `npx eslint .` (este último desde F1). Igual escribe y actualiza los tests. **El revisor corre `npm run verify`** y le devuelve los fallos. El script `test` de `package.json` queda como `jest --ci --runInBand`. Si cualquier comando tarda más de 3 minutos, cortarlo y reportarlo.
5. Los tests nunca usan la red. No agregar dependencias fuera de las nombradas acá.
6. Al terminar cada fase, reportar:
   - Los archivos tocados.
   - La salida resumida de la verificación.
   - Cualquier punto del PLAN que no se pudo cumplir, y por qué.

## Desvíos aceptados por el usuario (no cambiar; documentar en el README y en `architecture.md`)

- **D1.** El lote se procesa **en secuencia**, no con `Promise.all`. La caché con single-flight igual se implementa (F5), por si hay requests concurrentes.
- **D2.** Se mantienen **ts-jest y tsx** (en lugar de babel-jest y `node --watch`).
- **D3.** Los enums quedan **en minúscula** (`gold`, `child`, `economy`). Donde el PLAN diga `GOLD`, `CHILD`, etc., se usa la minúscula. Los códigos de error y los estados siguen en MAYÚSCULA.

## F1 — Base del proyecto (PLAN §2, §11, §14)

- `engines.node` debe ser `>=22`.
- Agregar `.npmrc` con `save-exact=true`. Las dependencias nuevas van con versión exacta.
- Agregar el script `verify` = `typecheck && lint && test` (lo corre el revisor). Jest debe tener un umbral de cobertura de 80% en líneas y ramas.
- **Variables de entorno:**
  - Agregar `src/config/env.ts`, con Zod y *fail-fast*, para `PORT` (3000), `EXCHANGE_API_BASE_URL` (`https://api.exchangerate-api.com/v4/latest`) y `LOG_LEVEL` (`info`).
  - Agregar `.env.example`; `.env` va en `.gitignore`.
  - `npm start` y `npm run dev` cargan el entorno con `--env-file-if-exists=.env`.
- **Quitar `apiBaseUrl` de la configuración modificable por PUT.** La URL sale solo del entorno; poder cambiarla por la API es un riesgo de seguridad.
- **Pino:**
  - Reemplazar `src/support/logger.ts` por una implementación con **Pino** que mantenga la interfaz `Logger`. En los tests debe quedar silencioso.
  - El runner registra un log por filtro con `{ pipeline, reservationId, correlationId, filter, status, durationMs }`.
  - `correlationId` se genera por request HTTP.
- **ESLint:**
  - Usar `typescript-eslint` strict (flat config).
  - En `src/`, `max-lines-per-function: { max: 15, skipBlankLines: true, skipComments: true }`; los tests quedan excluidos de esa regla.
  - Refactorizar hasta que `npm run lint` pase, sin desactivar reglas con comentarios.

## F2 — Contrato de entrada, datos mock y estados (PLAN §3.4, §7, §8)

- **Contrato de cada reserva:**
  - `{ id?, passengerId, flightCode, origin, destination, departureDate: 'YYYY-MM-DD', seatClass, passengerType }`.
  - Eliminar `seats` y `reservationId`: el campo pasa a llamarse `id`.
- **El sobre** es `{ reservations: unknown[] (1..100), config? }`:
  - **Cada reserva se valida por separado.** Una reserva inválida queda `REJECTED` con el error `INVALID_RESERVATION` en `results[i].errors`, con HTTP 200, y el resto del lote sigue.
  - Solo un sobre inválido devuelve 400 con `{ error: { code, message, details? } }`.
  - Los ids repetidos solo se controlan **entre los ids enviados**. Si falta el id, se genera un UUID, también para las reservas malformadas.
- **Modelo del pasajero:** `Passenger` tiene `birthDate` (ISO), no `age` ni `passengerType`.
  - La edad se calcula en años cumplidos a `reservation.departureDate`, en `src/domain/age.ts`.
  - Reglas: child < 12, senior > 65, adult de 12 a 65 inclusive.
  - Si el `passengerType` declarado no coincide con la edad → `PASSENGER_TYPE_MISMATCH`.
- **Modelo del vuelo:** `Flight` tiene `originCountry`, `destinationCountry`, `departureAt` (ISO), `durationMinutes`, `baseFare` y `availableSeats`.
- **Reloj inyectable:** agregar `src/shared/clock.ts` (o `src/support/clock.ts`).
  - Los mocks se construyen con `buildMockPassengers(now)` y `buildMockFlights(now)`; eliminar el uso de `Date.now()` en los datos.
- **Datos mock:** exactamente los de PLAN §8, con los mismos ids y la misma semántica: P001–P009, AA001, LA4567, IB6841, AF0010, AA0002 y UX0099. Se pueden conservar mocks extra si no rompen esos casos.
- **Estados** de la reserva: `PENDING | PROCESSING | CONFIRMED | REJECTED | FAILED`.
  - Se marca `PROCESSING` al empezar.
  - Los warnings no cambian el estado: una reserva con warnings queda `CONFIRMED`.
  - `summary` = `{ total, confirmed, rejected, failed }`.
- **Store de resultados:** acotado a 1000 entradas; al llenarse descarta las más viejas (FIFO).
  - `GET /reservations/:id/status` devuelve `{ reservationId, status, updatedAt, result? }`, o 404.
- **Pendiente de F1 (revisión):** el middleware de `x-correlation-id` acepta cualquier valor que mande el cliente. Hay que validarlo (string, `^[A-Za-z0-9-]{1,64}$`) y, si no cumple, generar un UUID, para evitar la inyección de texto en los logs.
- **Códigos de error de las validaciones** (PLAN §4): `PASSENGER_NOT_FOUND`, `PASSENGER_INACTIVE`, `INVALID_CONTACT`, `PASSENGER_TYPE_MISMATCH`, `FLIGHT_NOT_FOUND`, `NO_SEATS`, `ROUTE_MISMATCH`, `FLIGHT_DEPARTED`, `DATE_MISMATCH`.

## F3 — Runner y contexto (PLAN §3.1–§3.4, §6)

- **Pendientes de la revisión de F2:**
  - Quitar los alias heredados de `Passenger` (`countryCode`) y de `Flight` (`destinationCountryCode`, `departureDate`, `basePriceUsd`); usar solo los nombres del PLAN.
  - En los mocks, calcular `birthDate` desde `now` con edad **exacta** (restar años al mismo día y mes de `now`, menos un día), para que la edad no dependa de la fecha en que corren los tests.
  - Borrar el test `it.skip` de reordenamiento en `tests/api/pipeline.routes.test.ts`, porque el orden pasa a ser fijo, y reemplazarlo por un test de que `filterOrder` en el PUT → 400.

- **Orden fijo de los filtros:** eliminar `filterOrder` de la configuración y del PUT. Una clave desconocida en el PUT → 400 (`.strict()`).
- **Contrato del filtro:**
  - `Filter` tiene `critical: boolean`.
  - Los filtros **devuelven un contexto nuevo** y no mutan el que reciben; alcanza con una copia superficial de los objetos que tocan.
  - Críticos: las validaciones y los filtros de precio.
  - No críticos: `exchangeRateEnrichment` y `currencyConversion`. Si uno de estos lanza una excepción, se agrega el warning `FILTER_EXCEPTION` y el pipeline sigue.
  - Si un filtro crítico lanza una excepción → `FAILED`.
- **`context-guard`** se ejecuta después de cada filtro:
  - Todos los montos deben ser finitos y >= 0.
  - Si falla → error `DATA_CORRUPTED`, estado `FAILED`, y los filtros restantes quedan `NOT_RUN`.
- **Estados de la traza:** `COMPLETED | SKIPPED | FAILED | NOT_RUN`.
  - Filtro deshabilitado = `SKIPPED`.
  - Filtros posteriores a un rechazo = `NOT_RUN`.
- **Source:** si el vuelo existe, inicializa `pricing.baseFare = classPrice = currentPrice = flight.baseFare`.
  - Así, deshabilitar cualquier filtro de precio no genera `NaN` ni rechazo.
  - Si falta un dato que un filtro de precio necesita → error `MISSING_DATA` → `REJECTED`.
- **Redondeo:** los filtros **no redondean**. Solo el sink redondea, con `round2`.
- **Configuración:**
  - La configuración global es inmutable y se reemplaza entera en cada PUT.
  - Cada lote toma una copia (snapshot) al empezar.
  - El `config` que llega en un POST **no puede incluir `exchangeRate`/`exchange`** (400 si viene) y no modifica la configuración global.

## F4 — Precio (PLAN §4, Q2)

- **Pendiente de la revisión de F2:** quitar el `it.skip` de los tests de totales en `tests/filters/pricing.filters.test.ts`. El de P004 debe esperar 3740.20, y hay que agregar el de P009 = 3397.48.

- **Filtro 4:** `classPrice = baseFare × multiplicador`; `currentPrice = classPrice`.
- **Filtros 5 y 6:** descuentan sobre `currentPrice`, encadenados. Si están deshabilitados, no tocan `currentPrice`.
- **Filtro 7:**
  - `subtotal = currentPrice`.
  - `taxes = subtotal × 0.12`.
  - **`fuelSurcharge = classPrice × 0.08`**. Hoy se calcula sobre la tarifa base del vuelo, y eso está mal.
  - `airportFee = 25`.
  - `total = subtotal + taxes + fuelSurcharge + airportFee`.
- **Totales exactos que los tests deben verificar:**
  - P007 economy en AA001 → **565.00**.
  - P001 economy en AA001 → **489.40**.
  - P008 business en LA4567 → **422.00**.
  - P009 first en IB6841 → **3397.48**.
  - P004 first en IB6841 → **3740.20**.

## F5 — Tipo de cambio (PLAN §5, Q3, filtros 3 y 8)

- **Interfaz del proveedor:** `getRates(base, { timeoutMs, maxAttempts, cacheTtlMs })` → `{ rates, source: 'api'|'cache'|'stale-cache', fetchedAt }`.
  - Las opciones salen del snapshot global de la configuración.
  - Si no hay tasa posible, se lanza `ExchangeRateError`.
- **Cliente HTTP:**
  - Timeout de 5 s por intento, con `AbortSignal.timeout`.
  - **3 intentos en total**, con esperas de 200 y 400 ms y jitter de ±20%.
  - Reintenta solo ante errores de red, timeout, 5xx o 429. No reintenta otros 4xx ni un esquema inválido.
  - La respuesta se valida con Zod: `{ base, rates: record<positive> }`. Los campos extra se ignoran.
- **Caché:**
  - TTL de 1 h.
  - **Single-flight:** la promesa en curso se borra en un `finally`.
  - Guarda la última tasa aunque venza, para usarla como `stale-cache`.
  - Se invalida con `POST /pipeline/cache/invalidate` → 204. Reemplaza a `/pipeline/config/reset`; si se quiere conservar ese reset, documentarlo.
- **Eliminar `fallbackRates`.** Si la API falla: se usa la tasa vencida (warning `STALE_RATE`); si no hay, **no se guarda ninguna tasa** y el warning es `EXCHANGE_RATE_UNAVAILABLE`.
  - Otros warnings: `UNKNOWN_CURRENCY` y `EXCHANGE_RATE_SKIPPED_NO_FLIGHT`.
  - Tabla de monedas por país según PLAN §4.
- **Filtro 3:** solo guarda `ctx.exchangeRate = { currency, rate, source, fetchedAt }`.
- **Filtro 8:**
  - Si hay tasa y montos: `baseFareLocal = baseFare × rate` y `totalLocal = (total ?? currentPrice) × rate`.
  - Si falta algo, no hace nada.
- **Salida:** `conversion` = `{ currency, rate, source, fetchedAt, baseFareLocal?, totalLocal? }`, o `null` si no hubo tasa.
  - Si el filtro 8 está deshabilitado, los campos locales **se omiten** (nunca valen `null`).

## F6 — Tests (PLAN §9)

- **Pendiente de F1 (revisión):** el script `test` debe pasar a `jest --ci --runInBand --coverage`, para que `verify` aplique el umbral del 80%. Hoy las ramas están en 79,42%: los tests nuevos tienen que subirlas por encima del umbral.

- **Unitarios:** un archivo por filtro, con cada código de error.
  - Bordes de edad 11/12 y 65/66.
  - Runner: `SKIPPED`, `NOT_RUN`, excepción crítica y no crítica, guard.
  - Proveedor: timeout, reintentos, sin reintento ante 4xx, esquema inválido, TTL, single-flight, tasa vencida, invalidación. Usar fake timers.
  - Configuración: merge y validación.
- **Integración con Supertest:** los 16 casos de la consigna, tal como los mapea PLAN §9.
  - Endpoints: status 200/404, config GET/PUT 200/400, y que el override por request no modifique la configuración global.
  - Filtro 8.
  - Los escenarios AC 1–AC 7 con las medidas de PLAN §9.
- **Aislamiento de la red:** un `fetch` global falso que falla si se lo llama sin mock.
- Borrar o adaptar los tests viejos que ya no correspondan.

## F7 — Postman, README y documentación (PLAN §10)

- **Postman:**
  - Actualizar `postman/flight-reservations.postman_collection.json` con el contrato nuevo.
  - Un request por endpoint, más un ejemplo por cada caso de prueba, con la response guardada.
- **README:**
  - Arquitectura, instalación, variables de entorno, ejecución, tests.
  - Desvíos D1–D3, riesgos (PLAN §12.1) y sección **"Uso de IA"** (PLAN §10.7).
- **Documentación de arquitectura:**
  - Reescribir `docs/architecture/architecture.md` con la **estructura del SADP 2.0** de PLAN §10.1–§10.6.
    - IDs `RF n`, `AC n`, `RS n`.
    - Los **7 escenarios dentro del documento**.
    - Anexos A (atributo → táctica → tecnología), B (trazabilidad) y C (uso de IA).
  - **Borrar** `docs/architecture/quality-scenarios/`.
  - Reescribir `docs/adr/` con los **8 ADR de PLAN §10.8**, usando la plantilla en español de `REGLAS-CATEDRA.md`.
    - ADR-002 pasa a ser "contexto inmutable, *context-guard* y validación en las fronteras".
    - Eliminar los ADR que no correspondan.
  - Diagramas en Mermaid dentro de los `.md`, siguiendo las reglas de diagramas de `REGLAS-CATEDRA.md`: leyenda obligatoria y distinción entre llamadas locales y remotas.
- Actualizar `AGENTS.md` para que refleje lo nuevo.
