# ADR 5: Integración resiliente con ExchangeRate-API mediante timeout, reintentos, caché, single-flight y tasa vencida

El enriquecimiento con moneda local requiere obtener cotizaciones actualizadas desde un servicio externo. Los servicios publicos de tipo de cambio no ofrecen garantias de nivel de servicio (SLA), sufren cortes eventuales y aplican cuotas de consumo. La consigna establece requisitos estrictos de resiliencia: timeout de 5 s, maximo de 3 reintentos, cache de 1 hora con invalidacion manual y tolerancia a fallos continuando en USD (AC 1). Asimismo, el escenario AC 5 exige evitar llamadas redundantes ante peticiones concurrentes.

## Decisión

Nosotros adoptaremos **ExchangeRate-API** v4 (`https://api.exchangerate-api.com/v4/latest`) como proveedor externo sin autenticacion. Abstraeremos la comunicacion mediante el puerto `ExchangeRateProvider` y la implementaremos en `ExchangeRateApiClient` junto con `RatesCache`:
1. **Timeout**: maximo de 5000 ms por intento utilizando `AbortSignal.timeout`.
2. **Reintentos controlados**: hasta 3 intentos con retroceso exponencial (esperas base de 200 ms y 400 ms) y jitter de ±20%, aplicables exclusivamente ante fallas transitorias de red, timeouts, errores HTTP 5xx o 429. Respuestas HTTP 4xx o cargas corruptas fallan inmediatamente sin reintento.
3. **Caché en memoria**: retencion de cotizaciones por 1 hora (TTL de 3.600.000 ms).
4. **Single-flight**: reutilizacion de la misma promesa en curso para solicitudes concurrentes dentro de un mismo lote con la cache fria, limitando el consumo a 1 tanda de llamadas por lote.
5. **Degradación grácil**: ante falla total tras agotar los intentos, se recurre a la cotizacion vencida en memoria si existe (`stale-cache`, con warning `STALE_RATE`). Si no hay cotizacion previa disponible, se prescinde de la conversion emitiendo el warning `EXCHANGE_RATE_UNAVAILABLE` y conservando los montos en USD. Se elimina cualquier tasa fija cableada (*fallbackRates*).

## Justificación

La combinacion de tacticas de disponibilidad (deteccion por timeout, reintento transitorio y degradacion grácil) y rendimiento (cache y single-flight) cumple a cabalidad con los escenarios AC 1 y AC 5. ExchangeRate-API v4 elimina la necesidad de credenciales o secretos en un ejercicio academico sin resignar el consumo de un servicio real. Descartar tablas fijas en codigo evita simular cotizaciones obsoletas o ficticias sin aviso.

Alternativas consideradas y rechazadas:
1. Tabla de tasas fijas estaticas en codigo: Rechazada (Q3) porque viola el requerimiento expreso de integrarse con una API publica externa en ejecucion.
2. Proveedores con clave (Fixer.io, CurrencyAPI, Open Exchange Rates): Rechazados por la complicacion operativa de gestionar llaves secretas y limites mensuales muy bajos (100–300 reqs) que dificultarian la revision docente.
3. Aplicar tasa de equivalencia 1.0 como fallback: Rechazada (R1 F7) por introducir graves distorsiones contables al equiparar ficticiamente 1 USD con 1 ARS o 1 BRL.

## Estado

Aceptado

## Consecuencias

Positivas:
- Alta disponibilidad (AC 1): ante la caida de la API externa, el 100% de las reservas del lote finaliza con estado procesado y precios validos en USD.
- Minimizacion de trafico externo (AC 5): la combinacion de cache e hilo unico de peticion (*single-flight*) reduce drásticamente las solicitudes salientes.
- Testeabilidad First-class (AC 6): el desacoplamiento mediante `ExchangeRateProvider` permite sustituir completamente el componente por stubs deterministas en los tests automatizados.

Negativas:
- El endpoint v4 de ExchangeRate-API esta senalado como legado por su proveedor (`WARNING_UPGRADE_TO_V6`), por lo que su vigencia externa podria expirar a largo plazo.
- En caso de reinicio del proceso Node.js, la cache en memoria se pierde y requiere volver a consultar la API externa.
