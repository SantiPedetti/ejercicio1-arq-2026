# ADR 3: Manejo y aislamiento de fallos según la criticidad del filtro

El sistema procesa lotes de hasta 100 reservas. Una reserva defectuosa o una excepcion tecnica imprevista en un filtro no debe detener el proceso Node.js ni perjudicar el procesamiento de las restantes reservas del lote (AC 4). Por otra parte, existen filtros cuya ejecucion es indispensable para la validez de la operacion (validaciones de identidad, cupos y calculos tarifarios), mientras que otros —como el enriquecimiento y conversion de moneda mediante APIs externas— admiten degradacion sin invalidar la reserva (AC 1).

## Decisión

Nosotros clasificaremos cada filtro mediante una propiedad explicita `critical: boolean` en la interfaz `Filter`. El orquestador `Pipeline` envolvera la ejecucion de cada filtro en bloques de captura de excepciones:
- Ante una excepcion en un filtro critico (`critical: true`), la reserva pasara a estado `FAILED` con el codigo `FILTER_EXCEPTION`, se detendra su flujo y los filtros posteriores quedaran en la traza como `NOT_RUN`.
- Ante una excepcion en un filtro no critico (`critical: false`), como el enriquecimiento de tasas o la conversion local, el orquestador agregara una advertencia `FILTER_EXCEPTION` a la reserva y continuara el flujo con el siguiente filtro.
- Los problemas de validacion de negocio nunca lanzaran excepciones: registraran un `Issue` de severidad `error` mediante `rejectReservation`, dejando la reserva en estado `REJECTED` y omitiendo las etapas siguientes.

## Justificación

Distinguir la criticidad de los componentes permite maximizar la disponibilidad global sin comprometer la consistencia de los datos financieros. Si el servicio de tipo de cambio falla o arroja un error inesperado, la reserva sigue siendo comercialmente valida en su moneda de origen (USD), tal como exige la consigna. En cambio, si falla el calculo de precio base o la verificacion de asientos, emitir una reserva incompleta generaria inconsistencias operativas graves.

Alternativas consideradas y rechazadas:
1. Interrumpir el lote entero ante la primera excepcion: Rechazada porque penaliza severamente la disponibilidad, haciendo que un fallo puntual en una reserva degrade a todo el lote.
2. Tratar todas las excepciones como advertencias: Rechazada porque permitiria emitir reservas con precios indeterminados o sin vuelo confirmado.
3. Usar excepciones para el flujo normal de rechazos de negocio: Rechazada porque el lanzamiento de excepciones en Node.js es costoso en rendimiento, interrumpe la recoleccion de warnings acumulados y confunde errores operativos de negocio con fallas tecnicas del software.

## Estado

Aceptado

## Consecuencias

Positivas:
- Aislamiento efectivo (AC 4): ningun fallo individual aborta el lote ni detiene el proceso del servidor.
- Resiliencia y degradacion grácil (AC 1): fallos en servicios externos se absorben preservando el resultado central en USD con avisos claros.
- Trazabilidad pormenorizada: la respuesta desglosa el motivo exacto de fallo o rechazo por reserva con su traza de ejecucion.

Negativas:
- El orquestador debe administrar una maquina de estados mas compleja (`PENDING`, `PROCESSING`, `CONFIRMED`, `REJECTED`, `FAILED`).
- Posibilidad de degradacion silenciosa si no se monitorean adecuadamente los logs de advertencias emitidos por filtros no criticos.
