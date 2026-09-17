import { RatesCache } from '../../src/services/exchangeRate/ratesCache';

describe('RatesCache', () => {
  it('almacena y recupera tasas dentro del TTL', () => {
    let fakeNow = 1000000;
    const cache = new RatesCache(60000, () => fakeNow);

    cache.set('USD', { BRL: 5.2, EUR: 0.92 });
    expect(cache.size()).toBe(1);

    const cached = cache.get('USD');
    expect(cached).toBeDefined();
    expect(cached?.rates.BRL).toBe(5.2);
    expect(cached?.retrievedAt).toBeDefined();

    // Despues del TTL retorna undefined en get() pero sigue en getStale()
    fakeNow += 65000;
    expect(cache.get('USD')).toBeUndefined();

    const stale = cache.getStale('USD');
    expect(stale).toBeDefined();
    expect(stale?.rates.BRL).toBe(5.2);
  });

  it('permite usar fecha explicita en set()', () => {
    const cache = new RatesCache(60000);
    const customDate = new Date('2026-09-17T10:00:00.000Z');
    const entry = cache.set('EUR', { USD: 1.08 }, customDate);

    expect(entry.fetchedAt).toEqual(customDate);
    expect(entry.retrievedAt).toBe('2026-09-17T10:00:00.000Z');
  });

  it('permite actualizar el TTL con setTtl()', () => {
    let fakeNow = 1000;
    const cache = new RatesCache(1000, () => fakeNow);
    cache.set('USD', { ARS: 1400 });

    cache.setTtl(50000);
    // Avanzar tiempo a 2000
    fakeNow = 2000;
    // Nueva insercion toma el nuevo TTL
    cache.set('EUR', { USD: 1.08 });
    fakeNow = 10000;

    expect(cache.get('EUR')).toBeDefined();
  });

  it('permite invalidar una moneda especifica o toda la cache', () => {
    const cache = new RatesCache(60000);
    cache.set('USD', { ARS: 1400 });
    cache.set('EUR', { GBP: 0.85 });
    expect(cache.size()).toBe(2);

    cache.invalidate('USD');
    expect(cache.size()).toBe(1);
    expect(cache.get('USD')).toBeUndefined();
    expect(cache.get('EUR')).toBeDefined();

    cache.invalidate();
    expect(cache.size()).toBe(0);
  });
});
