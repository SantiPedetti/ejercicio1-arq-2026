# ADR 7: Separación entre enriquecimiento de tipo de cambio (filtro 3) y conversión monetaria (filtro 8)

La consigna estipula que el filtro 3 es el "Filtro de Enriquecimiento con API de Tipo de Cambio" y que debe convertir los precios a la moneda local del pais de destino. Sin embargo, en la secuencia natural del pipeline, el precio total final de la reserva no se conoce sino hasta haber ejecutado los filtros 4 (precio base), 5 (lealtad), 6 (pasajero) y 7 (tasas e impuestos). Si el filtro 3 realizara la conversion total en su posicion, estaria operando sobre un monto todavia no calculado o requeriria mover toda la integracion al final del proceso.

## Decisión

Nosotros separaremos el tratamiento de divisas en dos filtros independientes y desacoplados:
1. **Filtro 3 (`exchangeRateEnrichment`)**: ubicado en la tercera etapa, es el unico filtro que realiza I/O externo. Resuelve la moneda del pais de destino a traves de `countryCurrency` y consulta la cotizacion con `ExchangeRateProvider`, incorporando al contexto la metadata de `exchangeRate` (`currency`, `rate`, `source`, `fetchedAt`).
2. **Filtro 8 (`currencyConversion`)**: incorporado como etapa final tras el calculo impositivo del filtro 7. Realiza una transformacion aritmetica local en memoria: calcula `baseFareLocal = baseFare × rate` y `totalLocal = (total ?? currentPrice) × rate`, almacenando el resultado en `ctx.conversion`.
3. El sumidero (`sink` en `toReservationResult`) permanece completamente libre de calculos de negocio, encargandose solo del mapeo y redondeo de salida (`round2`).

## Justificación

Esta division resuelve la paradoja temporal entre la obtencion de datos y el calculo tarifario, respetando el orden de etapas solicitado en la consigna. Al mismo tiempo, respeta la pureza del patron Pipes & Filters evitando que el `sink` asuma responsabilidades de calculo, y permitiendo habilitar o deshabilitar independientemente la llamada a la API externa o la conversion de moneda final por configuracion.

Alternativas consideradas y rechazadas:
1. Realizar la conversion de precios dentro del `sink`: Rechazada (R1 F1) porque asignaba logica de negocio a un componente de presentacion y anulaba la posibilidad de controlar la conversion como un filtro configurable mas del pipeline.
2. Mover el filtro 3 completo a la posicion 8: Rechazada porque alteraba el ordenamiento establecido en la consigna y postergaba innecesariamente la consulta de I/O de red.
3. Duplicar la logica de precios dentro del filtro 3 para anticipar el total: Rechazada por acoplamiento inaceptable y violacion del principio de no repeticion (DRY).

## Estado

Aceptado

## Consecuencias

Positivas:
- Coherencia estructural: I/O de red desacoplado del calculo final de moneda local.
- Flexibilidad operativa: es posible apagar `currencyConversion` (omitiendo montos locales) manteniendo activo `exchangeRateEnrichment` para disponer de la cotizacion de referencia.
- Cumplimiento estricto de Pipes & Filters: los filtros transforman datos; el sink solo serializa y entrega.

Negativas:
- El pipeline implementa 8 filtros en lugar de los 7 nombrados en el enunciado inicial, requiriendo documentacion explicita del desvio justificado.
- El contexto debe preservar el estado de la cotizacion (`exchangeRate`) a lo largo de 4 filtros intermedios.
