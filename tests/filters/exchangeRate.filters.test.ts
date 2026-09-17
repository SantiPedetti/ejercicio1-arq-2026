import { createContext } from '../../src/domain/reservationContext';
import { createCurrencyConversionFilter } from '../../src/pipeline/filters/currencyConversion.filter';
import { createExchangeRateEnrichmentFilter } from '../../src/pipeline/filters/exchangeRateEnrichment.filter';
import { toReservationResult } from '../../src/services/reservationResult';
import {
  contextFor,
  failingRateProvider,
  issueCodes,
  reservation,
  stubRateProvider,
  testDeps,
  testFlights
} from '../helpers/testDeps';

function contextWithFlight(flightCode: string) {
  const context = createContext(reservation({ flightCode }));
  context.flight = testFlights.findByCode(flightCode);
  return context;
}

describe('filtros 3 (exchangeRateEnrichment) y 8 (currencyConversion)', () => {
  const filter8 = createCurrencyConversionFilter(testDeps());

  it('tasa ok: enriquece con la tasa obtenida y el filtro 8 convierte los montos sin redondear', async () => {
    const filter3 = createExchangeRateEnrichmentFilter(
      testDeps({ exchangeRates: stubRateProvider({ rate: 5.1234, source: 'api' }) })
    );

    const context = contextWithFlight('LA4567');
    context.pricing = {
      baseFare: 180.456,
      classPrice: 180.456,
      currentPrice: 180.456,
      subtotal: 180.456,
      taxes: 21.65,
      fuelSurcharge: 14.43,
      airportFee: 25,
      total: 241.536
    };

    const enriched = await filter3.execute(context);

    expect(enriched.exchangeRate).toMatchObject({
      currency: 'BRL',
      rate: 5.1234,
      source: 'api'
    });
    expect(issueCodes(enriched)).toHaveLength(0);

    const converted = await filter8.execute(enriched);

    expect(converted.conversion?.baseFareLocal).toBeCloseTo(180.456 * 5.1234, 4);
    expect(converted.conversion?.totalLocal).toBeCloseTo(241.536 * 5.1234, 4);
  });

  it('tasa vencida con STALE_RATE: emite warning y convierte montos', async () => {
    const filter3 = createExchangeRateEnrichmentFilter(
      testDeps({ exchangeRates: stubRateProvider({ rate: 5.2, source: 'stale-cache' }) })
    );

    const context = contextWithFlight('LA4567');
    context.pricing = {
      baseFare: 200,
      classPrice: 200,
      currentPrice: 200,
      total: 249
    };

    const enriched = await filter3.execute(context);

    expect(enriched.exchangeRate).toMatchObject({
      currency: 'BRL',
      rate: 5.2,
      source: 'stale-cache'
    });
    expect(issueCodes(enriched)).toContain('STALE_RATE');

    const converted = await filter8.execute(enriched);
    expect(converted.conversion?.baseFareLocal).toBeCloseTo(1040, 2);
    expect(converted.conversion?.totalLocal).toBeCloseTo(1294.8, 2);
  });

  it('sin tasa con EXCHANGE_RATE_UNAVAILABLE y conversion null', async () => {
    const filter3 = createExchangeRateEnrichmentFilter(
      testDeps({ exchangeRates: failingRateProvider('API caída') })
    );

    const context = contextWithFlight('LA4567');
    context.pricing = {
      baseFare: 200,
      classPrice: 200,
      currentPrice: 200,
      total: 249
    };

    const enriched = await filter3.execute(context);

    expect(enriched.exchangeRate).toBeUndefined();
    expect(issueCodes(enriched)).toContain('EXCHANGE_RATE_UNAVAILABLE');

    const converted = await filter8.execute(enriched);
    expect(converted.conversion).toBeUndefined();

    const output = toReservationResult(converted);
    expect(output.conversion).toBeNull();
  });

  it('UNKNOWN_CURRENCY cuando el pais de destino no tiene moneda mapeada', async () => {
    const filter3 = createExchangeRateEnrichmentFilter(testDeps());
    const context = contextWithFlight('LA4567');
    if (context.flight) {
      context.flight = { ...context.flight, destinationCountry: 'XX' };
    }

    const enriched = await filter3.execute(context);

    expect(enriched.exchangeRate).toBeUndefined();
    expect(issueCodes(enriched)).toContain('UNKNOWN_CURRENCY');

    const converted = await filter8.execute(enriched);
    const output = toReservationResult(converted);
    expect(output.conversion).toBeNull();
  });

  it('UNKNOWN_CURRENCY cuando la moneda no esta en las tasas del proveedor', async () => {
    const filter3 = createExchangeRateEnrichmentFilter(
      testDeps({
        exchangeRates: stubRateProvider({ rates: { EUR: 0.92 } })
      })
    );

    const context = contextWithFlight('LA4567'); // destino BR -> BRL, no presente en rates
    const enriched = await filter3.execute(context);

    expect(enriched.exchangeRate).toBeUndefined();
    expect(issueCodes(enriched)).toContain('UNKNOWN_CURRENCY');
  });

  it('sin vuelo emite warning EXCHANGE_RATE_SKIPPED_NO_FLIGHT', async () => {
    const filter3 = createExchangeRateEnrichmentFilter(testDeps());
    const context = contextFor();

    const enriched = await filter3.execute(context);

    expect(enriched.exchangeRate).toBeUndefined();
    expect(issueCodes(enriched)).toEqual(['EXCHANGE_RATE_SKIPPED_NO_FLIGHT']);
  });

  it('filtro 8 deshabilitado omite campos locales en la salida final', async () => {
    const filter3 = createExchangeRateEnrichmentFilter(
      testDeps({ exchangeRates: stubRateProvider({ rate: 5.2, source: 'api' }) })
    );

    const context = contextWithFlight('LA4567');
    context.pricing = {
      baseFare: 200,
      total: 249
    };

    const enriched = await filter3.execute(context);
    expect(enriched.exchangeRate).toBeDefined();

    // El filtro 8 esta deshabilitado, por lo que no se ejecuta y context.conversion queda undefined
    const output = toReservationResult(enriched);

    expect(output.conversion).toEqual({
      currency: 'BRL',
      rate: 5.2,
      source: 'api',
      fetchedAt: expect.any(String)
    });
    expect(output.conversion?.baseFareLocal).toBeUndefined();
    expect(output.conversion?.totalLocal).toBeUndefined();
    expect(output.conversion).not.toHaveProperty('baseFareLocal');
    expect(output.conversion).not.toHaveProperty('totalLocal');
  });
});
