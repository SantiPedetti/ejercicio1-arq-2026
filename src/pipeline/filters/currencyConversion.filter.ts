import { addWarning, rejectReservation, ReservationContext } from '../../domain/reservationContext';
import { Filter, FilterFactory } from '../filter';

const FILTER = 'currencyConversion' as const;

function warnMissingCurrency(context: ReservationContext): ReservationContext {
  return addWarning(
    context,
    FILTER,
    'CURRENCY_METADATA_MISSING',
    'No hay metadata de tipo de cambio en el contexto; el total se mantiene en USD'
  );
}

function applyConversion(context: ReservationContext): ReservationContext {
  if (!context.pricing || !context.currency) return context;
  const total = context.pricing.total ?? context.pricing.currentPrice ?? 0;
  const convertedTotal = total * context.currency.rate;
  return {
    ...context,
    currency: { ...context.currency, convertedTotal },
    metadata: { ...context.metadata, convertedCurrency: context.currency.targetCurrency }
  };
}

class CurrencyConversionFilter implements Filter {
  readonly name = FILTER;
  readonly critical = false;

  execute(context: ReservationContext): ReservationContext {
    if (!context.pricing) {
      return rejectReservation(context, FILTER, 'MISSING_DATA', 'No hay desglose de precios para convertir');
    }
    if (!context.currency) {
      return warnMissingCurrency(context);
    }
    return applyConversion(context);
  }
}

export const createCurrencyConversionFilter: FilterFactory = () => new CurrencyConversionFilter();
