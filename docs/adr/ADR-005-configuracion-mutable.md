# ADR-005: Configuracion del pipeline mutable en memoria, con overrides por request

## Contexto

La consigna exige dos endpoints de configuracion (`GET` y `PUT /pipeline/config`), la posibilidad de habilitar o deshabilitar filtros y parametros opcionales de configuracion en el propio request de procesamiento. Las reglas afectadas —multiplicadores por clase, porcentajes de lealtad y de tipo de pasajero, impuestos, tasa de aeropuerto, sobrecargo por combustible y los parametros de la integracion externa— son justamente las que cambian con mayor frecuencia por decision comercial o regulatoria. No hay base de datos ni infraestructura de configuracion en el alcance del ejercicio.

## Requerimientos relacionados

- RF: RF-08 (ver y modificar la configuracion), RF-04 (calculo de precio), RF-01 (parametros opcionales por request).
- Atributos de calidad: QA-07 configurabilidad, QA-01 modificabilidad, QA-08 seguridad (no satisfecho, ver riesgos).
- Restricciones tecnicas: RT-05 (parametros de la integracion).
- Restricciones organizacionales: RO-02 (sin infraestructura ni persistencia).

## Opciones consideradas

Comparacion como **analisis actual**.

### Opcion A — Objeto en memoria con parches parciales validados y overrides por request (elegida)

- Ventajas: cumple RF-08 sin infraestructura; el cambio rige desde el request siguiente; los overrides permiten reproducir escenarios (por ejemplo, forzar el fallo de la API) sin ensuciar el estado global; las pruebas pueden verificar que los filtros leen configuracion y no constantes.
- Desventajas: no persiste ni se comparte entre instancias; no hay historial de cambios.
- Impacto: maximiza QA-07; deja QA-08 sin cubrir.

### Opcion B — Variables de entorno o archivo JSON de solo lectura

- Ventajas: reproducible, versionable, trazable por control de versiones.
- Desventajas: requiere reinicio para cada cambio, por lo que no cumple `PUT /pipeline/config`.
- Impacto: mejor gobernanza, incumple el requerimiento funcional.

### Opcion C — Configuracion persistida en base de datos

- Ventajas: durabilidad, auditoria, configuracion compartida entre instancias.
- Desventajas: exige infraestructura explicitamente fuera del alcance (RO-02) y complica el arranque del proyecto.
- Impacto: correcta para produccion, desproporcionada para el ejercicio.

### Opcion D — Constantes en el codigo de cada filtro

- Ventajas: maxima simplicidad y rendimiento.
- Desventajas: incumple RF-08; cada cambio de porcentaje es un deploy; imposible probar la parametrizacion.
- Impacto: incompatible con los requerimientos.

## Decision

`PipelineConfig` centraliza el orden de filtros (`filterOrder`), su habilitacion (`enabledFilters`), todas las reglas de precio y los parametros de la integracion. `PipelineConfigStore` guarda una copia profunda, devuelve **clones** en `get()` y aplica parches parciales en `update()`, fusionando por seccion (incluidas las `fallbackRates`). La configuracion se expone y modifica por HTTP, con validacion estricta (`zod`, `.strict()`); un parche invalido devuelve `400 INVALID_CONFIG` y no modifica nada. Si el parche toca `exchangeRate`, se invalida la cache de tasas. `POST /pipeline/config/reset` restaura los valores por defecto.

`POST /reservations/process` acepta un campo `config` que se aplica **solo a ese request**: se construye un store efimero sobre la configuracion global vigente, sin mutarla.

## Justificacion

Convertir las reglas volatiles en datos leidos en cada ejecucion es lo que permite que un ajuste comercial no sea un cambio de codigo. Devolver clones en la lectura evita que un lote en curso vea una configuracion modificada a mitad de camino, que seria una fuente de resultados irreproducibles. Los overrides por request resuelven un problema concreto de operacion y de demostracion: probar el comportamiento ante fallo del tercero o con un filtro apagado sin dejar el sistema en un estado raro para los demas consumidores.

## Consecuencias positivas

- Cambios de reglas y de topologia sin redeploy ni reinicio (AC-003).
- Escenarios de error y de configuracion reproducibles desde la coleccion de Postman.
- Los filtros quedan libres de constantes de negocio, lo que permite probar la parametrizacion.
- La validacion estricta detecta typos de configuracion en lugar de ignorarlos.

## Consecuencias negativas y trade-offs

- La configuracion se pierde al reiniciar el proceso y no se comparte entre instancias: dos replicas pueden divergir.
- No hay historial ni auditoria de quien cambio que regla.
- La superficie de riesgo crece: un `PUT` incorrecto altera precios de inmediato.
- Un `filterOrder` incompleto degrada el resultado, aunque de forma detectada y no silenciosa.

## Riesgos y mitigaciones

| Riesgo | Probabilidad o impacto | Mitigacion |
|---|---|---|
| **El endpoint no tiene autenticacion: cualquiera con acceso de red puede alterar precios** | Alta en un entorno real / alto | Limitacion deliberada del alcance academico; autenticacion y autorizacion quedan como propuesta y estan registradas en QA-08 |
| `filterOrder` sin `basePrice` u otra etapa necesaria | Media / medio | Los filtros posteriores verifican precondiciones y rechazan con `PRICING_NOT_INITIALIZED` en lugar de calcular mal |
| Divergencia de configuracion entre replicas | Baja hoy / medio | Una sola instancia en el alcance actual; configuracion compartida como Propuesta |
| Cambio de `exchangeRate` con tasas cacheadas incoherentes | Media / bajo | El `PUT` invalida la cache cuando toca esa seccion |

## Evidencia

- Consigna, "Endpoints Requeridos" (`GET`/`PUT /pipeline/config`) e "Input" (parametros de configuracion opcionales).
- `src/config/pipelineConfig.ts`, `src/api/pipeline.routes.ts`, `src/api/schemas.ts`, `src/services/reservationProcessingService.ts`.
- `tests/api/pipeline.routes.test.ts` (parche parcial aplicado al procesamiento, reordenamiento, rechazo de config invalida, reset); `tests/filters/pricing.filters.test.ts` ("usa los porcentajes de la configuracion, no constantes embebidas").

## Decisiones relacionadas

- [ADR-001 — Adoptar Pipes & Filters](ADR-001-pipes-and-filters.md)
- [ADR-004 — Integracion resiliente con la API de tipo de cambio](ADR-004-integracion-tipo-de-cambio.md)
- [ADR-006 — Datos mock y estado de procesamiento en memoria](ADR-006-estado-en-memoria.md)
