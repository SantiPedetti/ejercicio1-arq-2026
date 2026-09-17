# AC-002: Incorporar un filtro nuevo al pipeline

- **Atributo de calidad:** Modificabilidad (QA-01)
- **RF relacionado:** RF-01 (procesar lote), RF-04 (calculo de precio)
- **Prioridad:** Alta
- **Estado de evidencia:** Confirmada

## Escenario

- **Fuente:** Equipo de desarrollo, ante un requerimiento comercial nuevo (por ejemplo, un recargo por equipaje o un descuento por temporada baja).
- **Estimulo:** Se debe agregar una etapa de calculo al procesamiento de reservas.
- **Entorno:** Tiempo de desarrollo, con el sistema en su estado actual.
- **Artefacto:** `src/pipeline/filters/`, `src/pipeline/registry.ts`, `src/config/pipelineConfig.ts`.
- **Respuesta:** Se agrega un archivo de filtro nuevo que implementa `(deps: FilterDependencies) => Filter`, se suma su nombre a `FILTER_NAMES`, su fabrica a `FILTER_FACTORIES` y su valor por defecto a `enabledFilters`. No se modifica `Pipeline`, ni ningun filtro existente, ni la capa HTTP.
- **Medida de respuesta:** 1 archivo nuevo y 3 puntos de registro; 0 archivos de filtros existentes modificados; 0 modificaciones al orquestador. El compilador detecta un registro incompleto: `FILTER_FACTORIES` es un `Record<FilterName, FilterFactory>`, por lo que omitir la fabrica es un error de compilacion, no un fallo en runtime.

## Impacto arquitectonico

- Exige una interfaz uniforme de filtro y que el orquestador dependa solo de ella.
- Exige que el orden y la habilitacion sean datos (`filterOrder`, `enabledFilters`) y no codigo.
- Exige que las dependencias lleguen por inyeccion, para que el filtro nuevo no tenga que instanciar servicios globales.

## Tacticas relacionadas

- Interfaz uniforme + registry: aisla el cambio en un unico modulo.
- Inyeccion de dependencias: el filtro nuevo recibe configuracion, repositorios y servicios sin conocer su construccion.
- Tipado exhaustivo de `FilterName`: convierte un olvido de registro en error de compilacion.

## Evidencia

- `src/pipeline/registry.ts` (`FILTER_FACTORIES: Record<FilterName, FilterFactory>`).
- `src/pipeline/filter.ts` (contrato `Filter` y `FilterFactory`).
- `tests/pipeline/pipeline.test.ts`: las pruebas construyen filtros ad hoc que el orquestador ejecuta sin cambios.

## Preguntas pendientes

- Si en el futuro se quisiera cargar filtros desde plugins externos (sin recompilar), habria que decidir un mecanismo de descubrimiento dinamico; hoy el catalogo es estatico y verificado en compilacion.
