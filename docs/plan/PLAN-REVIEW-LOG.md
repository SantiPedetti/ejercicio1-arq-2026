# PLAN-REVIEW-LOG — Revisión adversarial del PLAN.md

- **Autor del plan:** Claude (Opus 5).
- **Revisor:** Antigravity, mediante `agy -p --mode plan` (headless y solo lectura, con la suscripción del usuario).
- **Regla:** quien diseña no se audita a sí mismo. Cada hallazgo se registra con un fallo técnico.
- **Máximo de rondas:** 5.

## Decisiones de la Fase 1 (tomadas con el usuario)

| # | Decisión | Elección |
|---|---|---|
| Q1 | Qué hace el pipeline cuando falla un filtro | Según la criticidad del filtro: una validación rechaza la reserva; si falla el tipo de cambio, se agrega un warning y se sigue en USD; una excepción en un filtro de precio marca la reserva como fallida. El pipeline nunca lanza excepciones. |
| Q2 | Cálculo del precio | Descuentos encadenados. El 12% de impuestos va sobre el subtotal; el 8% de combustible va sobre el precio de la clase; se suman 25 USD fijos. |
| Q3 | Tipo de cambio | La tasa se obtiene en el filtro 3. Si la API falla, se usa la tasa vencida de la caché y, si no hay, se deja en USD con tasa 1. |
| Q4 | Configuración | Se pueden activar o desactivar filtros y cambiar parámetros, pero el orden es fijo. Lo que llega en el POST aplica solo a esa request. |
| Q5 | Procesamiento y estado | Síncrono; los resultados se guardan en un repositorio en memoria con límite de tamaño; no se descuentan asientos. |
| Q6 | Datos de entrada | La reserva declara el `passengerType`, que se compara con la fecha de nacimiento a la fecha del vuelo. |

Decisiones menores: se aceptaron todos los valores por defecto propuestos. ~~El proyecto va en `Tecnología/flight-reservations-pf`.~~ Actualizado el 17/09: los planes quedan en `Tecnología/Ejericcio_Aplicacion_1/flight-reservations-pf`, y el código va en el repo `C:\Users\nacho\source\repos\ejercicio1-arq-2026`, en una rama que crea el usuario.

---

## Ronda 1 — Bridge A (`agy -p --mode plan --effort high`), conversación `de94884b-e182-4417-8a19-6ee03097e04a`

- **Veredicto del revisor:** `VERDICT: REVISE`
- **Hallazgos:** 9
- **Resultado del arbitraje:** 6 aceptados, 1 aceptado en parte, 1 aceptado solo como aclaración, 1 rechazado.

### Finding 1.1: El sink hace cálculos; `baseFare` no está definido en el paso 3  [ACCEPTED — parcial]
**Objeción:** convertir `totalLocal` en el sink viola Pipes & Filters. Además, el filtro 3 calcula `baseFareLocal` sobre un `baseFare` que todavía no existe.
**Fallo:**
- Se acepta la segunda parte: el source inicializa `pricing.baseFare = flight.baseFare`, así el filtro 3 tiene un valor definido (§3.2 y §3.4).
- Se rechaza la primera parte: el sink de un pipeline es responsable de formatear la salida, y `total × rate` solo muestra en otra moneda un valor que ya calcularon los filtros, con la tasa que obtuvo el filtro 3. Moverlo a `taxes` acoplaría los impuestos con la conversión, y agregar un octavo filtro se sale de los 7 que pide la consigna. Queda documentado como decisión en el README.

### Finding 1.2: El body del POST no puede ser un array y además llevar `config`  [ACCEPTED]
**Objeción:** si la raíz del JSON es un array, no hay dónde poner `config`.
**Fallo:** es correcto. El body pasa a ser un sobre `{ reservations: [...], config? }` (§7).

### Finding 1.3: No hay forma de pasar de aeropuerto a país  [ACCEPTED — aclaración]
**Objeción:** con solo códigos IATA, el filtro 3 no puede saber el país de destino.
**Fallo:** la §8 ya mostraba los países (`US→AR`), pero el modelo `Flight` no lo tenía explícito. Se agregan `originCountry` y `destinationCountry` al modelo (§7), sin crear una tabla de aeropuertos.

### Finding 1.4: El filtro 7 recalcula los descuentos  [ACCEPTED]
**Objeción:** la fórmula `subtotal = classPrice × (1−l) × (1−t)` deja a los filtros 5 y 6 sin función real.
**Fallo:** es correcto. Ahora el precio se acumula en `pricing.currentPrice`: lo fija el filtro 4, lo descuentan el 5 y el 6, y el 7 toma `subtotal = currentPrice`. Un filtro deshabilitado no toca ese valor.

