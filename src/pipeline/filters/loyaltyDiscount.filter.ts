import { addWarning, rejectReservation } from '../../domain/reservationContext';
import { round2 } from '../../support/money';
import { Filter, FilterFactory } from '../filter';

const FILTER: 'loyaltyDiscount' = 'loyaltyDiscount';

/**
 * Aplica el descuento del tier de lealtad sobre el precio neto acumulado.
 * Los descuentos del pipeline se componen en cascada, en el orden de los filtros.
 */
export const createLoyaltyDiscountFilter: FilterFactory = ({ config }): Filter => ({
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

    const tier = context.passenger?.loyaltyTier;
    if (!tier) {
      addWarning(context, FILTER, 'PASSENGER_NOT_RESOLVED', 'Sin pasajero resuelto no se aplica descuento por lealtad');
      return context;
    }

    const rate = config.loyaltyDiscounts[tier] ?? 0;
    const discount = round2(pricing.netPriceUsd * rate);

    pricing.loyaltyDiscountUsd = discount;
    pricing.netPriceUsd = round2(pricing.netPriceUsd - discount);
    pricing.totalUsd = pricing.netPriceUsd;
    context.metadata.loyaltyDiscountRate = rate;

    return context;
  }
});
