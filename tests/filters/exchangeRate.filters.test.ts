import { createContext } from '../../src/domain/reservationContext';
import { createCurrencyConversionFilter } from '../../src/pipeline/filters/currencyConversion.filter';
import { createExchangeRateEnrichmentFilter } from '../../src/pipeline/filters/exchangeRateEnrichment.filter';
import { flightRepository } from '../../src/repositories/flightRepository';
import {
  contextFor,
  failingRateProvider,
  issueCodes,
  reservation,
  stubRateProvider,
  testDeps
} from '../helpers/testDeps';

function contextWithFlight(flightCode: string) {
  const context = createContext(reservation({ flightCode }));
  context.flight = flightRepository.findByCode(flightCode);
  return context;
}

describe('filtro de enriquecimiento con tipo de cambio', () => {
  it('detecta la moneda del pais de destino y guarda la tasa en el contexto', async () => {
    const filter = createExchangeRateEnrichmentFilter(
      testDeps({ exchangeRates: stubRateProvider({ rate: 5.1 }) })
    );

    const context = await filter.execute(contextWithFlight('LA4567'));

    expect(context.currency).toMatchObject({
      baseCurrency: 'USD',
      targetCurrency: 'BRL',
      rate: 5.1,
      rateSource: 'api'
    });
    expect(context.issues).toHaveLength(0);
  });

  it('avisa con un warning cuando la tasa proviene del respaldo configurado', async () => {
    const filter = createExchangeRateEnrichmentFilter(
      testDeps({ exchangeRates: stubRateProvider({ source: 'fallback', rate: 1000 }) })
    );

    const context = await filter.execute(contextWithFlight('AF0416'));

    expect(issueCodes(context)).toEqual(['EXCHANGE_RATE_FALLBACK']);
    expect(context.currency?.rateSource).toBe('fallback');
  });

  it('continua en USD con un warning si la integracion falla por completo', async () => {
    const filter = createExchangeRateEnrichmentFilter(
      testDeps({ exchangeRates: failingRateProvider('timeout de 5000 ms') })
    );

    const context = await filter.execute(contextWithFlight('LA800'));

    expect(context.status).toBe('pending');
    expect(context.aborted).toBe(false);
    expect(issueCodes(context)).toEqual(['EXCHANGE_RATE_UNAVAILABLE']);
    expect(context.currency).toMatchObject({ targetCurrency: 'USD', rate: 1, rateSource: 'identity' });
  });

  it('advierte cuando no hay vuelo resuelto en el contexto', async () => {
    const filter = createExchangeRateEnrichmentFilter(testDeps());

    const context = await filter.execute(contextFor());

    expect(issueCodes(context)).toEqual(['FLIGHT_NOT_RESOLVED']);
    expect(context.currency).toBeUndefined();
  });

  it('no convierte cuando el destino usa la misma moneda base', async () => {
    const filter = createExchangeRateEnrichmentFilter(
      testDeps({ exchangeRates: stubRateProvider({ rate: 1, source: 'identity' }) })
    );

    const context = await filter.execute(contextWithFlight('AA001'));

    expect(context.currency).toMatchObject({ targetCurrency: 'USD', rate: 1 });
    expect(context.issues).toHaveLength(0);
  });
});

describe('filtro de conversion de moneda', () => {
  const filter = createCurrencyConversionFilter(testDeps());

  it('aplica la tasa obtenida sobre el total final', async () => {
    const context = contextWithFlight('LA4567');
    context.pricing = {
      flightBasePriceUsd: 180,
      classAdjustedPriceUsd: 180,
      loyaltyDiscountUsd: 0,
      passengerTypeDiscountUsd: 0,
      netPriceUsd: 180,
      taxesUsd: 21.6,
      airportFeeUsd: 25,
      fuelSurchargeUsd: 14.4,
      totalUsd: 241
    };
    context.currency = {
      baseCurrency: 'USD',
      targetCurrency: 'BRL',
      rate: 5.2,
      rateSource: 'api',
      retrievedAt: '2026-01-01T00:00:00.000Z'
    };

    const result = await filter.execute(context);

    expect(result.currency?.convertedTotal).toBe(1253.2);
    expect(result.metadata.convertedCurrency).toBe('BRL');
  });

  it('mantiene el total en USD con un warning si falta la metadata de moneda', async () => {
    const context = contextWithFlight('LA4567');
    context.pricing = {
      flightBasePriceUsd: 180,
      classAdjustedPriceUsd: 180,
      loyaltyDiscountUsd: 0,
      passengerTypeDiscountUsd: 0,
      netPriceUsd: 180,
      taxesUsd: 0,
      airportFeeUsd: 0,
      fuelSurchargeUsd: 0,
      totalUsd: 180
    };

    const result = await filter.execute(context);

    expect(issueCodes(result)).toEqual(['CURRENCY_METADATA_MISSING']);
  });
});