### Finding 1.5: Race condition con la configuración del proveedor compartido  [ACCEPTED]
**Objeción:** si cada request puede cambiar el timeout y el TTL, los proveedores compartidos o tienen una race condition o ignoran la configuración.
**Fallo:** `params.exchange` queda fuera de la configuración por request; solo se cambia con PUT. Además, `getRates(base, opts)` recibe las opciones del snapshot global en cada llamada, y el TTL se lee al momento de la consulta.

### Finding 1.6: Una promesa fallida queda guardada en el single-flight; falta el tipo de retorno  [ACCEPTED]
**Fallo:** la promesa en curso se borra en un `.finally()`. Se define `RatesResult { rates, source, fetchedAt }` y, si no hay tasa posible, se lanza `ExchangeRateError`.

### Finding 1.7: Una tasa de 1 con moneda ARS distorsiona el precio  [ACCEPTED]
**Fallo:** la intención era "USD con tasa 1", pero quedaba ambiguo. Ahora, si no hay tasa, no se agrega `conversion`: los precios quedan en USD con un warning. Se elimina `fallback` como valor posible de `source`.

### Finding 1.8: ESLint con 15 líneas es excesivo; Zod 4 "no es estable"  [REJECTED]
**Fallo:**
1. El límite de 15 líneas lo recomendó la cátedra en la clase del 10/09 (§8) y el usuario lo confirmó en la suposición 9. Se mantiene, con `skipBlankLines` y `skipComments`, y sin aplicarse a los tests. Los esquemas de Zod se definen fuera de funciones, así que el límite no los alcanza.
2. Es falso: `npm view zod dist-tags` muestra `latest: 4.6.5`, y el proyecto `cryptoZJ` de la cátedra usa `zod ^4.5.4`. El revisor se basó en información desactualizada.

### Finding 1.9: Bordes de edad y tipo de `birthDate`  [ACCEPTED en parte]
**Fallo:**
- Se acepta: `Passenger.birthDate` pasa a ser ISO y la edad se calcula en años cumplidos a la fecha del vuelo (§4 y §7).
- Se rechaza cambiar a `senior >= 65`: la consigna dice literalmente "Senior (> 65 años)". Se agregan tests en los bordes 65/66 y 11/12.

---

## Ronda 2 — Bridge A, misma conversación (`--conversation de94884b…`)

- **Veredicto del revisor:** `VERDICT: REVISE`
- **Hallazgos:** 6 (F10–F15)
- **Resultado del arbitraje:** los 6 aceptados.

Aceptarlos todos no fue por complacencia: cada uno señala una falla verificable en el texto de la v2 (un campo sin tipo, un `NaN` al deshabilitar un filtro, datos mock que no alcanzan para Postman, nombres de campos inconsistentes, un parámetro que faltaba en una firma y un falso positivo en la validación de ids).

### Finding 2.10: `totalLocal` no está en ningún tipo  [ACCEPTED]
**Fallo:** se agrega el tipo de salida `ConversionResult` con `totalLocal`. `ReservationContext.conversion` no cambia, porque el campo lo agrega el sink.

### Finding 2.11: Deshabilitar el filtro 4 produce `NaN`  [ACCEPTED]
**Fallo:** el source inicializa `classPrice = currentPrice = baseFare` como valores neutros. Así un filtro deshabilitado nunca deja valores `undefined`, sin que el runner necesite reglas especiales.

### Finding 2.12: Los datos mock no permiten armar los casos de Postman  [ACCEPTED]
**Fallo:** es correcto, porque Postman no puede inyectar datos en el servidor. Se agregan `P008` (GOLD niño) y `P009` (SILVER senior). Los resultados esperados se recalcularon: 422.00 con P008 en LA4567 y 3397.48 con P009 en IB6841.

### Finding 2.13: `departureAt` y `departureDate` no coinciden  [ACCEPTED]
**Fallo:** se escriben las comparaciones exactas en el filtro 2, y en el filtro 1 la edad se calcula con `reservation.departureDate`.

### Finding 2.14: Falta `cacheTtlMs` en las opciones de `getRates`  [ACCEPTED]
**Fallo:** se agrega a `opts`, lo que coincide con lo decidido en R1 F5.

### Finding 2.15: Los ids que faltan se cuentan como repetidos  [ACCEPTED]
**Fallo:** la unicidad se controla solo entre los ids enviados.

