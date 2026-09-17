# AC-004: Excepcion inesperada dentro de un filtro

- **Atributo de calidad:** Robustez / aislamiento de fallos (QA-03)
- **RF relacionado:** RF-01 (procesar lote), RF-06 (reportar errores)
- **Prioridad:** Alta
- **Estado de evidencia:** Confirmada

## Escenario

- **Fuente:** Defecto de software o datos corruptos en una reserva del lote.
- **Estimulo:** Un filtro lanza una excepcion no controlada a mitad del pipeline.
- **Entorno:** Operacion normal, procesando un lote con varias reservas validas.
- **Artefacto:** `Pipeline.process` y `Pipeline.processBatch`.
- **Respuesta:** El orquestador captura la excepcion, registra un error `FILTER_EXCEPTION` con el nombre del filtro y el mensaje, marca la reserva como `failed`, anota la traza con `status: "failed"` y el detalle, saltea los filtros restantes de esa reserva y continua con la siguiente. La respuesta HTTP sigue siendo `200` con el resumen del lote; el proceso no termina.
- **Medida de respuesta:** 1 reserva afectada de N; las N-1 restantes conservan su estado propio; `summary.failed` refleja exactamente la cantidad de reservas con error tecnico. Verificado con un lote de 3 reservas: resultado `['processed', 'failed', 'rejected']` y `summary = { total: 3, processed: 1, rejected: 1, failed: 1 }`.

## Impacto arquitectonico

- Obliga a que el orquestador sea el unico responsable del manejo de excepciones de etapa (los filtros no necesitan `try/catch` propio).
- Obliga a distinguir en el modelo de estados el error tecnico (`failed`) del rechazo de negocio (`rejected`).
- Obliga a que el procesamiento del lote sea una iteracion por reserva y no una operacion atomica.

## Tacticas relacionadas

- Error boundary por etapa: contiene el fallo en la etapa donde ocurre.
- Contencion de fallos por unidad de trabajo: el radio de impacto es una reserva.
- Registro de excepciones (`logger.error` con filtro, reserva y mensaje) para diagnostico posterior.

## Evidencia

- Consigna, casos de error requeridos: "filtro que lanza excepcion", "datos corruptos en mitad del pipeline".
- `src/pipeline/pipeline.ts`.
- `tests/pipeline/pipeline.test.ts`: "aisla la excepcion de un filtro: marca la reserva como failed sin propagar el error", "procesa el lote completo aunque una reserva falle y resume los estados".

## Preguntas pendientes

- Si un porcentaje alto de reservas `failed` deberia traducirse en un codigo HTTP distinto o en una alerta; hoy el consumidor debe inspeccionar `summary.failed`.
- Umbral de fallos a partir del cual convendria abortar el lote y devolver un error explicito: `Pendiente de validacion`.
