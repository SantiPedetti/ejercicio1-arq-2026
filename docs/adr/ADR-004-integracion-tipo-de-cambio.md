# ADR-004: Integracion resiliente con la API de tipo de cambio

- **Estado:** Aceptado
- **Fecha:** 2026-09-17
- **Responsables:** Equipo de desarrollo del ejercicio
- **Estado de evidencia:** Confirmada

## Contexto

El pipeline necesita la cotizacion de la moneda del pais de destino para convertir el total. Esa informacion viene de un tercero gratuito, sin SLA y con cuota mensual, y la consigna fija los parametros de resiliencia: timeout maximo de 5 segundos, hasta 3 reintentos, cache de tasas por 1 hora con invalidacion manual, fallback a una tasa por defecto y logging de los errores de integracion. Tambien aclara que, si la API falla, el procesamiento continua con warnings y precios en USD.

La consigna ofrece cuatro proveedores posibles. Se eligio **ExchangeRate-API** (`https://api.exchangerate-api.com/v4/latest/{base}`) porque no requiere API key, lo que evita gestionar secretos en un ejercicio academico; su disponibilidad se verifico durante la implementacion (HTTP 200 y respuesta con el mapa `rates`).

## Requerimientos relacionados

- RF: RF-05 (enriquecimiento con tipo de cambio), RF-04 (precio final convertido).
- Atributos de calidad: QA-02 disponibilidad, QA-05 rendimiento, QA-04 testabilidad, QA-01 modificabilidad.
- Restricciones tecnicas: RT-04 (proveedor gratuito con cuota), RT-05 (timeout, reintentos, cache), RT-06 (precios base en USD), RT-07 (continuar ante fallo).
- Restricciones organizacionales: RO-03 (integracion testeable sin red).

## Opciones consideradas

Las opciones de proveedor estan **documentadas en la consigna**; la comparacion de las tacticas es un **analisis actual**.

### Opcion A — Puerto `ExchangeRateProvider` + cliente con timeout, retry, cache y fallback (elegida)

- Ventajas: cumple literalmente RT-05 y RT-07; el pipeline no depende del proveedor concreto; se prueba sin red inyectando `fetchFn` o el proveedor completo; una llamada cachea todas las monedas de la base.
- Desventajas: mas piezas (puerto, cliente, cache) que una llamada directa; las tasas de respaldo envejecen.
- Impacto: maximiza QA-02 y QA-04; mejora QA-05 por la cache.

### Opcion B — `fetch` directo dentro del filtro

- Ventajas: menos codigo, lectura inmediata.
- Desventajas: el filtro deja de ser testeable sin interceptar HTTP global; el proveedor queda cableado; la cache no tendria donde vivir entre requests.
- Impacto: degrada QA-04 y QA-01.

### Opcion C — Proveedor con API key (Fixer, CurrencyAPI, Open Exchange Rates)

- Ventajas: datos historicos, mayor precision, cuotas y soporte mejores.
- Desventajas: exige gestionar un secreto y una cuenta; imposibilita que un tercero clone el repositorio y lo ejecute sin registrarse.
- Impacto: sin beneficio para los atributos priorizados en este alcance; el puerto deja la puerta abierta a cambiarlo.

### Opcion D — Precargar tasas al arrancar, sin llamadas durante el procesamiento

- Ventajas: latencia constante y minima durante el request; consumo de cuota trivial.
- Desventajas: las tasas envejecen todo lo que dure el proceso; no cumple "obtener tasas de cambio actuales"; un fallo al arrancar dejaria al sistema sin cotizaciones.
- Impacto: mejor rendimiento, peor fidelidad al requerimiento.

## Decision

Se define el puerto `ExchangeRateProvider` (`getRate`, `invalidateCache`) y se implementa `ExchangeRateApiClient` sobre `fetch` nativo con esta cadena de resolucion:

1. **Identidad:** si la moneda destino es la base (USD), devuelve tasa 1 sin trafico (`rateSource: "identity"`).
2. **Cache:** si hay una entrada vigente para la moneda base, la usa (`"cache"`).
3. **API:** hasta `maxRetries` intentos (3 por defecto), cada uno abortado con `AbortController` al vencer `timeoutMs` (5000 ms), con backoff lineal `retryDelayMs * intento`; el mapa completo de tasas se cachea por moneda base con TTL de 1 hora (`"api"`).
4. **Fallback:** al agotar los intentos, usa la tasa de respaldo configurada y el filtro agrega el warning `EXCHANGE_RATE_FALLBACK` (`"fallback"`).
5. **Sin respaldo:** lanza `ExchangeRateUnavailableError`; el filtro lo captura, agrega el warning `EXCHANGE_RATE_UNAVAILABLE` y deja la reserva en USD con tasa 1.

