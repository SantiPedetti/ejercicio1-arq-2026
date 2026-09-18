# ADR-007: Orden del pipeline y separacion del filtro de tipo de cambio en dos etapas

## Contexto

La consigna enumera los filtros en este orden:

1. Validacion de pasajero
2. Validacion de vuelo
3. **Enriquecimiento con API de tipo de cambio** — "convertir precios a moneda local del pais de destino"
4. Calculo de precio base
5. Descuentos por lealtad
6. Ajustes por tipo de pasajero
7. Calculo de impuestos y tasas

El filtro 3 debe convertir precios, pero el precio recien se calcula en los filtros 4 a 7. En la posicion 3 no existe ningun total que convertir: lo unico disponible es el `basePriceUsd` publicado del vuelo. Convertir ese valor produciria un `convertedTotal` que no corresponde al importe que el pasajero paga, es decir, un dato correcto en apariencia y equivocado en el fondo. Hay que decidir como respetar el enunciado sin entregar un numero incorrecto.

## Requerimientos relacionados

- RF: RF-05 (enriquecimiento y conversion), RF-04 (calculo de precio final).
- Atributos de calidad: QA-02 disponibilidad (concentrar el I/O en una sola etapa), QA-05 rendimiento (una sola llamada externa por reserva), QA-01 modificabilidad.
- Restricciones tecnicas: RT-06 (precios base en USD), RT-07 (fallo del tercero no detiene el procesamiento), orden de filtros enunciado por la consigna.
- Restricciones organizacionales: RO-04 (casos de prueba requeridos, incluidos los de conversion).

## Opciones consideradas

Comparacion como **analisis actual**. El orden de los filtros esta **documentado en la consigna**; la forma de resolver la inconsistencia no.

### Opcion A — Dividir en `exchangeRateEnrichment` (posicion 3) y `currencyConversion` (ultima posicion) (elegida)

- Ventajas: la llamada externa ocurre en la posicion que indica la consigna; la conversion se aplica al total real; queda un unico punto de I/O remoto, donde se concentran timeout, reintentos, cache y fallback; `currencyConversion` se puede deshabilitar sin perder la metadata de la tasa.
- Desventajas: ocho filtros en lugar de siete; acoplamiento por datos entre ambas etapas (`context.currency`).
- Impacto: correccion del resultado sin sacrificar QA-02 ni QA-05.

### Opcion B — Mover el filtro unico al final del pipeline

- Ventajas: la solucion mas simple; un filtro menos; conversion correcta.
- Desventajas: se aparta del orden enunciado, que podria expresar la intencion de contactar al tercero temprano (por ejemplo, para fallar rapido o para no calcular si la integracion es indispensable); si en el futuro un filtro intermedio necesitara la tasa, no la tendria disponible.
- Impacto: equivalente en calidad, menor fidelidad al enunciado.

### Opcion C — Mantener un unico filtro en la posicion 3 convirtiendo el precio base del vuelo

- Ventajas: fidelidad literal al orden y a la cantidad de filtros.
- Desventajas: el valor convertido no corresponde al total final; el cliente recibiria un importe en moneda local que no puede usar; los descuentos e impuestos posteriores quedarian sin reflejar en la conversion.
- Impacto: cumple la forma e incumple el proposito del requerimiento.

### Opcion D — Recalcular la conversion en cada filtro de precio

- Ventajas: la moneda local siempre estaria actualizada en cada paso intermedio.
- Desventajas: repite logica de conversion en cuatro filtros; la tasa solo cambia una vez, por lo que el recalculo es trabajo inutil; multiplica el riesgo de inconsistencias de redondeo.
- Impacto: peor modificabilidad, sin beneficio.

## Decision

La responsabilidad se divide en dos filtros configurables:

- **`exchangeRateEnrichment`** (posicion 3 por defecto): detecta la moneda del pais de destino con el mapa `COUNTRY_TO_CURRENCY`, obtiene la tasa a traves de `ExchangeRateProvider` (con timeout, reintentos, cache y fallback) y escribe en el contexto `baseCurrency`, `targetCurrency`, `rate`, `rateSource` y `retrievedAt`. Es el unico filtro que realiza I/O remoto. Ante fallo total agrega un warning y deja tasa 1 en USD.
- **`currencyConversion`** (ultima posicion por defecto): multiplica `pricing.totalUsd` por la tasa ya obtenida y publica `currency.convertedTotal`. No vuelve a llamar a la API.

Ambos nombres estan en `filterOrder` y en `enabledFilters`, por lo que el orden es reconfigurable via `PUT /pipeline/config` y la decision es reversible sin cambios de codigo.

## Justificacion

Es la unica alternativa que preserva simultaneamente las dos propiedades en tension: el momento de la llamada externa que indica la consigna y la correccion aritmetica del importe convertido. Ademas mantiene una propiedad valiosa por si misma: un solo punto de I/O remoto en todo el pipeline, lo que hace que las tacticas de disponibilidad (ADR-004) tengan un unico lugar de aplicacion y que el resto de los filtros sea puramente computacional y trivialmente testeable.

## Consecuencias positivas

- El `convertedTotal` corresponde al importe final que paga el pasajero.
- El orden enunciado por la consigna se respeta en lo que hace a la interaccion con el tercero.
- La conversion es independiente de la integracion: se puede apagar una sin romper la otra de forma silenciosa.
- Un solo filtro con I/O concentra las tacticas de resiliencia y de observabilidad de latencia.

## Consecuencias negativas y trade-offs

- El pipeline tiene ocho etapas en lugar de las siete enunciadas, lo que exige explicar la diferencia (este ADR y el README).
- Existe un acoplamiento por datos: `currencyConversion` depende de que `exchangeRateEnrichment` haya escrito `context.currency`.
- La metadata de moneda ocupa lugar en el contexto durante las cuatro etapas de calculo, aunque no se use hasta el final.

## Riesgos y mitigaciones

| Riesgo | Probabilidad o impacto | Mitigacion |
|---|---|---|
| Se deshabilita solo `exchangeRateEnrichment` y la conversion queda sin tasa | Media / bajo | `currencyConversion` emite el warning `CURRENCY_METADATA_MISSING` y mantiene el total en USD; verificado en pruebas |
| Confusion respecto del enunciado al evaluar el trabajo | Media / bajo | Documentado en este ADR, en DD-011 y en una seccion propia del README |
| Un reordenamiento por configuracion coloca la conversion antes del calculo | Baja / medio | `currencyConversion` rechaza con `PRICING_NOT_INITIALIZED` si no hay desglose de precios |

## Evidencia

- Consigna, seccion "Filtros a Implementar" (orden) y "Conversion de Precios" ("mantener precio original y convertido en metadata").
- `src/pipeline/filters/exchangeRateEnrichment.filter.ts`, `src/pipeline/filters/currencyConversion.filter.ts`, `DEFAULT_PIPELINE_CONFIG.filterOrder`.
- `tests/filters/exchangeRate.filters.test.ts`; `tests/api/reservations.routes.test.ts` ("convierte el total a la moneda del pais de destino").

## Decisiones relacionadas

- [ADR-001 — Adoptar Pipes & Filters](ADR-001-pipes-and-filters.md)
- [ADR-004 — Integracion resiliente con la API de tipo de cambio](ADR-004-integracion-tipo-de-cambio.md)
- [ADR-005 — Configuracion del pipeline mutable en memoria](ADR-005-configuracion-mutable.md)