---

## Ronda 3 — Bridge A, misma conversación

- **Veredicto del revisor:** `VERDICT: APPROVED`
- **Hallazgos:** 3 notas de severidad baja (F16–F18)
- **Resultado:** las 3 se aceptaron y se incorporaron al PLAN v4.

### Finding 3.16: Redondear `totalLocal`  [ACCEPTED]
**Fallo:** `totalLocal` usa la misma función de redondeo (`round2`) que el resto de los montos.

### Finding 3.17: El filtro 3 puede fallar si no hay vuelo cargado  [ACCEPTED]
**Fallo:** si falta el vuelo, el filtro 3 emite el warning `EXCHANGE_RATE_SKIPPED_NO_FLIGHT` y deja la reserva en USD. Después el filtro 4 la rechaza con `MISSING_DATA`.

### Finding 3.18: Reservas malformadas sin `id`  [ACCEPTED]
**Fallo:** el source genera un UUID para esas reservas.

---

## Cierre de la Fase 2

- **Rondas:** 3 de 5.
- **Hallazgos totales:** 18. Se aceptaron 16 completos, 1 en parte y 1 se rechazó (F8).
- **Estado del plan:** convergió en la v4.
- **Próximo paso:** que el usuario apruebe el plan antes de escribir código. En la Fase 3, quien construye no audita su propio diff.

---

## Cambios de la v5 — tomados del plan externo (`../plan-a0068662f1436408.md`, escrito por `devin-local`)

El usuario pidió incorporar lo que ese plan tenía y el nuestro no. Como algunos cambios tocan el diseño, la v5 vuelve a la Fase 2 (ronda 4).

| Origen | Cambio en la v5 |
|---|---|
| Plan externo: `exchangeRateEnrichment` + `currencyConversion` | Filtro 3 solo obtiene la tasa (`ctx.exchangeRate`); nuevo **filtro 8 `currencyConversion`** (no crítico) calcula `baseFareLocal` y `totalLocal`. El sink ya no calcula nada: se revierte el rechazo parcial de R1 F1. ADR-007. |
| Plan externo: docs de arquitectura | §10.1: `architecture.md` con matriz de trazabilidad, 5 escenarios de calidad (AC-001..005), 8 ADRs, etiquetas de evidencia Propuesta/Confirmada, diagrama con Archify. |
| Plan externo: riesgos | §12.1: endpoints de configuración sin autenticación; estado en memoria sin escalado horizontal. Suma nuestra: ExchangeRate-API v4 responde con `WARNING_UPGRADE_TO_V6` (verificado con curl el 17/09). |
| Plan externo: detalles prácticos | Versiones exactas de las dependencias (publicadas hace más de 7 días); §14 flujo git en la rama del usuario, sin atribución y sin push. |
| Usuario | Destino del código: repo `ejercicio1-arq-2026`, rama creada por el usuario. |

---

## Ronda 4 — Bridge A, misma conversación (revisión de la v5)

- **Veredicto del revisor:** `VERDICT: APPROVED`
- **Hallazgos:** 2 notas de severidad baja (F19–F20)
- **Resultado:** las 2 se aceptaron.

### Finding 4.19: El filtro 8 puede generar `NaN` si faltan montos  [ACCEPTED]
**Fallo:** si falta `baseFare` o no hay ni `total` ni `currentPrice`, el filtro 8 no hace nada.

### Finding 4.20: Campos locales con el filtro 8 deshabilitado  [ACCEPTED]
**Fallo:** `baseFareLocal` y `totalLocal` se omiten, nunca valen `null`, y un test lo verifica.

## Cierre (actualizado)

- **Rondas:** 4 de 5.
- **Hallazgos totales:** 20. Se aceptaron 18 completos, 1 en parte y 1 se rechazó (F8). R1 F1 quedó resuelto del todo con el filtro 8.
- **Estado del plan:** v5 aprobada. Falta que el usuario la apruebe y elija la ruta de construcción; el código va en la rama que cree el usuario en `ejercicio1-arq-2026`.

---

## Cambios de la v6: documentación alineada con las reglas de la cátedra (`Recursos Documentacion/arquitectura.md`)

Se revisó la v5 contra las reglas de la cátedra (SADP 2.0, plantillas de vista y ADR de Merson, TS-4619 y condiciones de uso de IA). La §10 se reescribió completa:

