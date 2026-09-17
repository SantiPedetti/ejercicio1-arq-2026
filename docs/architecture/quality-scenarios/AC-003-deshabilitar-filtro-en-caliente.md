# AC-003: Deshabilitar o reconfigurar un filtro sin reiniciar el servicio

- **Atributo de calidad:** Configurabilidad en runtime (QA-07)
- **RF relacionado:** RF-08 (ver y modificar la configuracion del pipeline), RF-04
- **Prioridad:** Media
- **Estado de evidencia:** Confirmada

## Escenario

- **Fuente:** Operador comercial o analista, por decision de negocio o para mitigar un incidente.
- **Estimulo:** Se solicita deshabilitar un filtro (por ejemplo, `currencyConversion`) o cambiar un porcentaje (por ejemplo, el descuento gold al 20 %).
- **Entorno:** Servicio en ejecucion, atendiendo trafico.
- **Artefacto:** `PUT /pipeline/config`, `PipelineConfigStore`, `Pipeline`.
- **Respuesta:** El parche se valida contra el esquema; si es valido se aplica sobre la configuracion en memoria y rige para los requests siguientes sin reiniciar el proceso. Si toca `exchangeRate`, se invalida la cache de tasas. El resultado de las reservas procesadas a continuacion refleja el cambio y la traza marca los filtros apagados con `status: "disabled"`. Un parche invalido no modifica nada y devuelve `400 INVALID_CONFIG` con el detalle por campo.
- **Medida de respuesta:** El cambio rige desde el primer request posterior, sin reinicio ni redeploy y sin perdida de requests en curso. Verificado en pruebas de integracion; latencia del `PUT`: despreciable frente al procesamiento (`Pendiente de validacion` como medida formal).

## Impacto arquitectonico

- La configuracion debe ser un objeto mutable con lectura por copia, para que un lote en curso no vea cambios a mitad de camino.
- El orquestador debe consultar `enabledFilters` en cada ejecucion en lugar de recibir una cadena fija construida al arrancar.
- La validacion estricta del parche es necesaria para que una configuracion invalida no degrade el calculo en silencio.

## Tacticas relacionadas

- Binding tardio de parametros: las reglas son datos leidos en cada ejecucion.
- Copy-on-read (`get()` devuelve un clon): evita aliasing entre el store y los filtros ya construidos.
- Validacion de entrada en la frontera: impide estados de configuracion imposibles.
- Invalidacion de cache dirigida: mantiene la coherencia entre configuracion y datos cacheados.

## Evidencia

- Consigna: "Es posible configurar que filtros estan habilitados/deshabilitados".
- `src/config/pipelineConfig.ts`, `src/api/pipeline.routes.ts`, `src/pipeline/pipeline.ts`.
- `tests/api/pipeline.routes.test.ts`: "aplica un parche parcial y lo usa en el siguiente procesamiento", "permite reordenar los filtros del pipeline", "rechaza configuraciones invalidas con 400".

## Preguntas pendientes

- Quien esta autorizado a ejecutar este cambio: hoy el endpoint no tiene autenticacion (QA-08, Propuesta).
- Si se requiere auditoria de quien cambio que regla y cuando; hoy no se registra historial.
