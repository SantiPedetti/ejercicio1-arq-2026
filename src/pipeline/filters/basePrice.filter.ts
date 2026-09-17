import { rejectReservation, ReservationContext } from '../../domain/reservationContext';
import { PriceBreakdown } from '../../domain/types';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

const FILTER = 'basePrice' as const;

function calculatePricing(baseFare: number, multiplier: number): PriceBreakdown {
  const classPrice = baseFare * multiplier;
  return {
    baseFare,
    classPrice,
    currentPrice: classPrice,
    loyaltyDiscount: 0,
    passengerTypeDiscount: 0
  };
}

function rejectSeatClass(context: ReservationContext): ReservationContext {
  return rejectReservation(
    context,
    FILTER,
    'SEAT_CLASS_NOT_CONFIGURED',
    `No hay multiplicador configurado para la clase ${context.request.seatClass}`
  );
}

class BasePriceFilter implements Filter {
  readonly name = FILTER;
  readonly critical = true;

  constructor(private readonly config: FilterDependencies['config']) {}

  execute(context: ReservationContext): ReservationContext {
    if (!context.flight) {
      return rejectReservation(context, FILTER, 'MISSING_DATA', 'No se puede calcular el precio base sin un vuelo resuelto en el contexto');
    }
    const mult = this.config.seatClassMultipliers[context.request.seatClass];
    if (typeof mult !== 'number') return rejectSeatClass(context);
    const pricing = calculatePricing(context.flight.baseFare, mult);
    return { ...context, pricing, metadata: { ...context.metadata, seatClassMultiplier: mult, seats: 1 } };
  }
}

export const createBasePriceFilter: FilterFactory = ({ config }) => new BasePriceFilter(config);