| Faltaba en la v5 | Cambio en la v6 |
|---|---|
| El documento no seguía la estructura del SADP 2.0 | §10.1: `architecture.md` con las secciones 1 a 3.4.2 y anexos. |
| IDs propios (`RF-01`, `DD-001`) | §10.2: `RF n`, `AC n` y `RS n` en las tablas del SADP, con los requerimientos organizacionales. |
| Escenarios sin medida numérica | §10.3: 7 escenarios de 6 partes con medida (se agregaron testeabilidad y confiabilidad de la entrada), cada uno con su test en §9. |
| No había diagrama de contexto, vistas de uso y layers, vista de instalación ni modelo de datos | §10.4: diagramas D1 a D11 asignados a su vista del SADP. |
| No se exigían leyendas ni las reglas de diagramas | §10.4: las 7 reglas de Merson son obligatorias; se distinguen llamadas locales y remotas, síncronas y asíncronas. |
| Faltaban catálogo, interfaces y guía de variabilidad | §10.4: se agregan. |
| No estaba la cadena atributo → táctica → tecnología | §10.5: anexo A. |
| No había sección "Uso de IA" (obligatoria) | §10.7: se agrega en el anexo C y en el README. |
| ADR sin "Justificación" ni "Estado" | §10.8: plantilla oficial en español; se agregan ADR-009 (Zod y *fail-fast*) y ADR-010 (Pino). |
| No había checklist de cierre | Se agrega al final de la §10. |

---

## Ronda 5 — Bridge A, misma conversación (revisión de la v6 contra `arquitectura.md`, enviada por stdin en formato `stream-json`)

- **Veredicto del revisor:** `VERDICT: APPROVED`
- **Hallazgos:** 5 notas de severidad baja (F21–F25)
- **Resultado del arbitraje:** 3 aceptadas, 1 aceptada en parte y 1 aceptada con otro formato. Con esto queda la v7.

### Finding 5.21: Demasiada documentación para un práctico  [ACCEPTED — parcial]
**Fallo:**
- Se acepta con la regla de oro 7. La vista de uso y la de layers comparten un diagrama (D3), la vista de instalación pasa a ser una tabla, y los 7 escenarios quedan dentro de `architecture.md` §2.2.2 en lugar de 7 archivos separados. Quedan 9 diagramas en vez de 11.
- Se rechaza unir la vista de descomposición con las otras y unir las vistas de despliegue e instalación: el SADP 2.0 tiene una sección para cada una, y la de descomposición (un árbol) muestra otra relación («es parte de»).

### Finding 5.22: La medida de AC 2 no se puede cumplir  [ACCEPTED]
**Fallo:** es correcto: agregar un filtro obliga a tocar la unión `FilterName`, el esquema de configuración y el registro en el service. La medida pasa a ser "0 líneas en `pipeline.ts` y en los otros filtros; ≤ 4 archivos de `src/`".

### Finding 5.23: El formato de error de AC 7 no coincide con la §7  [ACCEPTED]
**Fallo:** la reserva rechazada se verifica en `results[i].errors` (tipo `Issue`, con HTTP 200). El formato `{ error: { code, message } }` queda solo para el 400 del sobre.

### Finding 5.24: ADR para librerías de detalle  [ACCEPTED]
**Fallo:** Zod y el *fail-fast* se integran a ADR-002 (invariantes y validación en las fronteras). Pino se justifica en las decisiones de diseño de la vista C&C. Quedan 8 ADR.

### Finding 5.25: Tres formatos de ID para los escenarios  [ACCEPTED — con otro formato]
**Fallo:** se unifica el formato, pero con `AC 1` … `AC 7`, que es el que usa **el template oficial SADP 2.0** ("AC 1 Usabilidad"), y no `AC-001`. El formato `AC-00X` venía de la plantilla de ejemplo de `arquitectura.md`, que se corrigió a `AC n`. Al unir los escenarios en un solo archivo (F21), ya no hay nombres de archivo que alinear.

---

## Cierre final de la Fase 2

- **Rondas:** 5 de 5 (máximo alcanzado, con el plan aprobado).
- **Hallazgos totales:** 25. Se aceptaron 21 completos, 3 en parte o con otro formato (F1, F21, F25) y 1 se rechazó (F8).
- **Estado del plan:** **v7 aprobada.** Cualquier cambio nuevo ya no tiene rondas disponibles y requiere decisión explícita del usuario.
- **Pendiente:** que el usuario apruebe el plan, que elija la ruta de la Fase 3 (A: construye Claude y audita Antigravity; B: al revés) y que cree la rama en `ejercicio1-arq-2026`.
