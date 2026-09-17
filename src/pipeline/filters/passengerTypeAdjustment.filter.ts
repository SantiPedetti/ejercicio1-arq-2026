import { addWarning, rejectReservation, ReservationContext } from '../../domain/reservationContext';
import { PriceBreakdown } from '../../domain/types';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

const FILTER = 'passengerTypeAdjustment' as const;

function rejectUninitializedPricing(context: ReservationContext): ReservationContext {
  return rejectReservation(
    context,
    FILTER,
    'MISSING_DATA',
    'No hay desglose de precios; el filtro de precio base debe ejecutarse antes'
  );
}

function applyTypeDiscount(pricing: PriceBreakdown, rate: number): PriceBreakdown {
  const current = pricing.currentPrice ?? 0;
  const discount = current * rate;
  const newCurrent = current - discount;
  return {
    ...pricing,
    passengerTypeDiscount: discount,
    currentPrice: newCurrent
  };
}

function resolvePassengerTypeRate(
  context: ReservationContext,
  discounts: FilterDependencies['config']['passengerTypeDiscounts']
): { context: ReservationContext; rate?: number } {
  const passengerType = context.request.passengerType;
  if (!passengerType) {
    const updated = addWarning(context, FILTER, 'PASSENGER_NOT_RESOLVED', 'Sin tipo de pasajero no se aplica ajuste');
    return { context: updated };
  }
  return { context, rate: discounts[passengerType] ?? 0 };
}

class PassengerTypeAdjustmentFilter implements Filter {
  readonly name = FILTER;
  readonly critical = true;

  constructor(private readonly config: FilterDependencies['config']) {}

  execute(context: ReservationContext): ReservationContext {
    if (!context.pricing) return rejectUninitializedPricing(context);
    const { context: ctx, rate } = resolvePassengerTypeRate(context, this.config.passengerTypeDiscounts);
    if (typeof rate !== 'number' || rate === 0) return ctx;
    const pricing = applyTypeDiscount(context.pricing, rate);
    return {
      ...ctx,
      pricing,
      metadata: { ...ctx.metadata, passengerTypeDiscountRate: rate }
    };
  }
}

export const createPassengerTypeAdjustmentFilter: FilterFactory = ({ config }) =>
  new PassengerTypeAdjustmentFilter(config);
