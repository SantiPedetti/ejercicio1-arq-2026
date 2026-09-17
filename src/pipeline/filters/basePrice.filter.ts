import { rejectReservation, ReservationContext } from '../../domain/reservationContext';
import { round2 } from '../../support/money';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

const FILTER = 'basePrice' as const;

function calculatePricing(basePriceUsd: number, seats: number, multiplier: number) {
  const flightBasePriceUsd = round2(basePriceUsd * seats);
  const classAdjustedPriceUsd = round2(flightBasePriceUsd * multiplier);
  return {
    flightBasePriceUsd,
    classAdjustedPriceUsd,
    loyaltyDiscountUsd: 0,
    passengerTypeDiscountUsd: 0,
    netPriceUsd: classAdjustedPriceUsd,
    taxesUsd: 0,
    airportFeeUsd: 0,
    fuelSurchargeUsd: 0,
    totalUsd: classAdjustedPriceUsd
  };
}

function resolveMultiplier(
  context: ReservationContext,
  multipliers: Record<string, number>
): number | ReservationContext {
  const multiplier = multipliers[context.request.seatClass];
  if (typeof multiplier !== 'number') {
    return rejectReservation(
      context,
      FILTER,
      'SEAT_CLASS_NOT_CONFIGURED',
      `No hay multiplicador configurado para la clase ${context.request.seatClass}`
    );
  }
  return multiplier;
}

function applyBasePricing(context: ReservationContext, multiplier: number): void {
  const seats = 1;
  const basePrice = context.flight?.baseFare ?? context.flight?.basePriceUsd ?? 0;
  context.pricing = calculatePricing(basePrice, seats, multiplier);
  context.metadata.seatClassMultiplier = multiplier;
  context.metadata.seats = seats;
}

class BasePriceFilter implements Filter {
  readonly name = FILTER;

  constructor(private readonly config: FilterDependencies['config']) {}

  execute(context: ReservationContext): ReservationContext {
    if (!context.flight) {
      return rejectReservation(
        context,
        FILTER,
        'FLIGHT_NOT_RESOLVED',
        'No se puede calcular el precio base sin un vuelo resuelto en el contexto'
      );
    }
    const mult = resolveMultiplier(context, this.config.seatClassMultipliers);
    if (typeof mult !== 'number') return mult;
    applyBasePricing(context, mult);
    return context;
  }
}

export const createBasePriceFilter: FilterFactory = ({ config }) => new BasePriceFilter(config);
