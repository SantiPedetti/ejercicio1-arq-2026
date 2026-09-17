import { ReservationContext } from '../../domain/reservationContext';
import { Filter, FilterFactory } from '../filter';

const FILTER = 'currencyConversion' as const;

function computeLocalAmounts(pricing: ReservationContext['pricing'], rate: number) {
  if (!pricing) return undefined;
  const total = pricing.total ?? pricing.currentPrice;
  if (typeof pricing.baseFare !== 'number' || typeof total !== 'number') return undefined;
  return { baseFareLocal: pricing.baseFare * rate, totalLocal: total * rate };
}

function calculateConversion(context: ReservationContext): ReservationContext {
  if (!context.exchangeRate || !context.pricing) return context;
  const amounts = computeLocalAmounts(context.pricing, context.exchangeRate.rate);
  if (!amounts) return context;
  return {
    ...context,
    conversion: amounts,
    ...(context.currency ? { currency: { ...context.currency, convertedTotal: amounts.totalLocal } } : {})
  };
}

class CurrencyConversionFilter implements Filter {
  readonly name = FILTER;
  readonly critical = false;

  execute(context: ReservationContext): ReservationContext {
    return calculateConversion(context);
  }
}

export const createCurrencyConversionFilter: FilterFactory = () => new CurrencyConversionFilter();
