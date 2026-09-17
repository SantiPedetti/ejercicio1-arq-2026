import { addWarning, rejectReservation, ReservationContext } from '../../domain/reservationContext';
import { PriceBreakdown } from '../../domain/types';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

const FILTER = 'loyaltyDiscount' as const;

function rejectUninitializedPricing(context: ReservationContext): ReservationContext {
  return rejectReservation(
    context,
    FILTER,
    'MISSING_DATA',
    'No hay desglose de precios; el filtro de precio base debe ejecutarse antes'
  );
}

function applyLoyaltyDiscount(pricing: PriceBreakdown, rate: number): PriceBreakdown {
  const current = pricing.currentPrice ?? 0;
  const discount = current * rate;
  const newCurrent = current - discount;
  return {
    ...pricing,
    loyaltyDiscount: discount,
    currentPrice: newCurrent
  };
}

function resolveLoyaltyRate(
  context: ReservationContext,
  discounts: FilterDependencies['config']['loyaltyDiscounts']
): { context: ReservationContext; rate?: number } {
  const tier = context.passenger?.loyaltyTier;
  if (!tier) {
    const updated = addWarning(context, FILTER, 'PASSENGER_NOT_RESOLVED', 'Sin pasajero resuelto no se aplica descuento por lealtad');
    return { context: updated };
  }
  return { context, rate: discounts[tier] ?? 0 };
}

class LoyaltyDiscountFilter implements Filter {
  readonly name = FILTER;
  readonly critical = true;

  constructor(private readonly config: FilterDependencies['config']) {}

  execute(context: ReservationContext): ReservationContext {
    if (!context.pricing) return rejectUninitializedPricing(context);
    const { context: ctx, rate } = resolveLoyaltyRate(context, this.config.loyaltyDiscounts);
    if (typeof rate !== 'number' || rate === 0) return ctx;
    const pricing = applyLoyaltyDiscount(context.pricing, rate);
    return {
      ...ctx,
      pricing,
      metadata: { ...ctx.metadata, loyaltyDiscountRate: rate }
    };
  }
}

export const createLoyaltyDiscountFilter: FilterFactory = ({ config }) => new LoyaltyDiscountFilter(config);
