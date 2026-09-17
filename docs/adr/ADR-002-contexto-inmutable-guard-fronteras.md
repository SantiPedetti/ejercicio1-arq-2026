# ADR 2: Contexto inmutable, context-guard y validación con Zod en tres fronteras

El estado de la reserva viaja a lo largo de 8 filtros. Si los filtros mutan un objeto compartido en memoria, un filtro defectuoso puede corromper datos previos (por ejemplo, introducir `NaN`, valores negativos o mutar referencias) sin dejar trazabilidad de la etapa causante. Ademas, los datos provienen de origenes externos no confiables: clientes HTTP, variables de entorno y una API remota de tipo de cambio. TypeScript garantiza tipado estricto solo en tiempo de compilacion; en tiempo de ejecucion los tipos desaparecen, dejando expuesto el sistema a cargas malformadas o fallos inesperados.

## Decisión

Nosotros utilizaremos un contexto inmutable por reserva (`ReservationContext`), donde cada filtro retorna una copia actualizada de las estructuras que modifica sin mutar el contexto recibido. Mantendremos el precio acumulado de forma encadenada a traves del campo `currentPrice`. Implementaremos un monitor de invariantes post-filtro (`context-guard`) que validara tras cada paso que todos los montos numericos sean finitos y no negativos. Ademas, aplicaremos validacion estricta con esquemas Zod en las tres fronteras del sistema: (1) el body del request HTTP, (2) las variables de entorno con *fail-fast* al inicio, y (3) la respuesta JSON de la API externa de tipo de cambio.

## Justificación

La inmutabilidad del contexto elimina los efectos colaterales entre filtros y garantiza que el estado de una reserva solo cambie mediante retornos explicitos. Mantener `currentPrice` permite que los filtros de descuento (lealtad y pasajero) encadenen sus deducciones sin obligar al filtro de impuestos a recalcular politicas comerciales. El `context-guard` actua como un supervisor activo que, ante un valor corrupto (`NaN` o negativo), detiene inmediatamente la reserva afectada con estado `FAILED` y codigo `DATA_CORRUPTED`, evitando la propagacion de errores numericos al resto del lote.

Alternativas consideradas y rechazadas:
1. Contexto mutable compartido: Aunque fue la primera opcion contemplada, se rechazo porque permitia que un filtro sobrescribiera inadvertidamente datos de otro sin aviso del compilador y dificultaba aislar que etapa origino un dato corrupto.
2. Recalcular descuentos en el filtro de impuestos (filtro 7): Rechazada (R1 F4) porque requeria que el filtro 7 conociera las reglas de lealtad y edad, violando el principio de responsabilidad unica.
3. Validacion manual con sentencias `if` y chequeos ad-hoc: Rechazada por ser propensa a omisiones, poco uniforme y dificil de mantener frente a cambios de contrato.
4. Confiar unicamente en el tipado estatico de TypeScript: Rechazada porque el tipado estatico no existe en tiempo de ejecucion y no previene errores provenientes de I/O externo o parsing JSON.

## Estado

Aceptado

## Consecuencias

Positivas:
- Integridad total de datos (AC 7): entradas invalidas se rechazan de forma granular antes de ingresar al pipeline y fallos numericos se detectan en el acto.
- Arranque seguro (*fail-fast*): el servidor aborta su inicio de inmediato si `PORT`, `LOG_LEVEL` o `EXCHANGE_API_BASE_URL` no cumplen el esquema esperado.
- Facilidad de testeo y depuracion (AC 6): los filtros se comportan como funciones deterministas faciles de verificar con pruebas unitarias aisladas.

Negativas:
- Sobrecarga leve de recoleccion de basura debido a la creacion de nuevos objetos por cada etapa del pipeline.
- Requiere disciplina de codificacion para evitar mutaciones accidentales en objetos anidados profundos.
