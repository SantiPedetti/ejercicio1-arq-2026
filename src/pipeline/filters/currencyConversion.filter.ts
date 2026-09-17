import { addWarning, rejectReservation, ReservationContext } from '../../domain/reservationContext';
import { round2 } from '../../support/money';
import { Filter, FilterFactory } from '../filter';

const FILTER = 'currencyConversion' as const;

function warnMissingCurrency(context: ReservationContext): void {
  addWarning(
    context,
    FILTER,
    'CURRENCY_METADATA_MISSING',
    'No hay metadata de tipo de cambio en el contexto; el total se mantiene en USD'
  );
}

function applyConversion(context: ReservationContext): void {
  if (context.pricing && context.currency) {
    context.currency.convertedTotal = round2(context.pricing.totalUsd * context.currency.rate);
    context.metadata.convertedCurrency = context.currency.targetCurrency;
  }
}

class CurrencyConversionFilter implements Filter {
  readonly name = FILTER;

  execute(context: ReservationContext): ReservationContext {
    if (!context.pricing) {
      return rejectReservation(context, FILTER, 'PRICING_NOT_INITIALIZED', 'No hay desglose de precios para convertir');
    }
    if (!context.currency) {
      warnMissingCurrency(context);
      return context;
    }
    applyConversion(context);
    return context;
  }
}

export const createCurrencyConversionFilter: FilterFactory = () => new CurrencyConversionFilter();
