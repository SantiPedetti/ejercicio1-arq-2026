import { addWarning } from '../../domain/reservationContext';
import { currencyForCountry, UNKNOWN_COUNTRY_FALLBACK_CURRENCY } from '../../services/exchangeRate/countryCurrency';
import { Filter, FilterFactory } from '../filter';

const FILTER: 'exchangeRateEnrichment' = 'exchangeRateEnrichment';

/**
 * Unico punto del pipeline que habla con la API externa. Detecta la moneda del
 * pais de destino, obtiene la tasa vigente y la deja en el contexto para que el
 * filtro de conversion la aplique sobre el total ya calculado.
 *
 * Si la integracion falla, la reserva continua en USD con un warning: la
 * disponibilidad del procesamiento no depende del proveedor externo.
 */
export const createExchangeRateEnrichmentFilter: FilterFactory = ({ config, exchangeRates, logger }): Filter => ({
  name: FILTER,
  async execute(context) {
    const baseCurrency = config.exchangeRate.baseCurrency.toUpperCase();
    const flight = context.flight;

    if (!flight) {
      addWarning(
        context,
        FILTER,
        'FLIGHT_NOT_RESOLVED',
        'No hay vuelo resuelto en el contexto, no se puede determinar la moneda de destino'
      );
      return context;
    }

    let targetCurrency = currencyForCountry(flight.destinationCountryCode);
    if (!targetCurrency) {
      addWarning(
        context,
        FILTER,
        'UNKNOWN_DESTINATION_CURRENCY',
        `No hay moneda mapeada para el pais ${flight.destinationCountryCode}; se mantiene ${UNKNOWN_COUNTRY_FALLBACK_CURRENCY}`
      );
      targetCurrency = UNKNOWN_COUNTRY_FALLBACK_CURRENCY;
    }

    try {
      const result = await exchangeRates.getRate(targetCurrency);
      context.currency = {
        baseCurrency: result.baseCurrency,
        targetCurrency: result.targetCurrency,
        rate: result.rate,
        rateSource: result.source,
        retrievedAt: result.retrievedAt
      };

      if (result.source === 'fallback') {
        addWarning(
          context,
          FILTER,
          'EXCHANGE_RATE_FALLBACK',
          `Se aplico la tasa de respaldo configurada para ${result.targetCurrency} porque la API externa no respondio`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('No se pudo enriquecer la reserva con tipo de cambio', {
        reservationId: context.request.reservationId,
        targetCurrency,
        error: message
      });
      addWarning(
        context,
        FILTER,
        'EXCHANGE_RATE_UNAVAILABLE',
        `No se pudo obtener la tasa de cambio (${message}); la reserva continua en ${baseCurrency}`
      );
      context.currency = {
        baseCurrency,
        targetCurrency: baseCurrency,
        rate: 1,
        rateSource: 'identity',
        retrievedAt: new Date().toISOString()
      };
    }

    return context;
  }
});
