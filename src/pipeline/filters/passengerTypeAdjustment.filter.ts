import { addWarning, rejectReservation } from '../../domain/reservationContext';
import { round2 } from '../../support/money';
import { Filter, FilterFactory } from '../filter';

const FILTER: 'passengerTypeAdjustment' = 'passengerTypeAdjustment';

/**
 * Ajusta el precio neto segun el tipo de pasajero (child, adult, senior),
 * despues del descuento por lealtad.
 */
export const createPassengerTypeAdjustmentFilter: FilterFactory = ({ config }): Filter => ({
  name: FILTER,
  execute(context) {
    const pricing = context.pricing;
    if (!pricing) {
      return rejectReservation(
        context,
        FILTER,
        'PRICING_NOT_INITIALIZED',
        'No hay desglose de precios; el filtro de precio base debe ejecutarse antes'
      );
    }

    const passengerType = context.passenger?.passengerType;
    if (!passengerType) {
      addWarning(context, FILTER, 'PASSENGER_NOT_RESOLVED', 'Sin pasajero resuelto no se aplica ajuste por tipo de pasajero');
      return context;
    }

    const rate = config.passengerTypeDiscounts[passengerType] ?? 0;
    const discount = round2(pricing.netPriceUsd * rate);

    pricing.passengerTypeDiscountUsd = discount;
    pricing.netPriceUsd = round2(pricing.netPriceUsd - discount);
    pricing.totalUsd = pricing.netPriceUsd;
    context.metadata.passengerTypeDiscountRate = rate;

    return context;
  }
});
