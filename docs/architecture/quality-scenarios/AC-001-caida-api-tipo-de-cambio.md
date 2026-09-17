# AC-001: Caida o timeout de la API de tipo de cambio

- **Atributo de calidad:** Disponibilidad ante fallo de un tercero (QA-02)
- **RF relacionado:** RF-05 (enriquecimiento con tipo de cambio), RF-01 (procesar lote)
- **Prioridad:** Alta
- **Estado de evidencia:** Confirmada

## Escenario

- **Fuente:** Proveedor externo ExchangeRate-API.
- **Estimulo:** La API no responde dentro del timeout, responde con un estado HTTP de error o la conexion falla.
- **Entorno:** Operacion normal, procesando un lote de reservas; no hay una tasa vigente en cache para la moneda base.
- **Artefacto:** `ExchangeRateApiClient` y el filtro `exchangeRateEnrichment`.
- **Respuesta:** Cada intento se aborta al vencer el timeout; se reintenta hasta el maximo configurado; al agotarse, se aplica la tasa de respaldo configurada y se agrega el warning `EXCHANGE_RATE_FALLBACK`. Si tampoco existe respaldo para esa moneda, la reserva continua en USD con el warning `EXCHANGE_RATE_UNAVAILABLE`. En ningun caso la reserva se rechaza ni el lote se interrumpe.
- **Medida de respuesta:** Timeout de 5000 ms por intento y 3 intentos como maximo por defecto (`DEFAULT_PIPELINE_CONFIG.exchangeRate`), es decir un techo de ~15 s por moneda base en el peor caso. Verificacion manual con host inalcanzable y `timeoutMs: 400`, `maxRetries: 2`: lote resuelto en 1020 ms, estado `processed_with_warnings`, `rateSource: "fallback"`. Techo aceptable de latencia por lote: `Pendiente de validacion`.

## Impacto arquitectonico

- Obliga a un puerto de integracion (`ExchangeRateProvider`) para poder sustituir el proveedor y probar el fallo sin red.
- Obliga a que el filtro trate el error como warning y no como rechazo, lo que requiere el modelo de severidades del contexto.
- Requiere tasas de respaldo como parte de la configuracion del pipeline.

## Tacticas relacionadas

- Timeout con `AbortController`: acota la deteccion del fallo y evita bloqueo indefinido.
- Reintento con backoff lineal: absorbe fallos transitorios de red.
- Fallback a valor configurado: mantiene el servicio disponible con precision degradada.
- Degradacion elegante (continuar en USD): preserva el resultado principal del pipeline.

## Evidencia

- Consigna: "La API de tipo de cambio es externa - si falla, el procesamiento continua con warnings y precios en USD".
- `src/services/exchangeRate/exchangeRateApiClient.ts`.
- `tests/services/exchangeRateApiClient.test.ts`: "aborta la llamada cuando se excede el timeout y usa el respaldo", "cae a la tasa de respaldo cuando se agotan los reintentos", "trata un estado HTTP de error como fallo de la integracion".
- `tests/api/reservations.routes.test.ts`: "continua en USD con warning cuando la API de tipo de cambio falla".

## Preguntas pendientes

- Cuanto tiempo puede operar el sistema con tasas de respaldo antes de que el precio convertido deje de ser aceptable para el negocio.
- Si conviene incorporar un circuit breaker para no pagar el timeout por cada moneda base cuando el proveedor esta caido de forma sostenida.
