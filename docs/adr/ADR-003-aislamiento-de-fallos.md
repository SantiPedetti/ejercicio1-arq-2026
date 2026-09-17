# ADR-003: Aislamiento de fallos por filtro y politica de continuidad del lote

- **Estado:** Aceptado
- **Fecha:** 2026-09-17
- **Responsables:** Equipo de desarrollo del ejercicio
- **Estado de evidencia:** Confirmada

## Contexto

El sistema procesa lotes y la consigna exige explicitamente soportar "filtro que lanza excepcion", "datos corruptos en mitad del pipeline" y "pipeline interrumpido por falla de red", ademas de continuar el procesamiento cuando la API de tipo de cambio falla. Hay entonces tres clases de problema con tratamientos distintos:

1. La reserva no cumple una regla de negocio (pasajero inexistente, vuelo sin asientos, fecha pasada).
2. Un servicio externo no responde.
3. Un filtro falla por un defecto o por datos imposibles.

Tratar las tres igual produciria, segun el caso elegido, rechazos indebidos o errores silenciados. Hay que decidir donde se capturan los fallos y como se representan.

## Requerimientos relacionados

- RF: RF-01, RF-02, RF-03, RF-05, RF-06.
- Atributos de calidad: QA-03 robustez, QA-02 disponibilidad, QA-06 observabilidad.
- Restricciones tecnicas: RT-07 ("si falla, el procesamiento continua con warnings y precios en USD").
- Restricciones organizacionales: RO-04 (casos de error requeridos por la consigna).

## Opciones consideradas

Comparacion como **analisis actual**.

### Opcion A — Frontera de errores en el orquestador, con estados diferenciados (elegida)

- Ventajas: los filtros no necesitan `try/catch`; el radio de impacto de un defecto es una reserva; el cliente distingue rechazo de negocio (`rejected`) de error tecnico (`failed`); el lote siempre devuelve resultados parciales utiles.
- Desventajas: un defecto sistematico se reporta como `200` con muchas reservas `failed`, no como error del servicio.
- Impacto: maximiza QA-03 y QA-06.

### Opcion B — Propagar la excepcion y devolver 500 para todo el lote

- Ventajas: falla rapida y evidente; implementacion trivial.
- Desventajas: una reserva con datos corruptos anula el trabajo de las correctas; contradice los casos de error de la consigna.
- Impacto: degrada QA-03 severamente.

### Opcion C — `try/catch` dentro de cada filtro

- Ventajas: manejo especifico por etapa, con mensajes mas precisos.
- Desventajas: duplica la misma logica ocho veces; nada garantiza que un filtro nuevo la incluya; el orquestador pierde el control del estado del contexto.
- Impacto: perjudica QA-01 (modificabilidad) sin mejorar la robustez efectiva.

### Opcion D — Reintentar el filtro que falla

- Ventajas: util ante fallos transitorios.
- Desventajas: los fallos de datos son deterministas, reintentar solo multiplica el costo; el unico filtro con fallos transitorios (tipo de cambio) ya tiene su propia politica de reintentos (ADR-004).
- Impacto: costo sin beneficio.

## Decision

El manejo de fallos se concentra en **tres niveles**, cada uno con su representacion:

1. **Regla de negocio incumplida:** el filtro llama `rejectReservation`, que registra un `issue` de severidad `error`, marca `aborted` y fija el estado `rejected`. El orquestador saltea las etapas restantes de esa reserva y las marca `skipped` en la traza.
2. **Fallo de integracion externa:** el filtro registra un `issue` de severidad `warning` y continua; el estado final es `processed_with_warnings`. Nunca produce un rechazo.
3. **Excepcion inesperada:** `Pipeline.process` la captura, registra `FILTER_EXCEPTION`, fija el estado `failed`, anota la traza con `status: "failed"` y el mensaje, y continua con la reserva siguiente.

Ademas, la capa HTTP valida el contrato de entrada antes de llegar al pipeline (`400 INVALID_REQUEST` / `INVALID_CONFIG` / `MALFORMED_JSON`), de modo que un payload invalido nunca se convierte en una reserva `failed`.

## Justificacion

Cada nivel responde a quien es responsable del problema: el negocio, el tercero o el sistema. Esa separacion es lo que permite cumplir a la vez las dos exigencias contradictorias de la consigna —rechazar reservas invalidas y no rechazar por fallos del proveedor externo— y, al mismo tiempo, no esconder defectos propios: `summary.failed` los hace contables. Capturar en el orquestador en lugar de en cada filtro asegura que la garantia valga tambien para los filtros que se agreguen en el futuro.

## Consecuencias positivas

- El proceso no cae por un filtro defectuoso y el lote siempre completa.
- El consumidor sabe, por reserva, si debe corregir datos, avisar al usuario o reportar un incidente.
- La traza indica exactamente en que etapa se corto el flujo y por que.
- La garantia de aislamiento es transversal: no depende de la disciplina de cada autor de filtro.

## Consecuencias negativas y trade-offs

- Un fallo masivo devuelve `200`; detectarlo exige mirar `summary.failed` (no hay alerta automatica).
- Se prioriza completitud del lote sobre falla rapida: con un tercero degradado, se paga el timeout antes de caer al respaldo.
- El contrato de salida es mas rico y, por lo tanto, mas caro de consumir que un simple exito/error.

## Riesgos y mitigaciones

| Riesgo | Probabilidad o impacto | Mitigacion |
|---|---|---|
| Un defecto sistematico pasa inadvertido porque la respuesta es 200 | Media / alto | `summary.failed` en cada respuesta y `logger.error` por excepcion; alertas sobre esa metrica quedan como Propuesta |
| Degradar a warning algo que el negocio considera bloqueante | Baja / alto | El estado pasa a `processed_with_warnings`, visible en el resumen y en `rateSource` |
| Latencia acumulada al insistir con un tercero caido | Media / medio | Timeout acotado, cache de tasas; circuit breaker como Propuesta |

## Evidencia

- Consigna, "Casos de Error" y "Aclaraciones".
- `src/pipeline/pipeline.ts`, `src/domain/reservationContext.ts`, `src/api/errorHandler.ts`, `src/api/schemas.ts`.
- `tests/pipeline/pipeline.test.ts`, `tests/api/reservations.routes.test.ts` (lote mixto, fallo de la API, payload invalido, JSON malformado).

## Decisiones relacionadas

- [ADR-001 — Adoptar Pipes & Filters](ADR-001-pipes-and-filters.md)
- [ADR-002 — Contexto mutable acumulativo](ADR-002-contexto-mutable.md)
- [ADR-004 — Integracion resiliente con la API de tipo de cambio](ADR-004-integracion-tipo-de-cambio.md)
