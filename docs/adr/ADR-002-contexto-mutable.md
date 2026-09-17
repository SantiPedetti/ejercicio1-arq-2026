# ADR-002: Contexto mutable acumulativo frente a transformacion inmutable

- **Estado:** Aceptado
- **Fecha:** 2026-09-17
- **Responsables:** Equipo de desarrollo del ejercicio
- **Estado de evidencia:** Confirmada

## Contexto

Definido el estilo Pipes & Filters (ADR-001), hay que decidir que viaja por los pipes y como lo modifican los filtros. El sistema debe devolver, por cada reserva: los datos resueltos de pasajero y vuelo, el desglose completo del precio, la metadata de la conversion de moneda, **la lista de errores y la lista de warnings** y una traza de las etapas ejecutadas. Ademas debe seguir procesando tras un fallo de integracion (restriccion RT-07), lo que implica que un problema no puede cortar el flujo con una excepcion.

## Requerimientos relacionados

- RF: RF-06 (reportar errores y warnings por reserva), RF-01, RF-05.
- Atributos de calidad: QA-06 observabilidad, QA-03 robustez.
- Restricciones tecnicas: RT-07 (fallo del tercero no detiene el procesamiento).
- Restricciones organizacionales: RO-03.

## Opciones consideradas

Comparacion como **analisis actual**.

### Opcion A — Contexto mutable que acumula diagnostico (elegida)

- Ventajas: un solo objeto por reserva; los filtros son cortos (`addWarning(context, ...)`); acumular varios avisos es natural; costo de memoria constante por etapa.
- Desventajas: la mutacion compartida no esta restringida por el compilador; un filtro puede pisar datos de otro.
- Impacto: favorece QA-06 y QA-03; neutro en rendimiento.

### Opcion B — Filtros puros que devuelven un contexto nuevo

- Ventajas: inmutabilidad, razonamiento local mas seguro, habilita ejecucion paralela futura y snapshots por etapa.
- Desventajas: copia del objeto en cada etapa (ocho copias por reserva); mas verbosidad (`{...context, pricing: {...}}`); el beneficio no es observable por el cliente.
- Impacto: mejora la seguridad frente a errores de programacion, sin mejorar ningun atributo priorizado.

### Opcion C — Excepciones tipadas por regla de negocio

- Ventajas: idiomatico para "detener el flujo"; el tipo del error documenta la causa.
- Desventajas: solo transporta el primer problema; incompatible con warnings no bloqueantes y con RT-07; obligaria a `try/catch` en cada filtro y confundiria error de negocio con error tecnico.
- Impacto: violaria RF-06 y RT-07.

## Decision

El pipe es un **`ReservationContext` mutable** que cada filtro enriquece y devuelve. El diagnostico se acumula en un array `issues` con severidad (`error` | `warning`), manipulado unicamente a traves de las funciones `addError`, `addWarning` y `rejectReservation`. `rejectReservation` es la unica que marca `aborted = true`. La proyeccion al contrato publico (separando `errors` de `warnings`) se hace en `toReservationResult`, fuera de los filtros.

## Justificacion

RF-06 pide explicitamente ambas listas por reserva y RT-07 prohibe cortar el procesamiento ante un fallo de integracion: la combinacion descarta las excepciones como mecanismo principal. Entre mutabilidad e inmutabilidad, la ganancia de la Opcion B es real pero no impacta ningun atributo priorizado, mientras que su costo en verbosidad si se paga en los ocho filtros. Concentrar las mutaciones de diagnostico en tres funciones limita el riesgo sin pagar el costo de la copia.

## Consecuencias positivas

- Diagnostico completo por reserva, incluyendo varios avisos simultaneos.
- Codigo de filtro breve y con una sola forma de reportar problemas.
- El estado final (`processed`, `processed_with_warnings`, `rejected`, `failed`) se deriva del contenido de `issues`, sin logica duplicada.
- El contrato publico queda desacoplado del contexto interno.

## Consecuencias negativas y trade-offs

- La mutacion compartida permite que un filtro sobrescriba datos de otro sin aviso del compilador.
- No hay snapshot por etapa: si hiciera falta auditar el valor intermedio exacto de cada filtro, habria que agregarlo explicitamente.
- Impide, tal como esta, ejecutar filtros en paralelo sobre la misma reserva.

## Riesgos y mitigaciones

| Riesgo | Probabilidad o impacto | Mitigacion |
|---|---|---|
| Un filtro pisa el `pricing` calculado por otro | Baja / alto | Cada filtro de precio escribe solo sus propios campos y el orden esta fijado por configuracion; las pruebas de la cadena verifican el desglose completo |
| Condiciones de carrera si se paraleliza en el futuro | Baja hoy / alto | El orquestador es estrictamente secuencial por reserva; paralelizar requeriria revisar esta decision |
| Clasificacion inconsistente entre error y warning | Media / medio | ADR-003 fija el criterio; los estados resultantes se verifican en pruebas de integracion |

## Evidencia

- `src/domain/reservationContext.ts` (`addError`, `addWarning`, `rejectReservation`, `hasErrors`).
- `src/services/reservationResult.ts` (proyeccion a `errors` / `warnings`).
- `tests/filters/exchangeRate.filters.test.ts` (warnings acumulados sin abortar); `tests/pipeline/pipeline.test.ts` (estado `processed_with_warnings`).

## Decisiones relacionadas

- [ADR-001 — Adoptar Pipes & Filters](ADR-001-pipes-and-filters.md)
- [ADR-003 — Aislamiento de fallos por filtro](ADR-003-aislamiento-de-fallos.md)