Todos los parametros (URL, timeout, reintentos, TTL, tasas de respaldo) son configurables via `PUT /pipeline/config`. La cache pertenece a `ReservationProcessingService`, de modo que sobrevive a la reconstruccion del cliente cuando cambia la configuracion. El `rateSource` se expone en la respuesta al cliente.

## Justificacion

Los parametros vienen dados por la consigna; lo que esta decision agrega es *donde* vive cada tactica. Poner el timeout y el reintento en el cliente y la politica de negocio ("continuar en USD con warning") en el filtro mantiene cada responsabilidad en su capa: el cliente sabe de HTTP, el filtro sabe que un precio sin convertir sigue siendo un precio valido. Cachear el mapa completo por moneda base —y no por par de monedas— es lo que hace que un lote con destinos diversos consuma una sola llamada, que es la diferencia entre respetar o agotar la cuota gratuita. Exponer `rateSource` convierte la degradacion en informacion visible en lugar de un detalle oculto.

## Consecuencias positivas

- El procesamiento nunca depende de la disponibilidad del tercero (verificado end-to-end con un host inalcanzable).
- Latencia acotada y previsible; consumo de cuota minimo (una llamada por moneda base por hora).
- Las pruebas no tocan la red: 10 casos cubren api, cache, TTL vencido, invalidacion, reintentos, fallback, HTTP 503, timeout abortado, ausencia de respaldo e identidad.
- Cambiar de proveedor implica una clase nueva y ninguna modificacion del pipeline.

## Consecuencias negativas y trade-offs

- Las tasas de respaldo estan fijadas en la configuracion y envejecen: un fallback prolongado produce conversiones inexactas sin que el sistema lo advierta mas alla del warning.
- La cache puede servir cotizaciones de hasta una hora de antiguedad.
- En el peor caso (proveedor colgado y sin cache), el costo es `timeout x intentos` ≈ 15 s por moneda base.
- La cache en memoria se duplica por instancia en un despliegue multi-proceso.

## Riesgos y mitigaciones

| Riesgo | Probabilidad o impacto | Mitigacion |
|---|---|---|
| Proveedor caido de forma sostenida | Media / medio | Fallback configurado + cache; circuit breaker como **Propuesta** |
| Agotamiento de la cuota mensual gratuita | Baja / alto | Cache por moneda base con TTL de 1 hora; volumen real de reservas: `Pendiente de validacion` |
| Tasas de respaldo desactualizadas | Alta a largo plazo / medio | Son configurables via `PUT /pipeline/config`; revision periodica: `Pendiente de validacion` |
| Cambio de contrato de la API externa | Baja / medio | La respuesta se valida (`rates` debe existir) y un formato inesperado se trata como fallo de integracion, no como excepcion del pipeline |

## Evidencia

- Consigna, seccion "Integracion con API de Tipo de Cambio" y "Funcionalidades del Filtro de Tipo de Cambio".
- `src/services/exchangeRate/exchangeRateProvider.ts`, `exchangeRateApiClient.ts`, `ratesCache.ts`, `countryCurrency.ts`.
- `tests/services/exchangeRateApiClient.test.ts` (10 casos); `tests/filters/exchangeRate.filters.test.ts`.
- Verificacion manual contra el proveedor real: `rateSource: "api"` en ~1040 ms; segunda llamada `"cache"` en ~0,4 ms; con host inalcanzable, `"fallback"` y warning tras ~1 s con `timeoutMs: 400` y 2 intentos.

## Decisiones relacionadas

- [ADR-003 — Aislamiento de fallos por filtro](ADR-003-aislamiento-de-fallos.md)
- [ADR-005 — Configuracion del pipeline mutable en memoria](ADR-005-configuracion-mutable.md)
- [ADR-007 — Orden del pipeline y separacion del filtro de tipo de cambio](ADR-007-orden-pipeline-tipo-de-cambio.md)
