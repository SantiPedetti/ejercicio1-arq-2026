# ADR-001: Adoptar Pipes & Filters en proceso con contexto compartido

- **Estado:** Aceptado
- **Fecha:** 2026-09-17
- **Responsables:** Equipo de desarrollo del ejercicio
- **Estado de evidencia:** Confirmada (el estilo lo impone la consigna; la forma concreta de implementarlo es la decision registrada aqui)

## Contexto

El sistema debe aplicar siete reglas de procesamiento independientes a cada reserva (dos validaciones, un enriquecimiento externo y cuatro etapas de calculo), en un orden definido, con la posibilidad de habilitar o deshabilitar etapas y con cada etapa testeable por separado. La consigna impone el estilo Pipes & Filters, por lo que la decision no es *si* usarlo, sino *como*: que es un "pipe", que contrato tiene un filtro y quien orquesta.

Fuerzas en juego:

- Las reglas cambian por motivos distintos y a ritmos distintos (comercial, regulatorio, operativo).
- El resultado debe volver de forma sincronica en la respuesta de `POST /reservations/process`, junto con el tiempo total de procesamiento.
- Cada filtro debe poder probarse aislado, sin HTTP y sin red.
- El orden de las etapas es un dato del negocio y debe poder cambiarse.

## Requerimientos relacionados

- RF: RF-01 (procesar lote), RF-02, RF-03, RF-04, RF-05.
- Atributos de calidad: QA-01 modificabilidad, QA-04 testabilidad.
- Restricciones tecnicas: RT-01 (Node/TypeScript/Express), RT-02 (estilo impuesto).
- Restricciones organizacionales: RO-03 (filtros independientes y testeables por separado).

## Opciones consideradas

Esta comparacion es un **analisis actual**: no hay evidencia de que estas alternativas se hayan evaluado y descartado historicamente.

### Opcion A — Cadena secuencial en memoria con contrato uniforme `Filter` (elegida)

- Ventajas: resultado sincronico y ordenado; sin infraestructura adicional; cada filtro es una unidad reemplazable con interfaz identica; el orden y la habilitacion se expresan como datos; pruebas unitarias directas.
- Desventajas: sin concurrencia entre etapas; el acoplamiento entre filtros es implicito, via los datos que dejan en el contexto.
- Impacto sobre atributos de calidad: maximiza modificabilidad y testabilidad; rendimiento limitado al de un unico hilo, aceptable para el volumen del ejercicio.

### Opcion B — Pipeline con streams de Node (`Transform`)

- Ventajas: vocabulario nativo de pipes; backpressure gratuito; natural para lotes muy grandes.
- Desventajas: el manejo de errores por elemento es engorroso (un `error` en un stream suele destruir la tuberia); mezclar streams con `async/await` y con acumulacion de diagnostico por reserva complica el codigo sin beneficio visible; el tipado es mas debil.
- Impacto: perjudica QA-03 (aislamiento de fallos por reserva) y QA-04 sin mejorar los atributos priorizados.

### Opcion C — Filtros como servicios desacoplados por colas o eventos (broker)

- Ventajas: desacople temporal, escalado independiente por etapa, reintentos por etapa.
- Desventajas: infraestructura ausente en el alcance (RO-02); orden y correlacion de resultados a resolver a mano; incompatible con devolver el resultado completo en la respuesta HTTP del request.
- Impacto: mejoraria escalabilidad futura a costa de violar RF-01 y RO-02.

### Opcion D — Un unico servicio con las reglas en orden fijo

- Ventajas: menos archivos, lectura lineal del calculo completo, menor indireccion.
- Desventajas: imposible cumplir RF-08 sin condicionales dispersos; probar una regla exige ejercitar el calculo completo; cualquier cambio toca el mismo archivo.
- Impacto: degrada QA-01 y QA-04, que son los atributos de prioridad alta; ademas contradice RT-02.

## Decision

Se implementa el pipeline como una **cadena secuencial en memoria** (Opcion A): `Pipeline` recibe una lista ordenada de objetos que cumplen la interfaz `Filter` (`name` + `execute(context)`) y los aplica uno tras otro sobre un `ReservationContext`. Los filtros se construyen mediante fabricas `(deps: FilterDependencies) => Filter` y se registran por nombre en `FILTER_FACTORIES`; la lista efectiva se arma leyendo `config.filterOrder`. El alcance abarca las ocho etapas actuales y cualquier etapa futura de procesamiento de reservas.

## Justificacion

Las fuerzas prioritarias son modificabilidad y testabilidad, no throughput. La interfaz uniforme es exactamente el mecanismo que permite que el orquestador ignore la semantica de cada etapa y que el orden sea configuracion; las fabricas con dependencias inyectadas son lo que permite probar un filtro con un reloj fijo y un proveedor de tasas falso. Las opciones B y C resuelven problemas de escala que este sistema no tiene, y la D sacrifica precisamente los atributos priorizados.

## Consecuencias positivas

- Agregar una etapa es un archivo nuevo y tres lineas de registro, sin tocar el orquestador ni otros filtros (ver AC-002).
- Cada filtro se prueba en aislamiento; las 58 pruebas corren sin red ni servidor.
- El orden y la habilitacion de etapas son datos, lo que habilita RF-08.
- No se agregan dependencias de infraestructura.

## Consecuencias negativas y trade-offs

- El calculo total no se lee en un solo lugar: hay que recorrer ocho filtros para reconstruirlo.
- Existe acoplamiento implicito por el orden: un filtro asume que otro ya escribio en el contexto.
- El procesamiento es secuencial: un lote grande con integracion lenta acumula latencia.
- Mas archivos y mas indireccion que una implementacion directa.

## Riesgos y mitigaciones

| Riesgo | Probabilidad o impacto | Mitigacion |
|---|---|---|
| Un `filterOrder` mal configurado deja etapas sin precondiciones | Media / alto (precios incorrectos) | Cada filtro de precio verifica sus precondiciones y rechaza con `PRICING_NOT_INITIALIZED` o `FLIGHT_NOT_RESOLVED` en lugar de calcular mal |
| Olvido de registrar un filtro nuevo | Baja / medio | `FILTER_FACTORIES` es un `Record<FilterName, FilterFactory>`: el compilador exige la entrada |
| Latencia acumulada en lotes grandes | Media / medio | Cache de tasas, timeout acotado y tope de 200 reservas por request; paralelizacion por reserva queda como Propuesta |

## Evidencia

- Consigna, secciones "Objetivo", "Filtros a Implementar" y "Aclaraciones".
- `src/pipeline/pipeline.ts`, `src/pipeline/filter.ts`, `src/pipeline/registry.ts`.
- `tests/pipeline/pipeline.test.ts` (orden de ejecucion, filtro deshabilitado, aislamiento de fallos).

## Decisiones relacionadas

- [ADR-002 — Contexto mutable acumulativo](ADR-002-contexto-mutable.md)
- [ADR-003 — Aislamiento de fallos por filtro](ADR-003-aislamiento-de-fallos.md)
- [ADR-005 — Configuracion del pipeline mutable en memoria](ADR-005-configuracion-mutable.md)
- [ADR-007 — Orden del pipeline y separacion del filtro de tipo de cambio](ADR-007-orden-pipeline-tipo-de-cambio.md)
