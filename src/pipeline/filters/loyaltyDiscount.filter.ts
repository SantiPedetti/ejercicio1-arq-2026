import { addWarning, rejectReservation, ReservationContext } from '../../domain/reservationContext';
import { round2 } from '../../support/money';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

const FILTER = 'loyaltyDiscount' as const;

function rejectUninitializedPricing(context: ReservationContext): ReservationContext {
  return rejectReservation(
    context,
    FILTER,
    'PRICING_NOT_INITIALIZED',
    'No hay desglose de precios; el filtro de precio base debe ejecutarse antes'
  );
}

function applyLoyaltyDiscount(
  pricing: NonNullable<ReservationContext['pricing']>,
  rate: number
): void {
  const discount = round2(pricing.netPriceUsd * rate);
  pricing.loyaltyDiscountUsd = discount;
  pricing.netPriceUsd = round2(pricing.netPriceUsd - discount);
  pricing.totalUsd = pricing.netPriceUsd;
}

function resolveLoyaltyRate(
  context: ReservationContext,
  discounts: FilterDependencies['config']['loyaltyDiscounts']
): number | undefined {
  const tier = context.passenger?.loyaltyTier;
  if (!tier) {
    addWarning(context, FILTER, 'PASSENGER_NOT_RESOLVED', 'Sin pasajero resuelto no se aplica descuento por lealtad');
    return undefined;
  }
  return discounts[tier] ?? 0;
}

class LoyaltyDiscountFilter implements Filter {
  readonly name = FILTER;

  constructor(private readonly config: FilterDependencies['config']) {}

  execute(context: ReservationContext): ReservationContext {
    if (!context.pricing) return rejectUninitializedPricing(context);
    const rate = resolveLoyaltyRate(context, this.config.loyaltyDiscounts);
    if (typeof rate === 'number') {
      applyLoyaltyDiscount(context.pricing, rate);
      context.metadata.loyaltyDiscountRate = rate;
    }
    return context;
  }
}

export const createLoyaltyDiscountFilter: FilterFactory = ({ config }) => new LoyaltyDiscountFilter(config);
