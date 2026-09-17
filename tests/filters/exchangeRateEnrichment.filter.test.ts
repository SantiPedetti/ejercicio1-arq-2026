import { createContext } from '../../src/domain/reservationContext';
import { createExchangeRateEnrichmentFilter } from '../../src/pipeline/filters/exchangeRateEnrichment.filter';
import {
  failingRateProvider,
  issueCodes,
  reservation,
  stubRateProvider,
  testDeps,
  testFlights
} from '../helpers/testDeps';

describe('filtro 3: exchangeRateEnrichment (enriquecimiento con tipo de cambio)', () => {
  it('enriquece con tasa obtenida de la API', async () => {
    const filter = createExchangeRateEnrichmentFilter(
      testDeps({ exchangeRates: stubRateProvider({ rate: 5.2, source: 'api' }) })
    );
    const flight = testFlights.findByCode('LA4567'); // destino BR -> BRL
    const ctx = createContext(reservation({ flightCode: 'LA4567' }), { flight });

    const result = await filter.execute(ctx);
    expect(result.exchangeRate).toMatchObject({
      currency: 'BRL',
      rate: 5.2,
      source: 'api'
    });
    expect(issueCodes(result)).toHaveLength(0);
  });

  it('omite enriquecimiento con warning EXCHANGE_RATE_SKIPPED_NO_FLIGHT si no hay vuelo', async () => {
    const filter = createExchangeRateEnrichmentFilter(testDeps());
    const ctx = createContext(reservation());

    const result = await filter.execute(ctx);
    expect(result.exchangeRate).toBeUndefined();
    expect(issueCodes(result)).toEqual(['EXCHANGE_RATE_SKIPPED_NO_FLIGHT']);
  });

  it('emite warning UNKNOWN_CURRENCY si el pais de destino no tiene moneda mapeada', async () => {
    const filter = createExchangeRateEnrichmentFilter(testDeps());
    const baseFlight = testFlights.findByCode('AA001');
    expect(baseFlight).toBeDefined();
    if (!baseFlight) return;
    const flight = { ...baseFlight, destinationCountry: 'XX' };
    const ctx = createContext(reservation(), { flight });

    const result = await filter.execute(ctx);
    expect(result.exchangeRate).toBeUndefined();
    expect(issueCodes(result)).toContain('UNKNOWN_CURRENCY');
  });

  it('emite warning UNKNOWN_CURRENCY si la moneda no esta en las tasas del proveedor', async () => {
    const filter = createExchangeRateEnrichmentFilter(
      testDeps({ exchangeRates: stubRateProvider({ rates: { EUR: 0.92 } }) })
    );
    const flight = testFlights.findByCode('LA4567'); // BR -> BRL (ausente)
    const ctx = createContext(reservation(), { flight });

    const result = await filter.execute(ctx);
    expect(result.exchangeRate).toBeUndefined();
    expect(issueCodes(result)).toContain('UNKNOWN_CURRENCY');
  });

  it('emite warning STALE_RATE cuando se usa una tasa vencida', async () => {
    const filter = createExchangeRateEnrichmentFilter(
      testDeps({ exchangeRates: stubRateProvider({ rate: 5.2, source: 'stale-cache' }) })
    );
    const flight = testFlights.findByCode('LA4567');
    const ctx = createContext(reservation(), { flight });

    const result = await filter.execute(ctx);
    expect(result.exchangeRate?.source).toBe('stale-cache');
    expect(issueCodes(result)).toContain('STALE_RATE');
  });

  it('emite warning EXCHANGE_RATE_UNAVAILABLE si la API falla y no hay cache', async () => {
    const filter = createExchangeRateEnrichmentFilter(
      testDeps({ exchangeRates: failingRateProvider('API caida') })
    );
    const flight = testFlights.findByCode('LA4567');
    const ctx = createContext(reservation(), { flight });

    const result = await filter.execute(ctx);
    expect(result.exchangeRate).toBeUndefined();
    expect(issueCodes(result)).toContain('EXCHANGE_RATE_UNAVAILABLE');
  });

  it('no consulta la API si la moneda destino es igual a la base (USD)', async () => {
    const getRatesSpy = jest.fn();
    const provider = {
      ...stubRateProvider(),
      getRates: getRatesSpy
    };
    const filter = createExchangeRateEnrichmentFilter(testDeps({ exchangeRates: provider }));
    const flight = testFlights.findByCode('AA0002'); // destino US -> USD
    const ctx = createContext(reservation({ flightCode: 'AA0002' }), { flight });

    const result = await filter.execute(ctx);
    expect(getRatesSpy).not.toHaveBeenCalled();
    expect(result.exchangeRate).toBeUndefined();
  });
});
