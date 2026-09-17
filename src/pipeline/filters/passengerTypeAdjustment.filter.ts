import { addWarning, rejectReservation, ReservationContext } from '../../domain/reservationContext';
import { round2 } from '../../support/money';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

const FILTER = 'passengerTypeAdjustment' as const;

function rejectUninitializedPricing(context: ReservationContext): ReservationContext {
  return rejectReservation(
    context,
    FILTER,
    'PRICING_NOT_INITIALIZED',
    'No hay desglose de precios; el filtro de precio base debe ejecutarse antes'
  );
}

function applyTypeDiscount(
  pricing: NonNullable<ReservationContext['pricing']>,
  rate: number
): void {
  const discount = round2(pricing.netPriceUsd * rate);
  pricing.passengerTypeDiscountUsd = discount;
  pricing.netPriceUsd = round2(pricing.netPriceUsd - discount);
  pricing.totalUsd = pricing.netPriceUsd;
}

function resolvePassengerTypeRate(
  context: ReservationContext,
  discounts: FilterDependencies['config']['passengerTypeDiscounts']
): number | undefined {
  const passengerType = context.request.passengerType;
  if (!passengerType) {
    addWarning(context, FILTER, 'PASSENGER_NOT_RESOLVED', 'Sin tipo de pasajero no se aplica ajuste');
    return undefined;
  }
  return discounts[passengerType] ?? 0;
}

class PassengerTypeAdjustmentFilter implements Filter {
  readonly name = FILTER;

  constructor(private readonly config: FilterDependencies['config']) {}

  execute(context: ReservationContext): ReservationContext {
    if (!context.pricing) return rejectUninitializedPricing(context);
    const rate = resolvePassengerTypeRate(context, this.config.passengerTypeDiscounts);
    if (typeof rate === 'number') {
      applyTypeDiscount(context.pricing, rate);
      context.metadata.passengerTypeDiscountRate = rate;
    }
    return context;
  }
}

export const createPassengerTypeAdjustmentFilter: FilterFactory = ({ config }) =>
  new PassengerTypeAdjustmentFilter(config);
