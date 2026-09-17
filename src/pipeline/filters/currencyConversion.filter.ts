import { addWarning, rejectReservation } from '../../domain/reservationContext';
import { round2 } from '../../support/money';
import { Filter, FilterFactory } from '../filter';

const FILTER: 'currencyConversion' = 'currencyConversion';

/**
 * Aplica la tasa obtenida por el filtro de enriquecimiento sobre el total final.
 * Se ejecuta al cierre del pipeline porque solo entonces existe un total que
 * tenga sentido convertir; no vuelve a llamar a la API externa.
 */
export const createCurrencyConversionFilter: FilterFactory = (): Filter => ({
  name: FILTER,
  execute(context) {
    const pricing = context.pricing;
    if (!pricing) {
      return rejectReservation(
        context,
        FILTER,
        'PRICING_NOT_INITIALIZED',
        'No hay desglose de precios para convertir'
      );
    }

    const currency = context.currency;
    if (!currency) {
      addWarning(
        context,
        FILTER,
        'CURRENCY_METADATA_MISSING',
        'No hay metadata de tipo de cambio en el contexto; el total se mantiene en USD'
      );
      return context;
    }

    currency.convertedTotal = round2(pricing.totalUsd * currency.rate);
    context.metadata.convertedCurrency = currency.targetCurrency;

    return context;
  }
});
