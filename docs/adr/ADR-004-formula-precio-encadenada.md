# ADR 4: Fórmula de precio encadenada y cálculo de sobrecargo por combustible

El calculo de la tarifa de una reserva involucra multiples factores: multiplicador por clase de cabina, programas de fidelidad, politica tarifaria por franja etaria, tasas de aeropuerto e impuestos gubernamentales, y recargos operativos por combustible. Debia definirse si los descuentos se aplicaban en paralelo de forma aditiva o secuencialmente de forma encadenada, y sobre que base imponible debian imputarse el combustible y los impuestos para garantizar consistencia financiera.

## Decisión

Nosotros implementaremos una formula de precio encadenada y acumulativa a traves de los filtros 4, 5, 6 y 7 del pipeline:
1. Filtro `basePrice` (F4): calcula `classPrice = baseFare × multiplicadorClase` (Economy: 1, Business: 2.5, First: 4) y establece `currentPrice = classPrice`.
2. Filtro `loyaltyDiscount` (F5): calcula `loyaltyDiscount = currentPrice × porcentajeLealtad` y actualiza `currentPrice = currentPrice - loyaltyDiscount`.
3. Filtro `passengerTypeAdjustment` (F6): calcula `passengerTypeDiscount = currentPrice × porcentajeTipo` sobre el saldo ya descontado y actualiza `currentPrice = currentPrice - passengerTypeDiscount`.
4. Filtro `taxesAndFees` (F7): establece `subtotal = currentPrice`, computa `taxes = subtotal × 0.12`, tasa fija `airportFee = 25` USD, y calcula el recargo por combustible como **`fuelSurcharge = classPrice × 0.08`** (sobre la tarifa de clase). El total final resulta `total = subtotal + taxes + fuelSurcharge + airportFee`.
5. Los filtros no redondean centavos de forma intermedia; el redondeo a 2 decimales (`round2`) se efectua unicamente en el sink de presentacion (`toReservationResult`).

## Justificación

El encadenamiento de descuentos replica la practica estandar de la industria aerea comercial, donde las bonificaciones se computan de manera sucesiva sobre el precio vigente y no en paralelo sobre la tarifa base. Calcular el sobrecargo por combustible sobre `classPrice` garantiza que las clases premium (Business y First), que consumen mayor espacio y peso a bordo, contribuyan proporcionalmente al costo operativo de combustible, corrigiendo el diseno inicial que calculaba dicho recargo sobre la tarifa basica desajustada. Centralizar el redondeo en la proyeccion final previene el arrastre de errores de redondeo de punto flotante.

Alternativas consideradas y rechazadas:
1. Descuentos sumados de forma aditiva: Rechazada (Q2) porque al acumular porcentajes altos sobre la base se distorsionaba el margen y se corria el riesgo de sobre-bonificacion.
2. Combustible calculado sobre la tarifa base (`baseFare`): Rechazada en la revision F4 porque provocaba que un pasaje First Class pagara exactamente el mismo combustible que un pasaje Economy, lo cual distorsionaba los costos reales de operacion.
3. Redondeo en cada filtro intermedio: Rechazada porque acumulaba errores de centavos que impedian alcanzar los totales exactos fijados en el plan.

## Estado

Aceptado

## Consecuencias

Positivas:
- Coherencia matematica comprobada: los totales calculados coinciden al centavo con los casos de referencia (P007: 565.00, P001: 489.40, P008: 422.00, P009: 3397.48, P004: 3740.20 USD).
- Desacoplamiento conceptual: los filtros de descuento unicamente requieren inspeccionar y actualizar `currentPrice`.
- Desglose transparente en `pricing` (`baseFare`, `classPrice`, `currentPrice`, `subtotal`, `taxes`, `fuelSurcharge`, `airportFee`, `total`).

Negativas:
- Si se alterase el orden de ejecucion entre los filtros de descuento, la composicion encadenada dependeria de la conmutatividad estricta de sus factores porcentuales.
