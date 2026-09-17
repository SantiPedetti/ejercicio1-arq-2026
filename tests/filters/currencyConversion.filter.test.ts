import { createContext } from '../../src/domain/reservationContext';
import { createCurrencyConversionFilter } from '../../src/pipeline/filters/currencyConversion.filter';
import { reservation, testDeps } from '../helpers/testDeps';

describe('filtro 8: currencyConversion (conversion de montos a moneda local)', () => {
  const filter = createCurrencyConversionFilter(testDeps());

  it('convierte baseFare y total sin redondear cuando hay tasa y pricing', async () => {
    const ctx = createContext(reservation());
    ctx.exchangeRate = {
      currency: 'BRL',
      rate: 5.1234,
      source: 'api',
      fetchedAt: new Date().toISOString()
    };
    ctx.pricing = {
      baseFare: 100.123,
      classPrice: 100.123,
      currentPrice: 100.123,
      total: 150.456
    };

    const result = await filter.execute(ctx);

    expect(result.conversion?.baseFareLocal).toBeCloseTo(100.123 * 5.1234, 4);
    expect(result.conversion?.totalLocal).toBeCloseTo(150.456 * 5.1234, 4);
  });

  it('no hace nada si falta exchangeRate en el contexto', async () => {
    const ctx = createContext(reservation());
    ctx.pricing = { baseFare: 100, currentPrice: 100, total: 100 };

    const result = await filter.execute(ctx);
    expect(result.conversion).toBeUndefined();
  });

  it('no hace nada si falta pricing en el contexto', async () => {
    const ctx = createContext(reservation());
    ctx.exchangeRate = {
      currency: 'BRL',
      rate: 5.2,
      source: 'api',
      fetchedAt: new Date().toISOString()
    };

    const result = await filter.execute(ctx);
    expect(result.conversion).toBeUndefined();
  });

  it('actualiza convertedTotal en context.currency si existe', async () => {
    const ctx = createContext(reservation());
    ctx.exchangeRate = {
      currency: 'EUR',
      rate: 0.9,
      source: 'api',
      fetchedAt: new Date().toISOString()
    };
    ctx.pricing = { baseFare: 100, currentPrice: 100, total: 200 };
    ctx.currency = {
      baseCurrency: 'USD',
      targetCurrency: 'EUR',
      rate: 0.9,
      rateSource: 'api',
      retrievedAt: new Date().toISOString()
    };

    const result = await filter.execute(ctx);
    expect(result.currency?.convertedTotal).toBeCloseTo(180, 2);
  });
});
