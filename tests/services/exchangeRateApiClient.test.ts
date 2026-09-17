import { DEFAULT_PIPELINE_CONFIG, ExchangeRateSettings } from '../../src/config/pipelineConfig';
import {
  ExchangeRateApiClient,
  FetchLike
} from '../../src/services/exchangeRate/exchangeRateApiClient';
import { ExchangeRateUnavailableError } from '../../src/services/exchangeRate/exchangeRateProvider';
import { RatesCache } from '../../src/services/exchangeRate/ratesCache';

function settings(overrides: Partial<ExchangeRateSettings> = {}): ExchangeRateSettings {
  return { ...DEFAULT_PIPELINE_CONFIG.exchangeRate, timeoutMs: 50, retryDelayMs: 0, ...overrides };
}

function okResponse(rates: Record<string, number>): Response {
  return { ok: true, status: 200, json: async () => ({ base: 'USD', rates }) } as unknown as Response;
}

const noSleep = async (): Promise<void> => undefined;

describe('cliente de ExchangeRate-API', () => {
  it('obtiene la tasa desde la API y la marca con origen api', async () => {
    const fetchFn = jest.fn<Promise<Response>, Parameters<FetchLike>>().mockResolvedValue(
      okResponse({ BRL: 5.35, ARS: 1450 })
    );
    const client = new ExchangeRateApiClient({ settings: settings(), fetchFn, sleep: noSleep });

    const result = await client.getRate('BRL');

    expect(result).toMatchObject({ baseCurrency: 'USD', targetCurrency: 'BRL', rate: 5.35, source: 'api' });
    expect(fetchFn).toHaveBeenCalledWith('https://api.exchangerate-api.com/v4/latest/USD', expect.anything());
  });

  it('no vuelve a llamar a la API mientras la cache esta vigente', async () => {
    const fetchFn = jest.fn<Promise<Response>, Parameters<FetchLike>>().mockResolvedValue(
      okResponse({ BRL: 5.35, ARS: 1450 })
    );
    const client = new ExchangeRateApiClient({ settings: settings(), fetchFn, sleep: noSleep });

    await client.getRate('BRL');
    const second = await client.getRate('ARS');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(second.source).toBe('cache');
  });

  it('vuelve a consultar la API luego de invalidar la cache manualmente', async () => {
    const fetchFn = jest.fn<Promise<Response>, Parameters<FetchLike>>().mockResolvedValue(
      okResponse({ BRL: 5.35 })
    );
    const client = new ExchangeRateApiClient({ settings: settings(), fetchFn, sleep: noSleep });

    await client.getRate('BRL');
    client.invalidateCache();
    await client.getRate('BRL');

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('descarta la entrada cacheada cuando vence el TTL', async () => {
    let clock = 0;
    const cache = new RatesCache(1000, () => clock);
    const fetchFn = jest.fn<Promise<Response>, Parameters<FetchLike>>().mockResolvedValue(
      okResponse({ BRL: 5.35 })
    );
    const client = new ExchangeRateApiClient({
      settings: settings({ cacheTtlMs: 1000 }),
      fetchFn,
      cache,
      sleep: noSleep
    });

    await client.getRate('BRL');
    clock = 1500;
    await client.getRate('BRL');

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('reintenta hasta el maximo configurado antes de darse por vencido', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<FetchLike>>()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue(okResponse({ BRL: 5.4 }));
    const client = new ExchangeRateApiClient({
      settings: settings({ maxRetries: 3 }),
      fetchFn,
      sleep: noSleep
    });

    const result = await client.getRate('BRL');

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(result.source).toBe('api');
  });

  it('cae a la tasa de respaldo cuando se agotan los reintentos', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<FetchLike>>()
      .mockRejectedValue(new Error('la API no responde'));
    const client = new ExchangeRateApiClient({
      settings: settings({ maxRetries: 3 }),
      fetchFn,
      sleep: noSleep
    });

    const result = await client.getRate('BRL');

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ rate: 5.2, source: 'fallback' });
  });

  it('trata un estado HTTP de error como fallo de la integracion', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<FetchLike>>()
      .mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } as unknown as Response);
    const client = new ExchangeRateApiClient({
      settings: settings({ maxRetries: 2 }),
      fetchFn,
      sleep: noSleep
    });

    const result = await client.getRate('ARS');

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.source).toBe('fallback');
  });

  it('aborta la llamada cuando se excede el timeout y usa el respaldo', async () => {
    const hangingFetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    const client = new ExchangeRateApiClient({
      settings: settings({ timeoutMs: 20, maxRetries: 1 }),
      fetchFn: hangingFetch,
      sleep: noSleep
    });

    const result = await client.getRate('EUR');

    expect(result.source).toBe('fallback');
    expect(result.rate).toBe(0.92);
  });

  it('lanza ExchangeRateUnavailableError si no hay respaldo para la moneda', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<FetchLike>>()
      .mockRejectedValue(new Error('la API no responde'));
    const client = new ExchangeRateApiClient({
      settings: settings({ maxRetries: 1, fallbackRates: { USD: 1 } }),
      fetchFn,
      sleep: noSleep
    });

    await expect(client.getRate('JPY')).rejects.toBeInstanceOf(ExchangeRateUnavailableError);
  });

  it('no consulta la API cuando la moneda destino es la moneda base', async () => {
    const fetchFn = jest.fn<Promise<Response>, Parameters<FetchLike>>();
    const client = new ExchangeRateApiClient({ settings: settings(), fetchFn, sleep: noSleep });

    const result = await client.getRate('USD');

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toMatchObject({ rate: 1, source: 'identity' });
  });
});
