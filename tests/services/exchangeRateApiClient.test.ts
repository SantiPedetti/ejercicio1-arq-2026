import { DEFAULT_PIPELINE_CONFIG, ExchangeRateSettings } from '../../src/config/pipelineConfig';
import {
  ExchangeRateApiClient,
  FetchLike
} from '../../src/services/exchangeRate/exchangeRateApiClient';
import { ExchangeRateError } from '../../src/services/exchangeRate/exchangeRateProvider';

function settings(overrides: Partial<ExchangeRateSettings> = {}): ExchangeRateSettings {
  return {
    ...DEFAULT_PIPELINE_CONFIG.exchangeRate,
    timeoutMs: 5000,
    retryDelayMs: 200,
    ...overrides
  };
}

function okResponse(rates: Record<string, number>, base = 'USD'): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ base, rates })
  } as unknown as Response;
}

function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({})
  } as unknown as Response;
}

describe('proveedor de tipo de cambio (ExchangeRateApiClient)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aborta la llamada cuando se excede el timeout', async () => {
    const hangingFetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted due to timeout');
          error.name = 'TimeoutError';
          reject(error);
        });
      });

    const client = new ExchangeRateApiClient({
      settings: settings({ timeoutMs: 1000 }),
      fetchFn: hangingFetch
    });

    const promise = client.getRates('USD', {
      timeoutMs: 1000,
      maxAttempts: 1,
      cacheTtlMs: 3600000
    });

    jest.advanceTimersByTime(1100);
    await expect(promise).rejects.toThrow(/timeout/);
  });

  it('realiza hasta 3 intentos totales ante fallos transitorios y tiene exito en el tercero', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<FetchLike>>()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(okResponse({ BRL: 5.4, ARS: 1400 }));

    const client = new ExchangeRateApiClient({
      settings: settings({ maxAttempts: 3 }),
      fetchFn
    });

    const promise = client.getRates('USD', {
      timeoutMs: 5000,
      maxAttempts: 3,
      cacheTtlMs: 3600000
    });

    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(result.source).toBe('api');
    expect(result.rates.BRL).toBe(5.4);
  });

  it('falla con ExchangeRateError si se agotan los 3 intentos', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<FetchLike>>()
      .mockRejectedValue(new Error('fallo de conexion'));

    const client = new ExchangeRateApiClient({
      settings: settings({ maxAttempts: 3 }),
      fetchFn
    });

    const promise = client.getRates('USD', {
      timeoutMs: 5000,
      maxAttempts: 3,
      cacheTtlMs: 3600000
    });

    const assertion = expect(promise).rejects.toThrow(ExchangeRateError);
    await jest.advanceTimersByTimeAsync(2000);
    await assertion;
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('no reintenta ante errores HTTP 4xx distintos de 429', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<FetchLike>>()
      .mockResolvedValue(errorResponse(404));

    const client = new ExchangeRateApiClient({
      settings: settings({ maxAttempts: 3 }),
      fetchFn
    });

    const promise = client.getRates('USD', {
      timeoutMs: 5000,
      maxAttempts: 3,
      cacheTtlMs: 3600000
    });

    await expect(promise).rejects.toThrow(/404/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('no reintenta ante un esquema invalido en la respuesta', async () => {
    const fetchFn = jest.fn<Promise<Response>, Parameters<FetchLike>>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ base: 'USD', rates: { BRL: -5 } })
    } as unknown as Response);

    const client = new ExchangeRateApiClient({
      settings: settings({ maxAttempts: 3 }),
      fetchFn
    });

    const promise = client.getRates('USD', {
      timeoutMs: 5000,
      maxAttempts: 3,
      cacheTtlMs: 3600000
    });

    await expect(promise).rejects.toThrow(ExchangeRateError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('sirve desde cache dentro del TTL y consulta la API al expirar', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<FetchLike>>()
      .mockResolvedValue(okResponse({ BRL: 5.25 }));

    const client = new ExchangeRateApiClient({
      settings: settings({ cacheTtlMs: 3600000 }),
      fetchFn
    });

    const first = await client.getRates('USD', {
      timeoutMs: 5000,
      maxAttempts: 3,
      cacheTtlMs: 3600000
    });
    expect(first.source).toBe('api');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1800000);
    const second = await client.getRates('USD', {
      timeoutMs: 5000,
      maxAttempts: 3,
      cacheTtlMs: 3600000
    });
    expect(second.source).toBe('cache');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2000000);
    const third = await client.getRates('USD', {
      timeoutMs: 5000,
      maxAttempts: 3,
      cacheTtlMs: 3600000
    });
    expect(third.source).toBe('api');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('aplica single-flight agrupando llamadas concurrentes y borra la promesa en finally', async () => {
    let resolveFetch!: (res: Response) => void;
    const fetchFn = jest.fn<Promise<Response>, Parameters<FetchLike>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const client = new ExchangeRateApiClient({
      settings: settings(),
      fetchFn
    });

    const p1 = client.getRates('USD', { timeoutMs: 5000, maxAttempts: 3, cacheTtlMs: 3600000 });
    const p2 = client.getRates('USD', { timeoutMs: 5000, maxAttempts: 3, cacheTtlMs: 3600000 });

    resolveFetch(okResponse({ BRL: 5.2 }));
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(r1.rates.BRL).toBe(5.2);
    expect(r2.rates.BRL).toBe(5.2);

    client.invalidate();
    let rejectFetch!: (err: unknown) => void;
    fetchFn.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectFetch = reject;
        })
    );

    const pFail = client.getRates('USD', { timeoutMs: 5000, maxAttempts: 1, cacheTtlMs: 3600000 });
    rejectFetch(new Error('falla transitoria'));
    await expect(pFail).rejects.toThrow();

    fetchFn.mockImplementation(async () => okResponse({ BRL: 5.3 }));
    const r3 = await client.getRates('USD', { timeoutMs: 5000, maxAttempts: 1, cacheTtlMs: 3600000 });
    expect(r3.rates.BRL).toBe(5.3);
  });

  it('degrada a stale-cache cuando la API falla luego de haber vencido el TTL', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<FetchLike>>()
      .mockResolvedValueOnce(okResponse({ BRL: 5.2 }));

    const client = new ExchangeRateApiClient({
      settings: settings({ cacheTtlMs: 1000 }),
      fetchFn
    });

    const initial = await client.getRates('USD', { timeoutMs: 5000, maxAttempts: 1, cacheTtlMs: 1000 });
    expect(initial.source).toBe('api');
    expect(initial.rates.BRL).toBe(5.2);

    jest.advanceTimersByTime(2000);

    fetchFn.mockRejectedValue(new Error('servidor caido'));
    const staleResult = await client.getRates('USD', { timeoutMs: 5000, maxAttempts: 1, cacheTtlMs: 1000 });

    expect(staleResult.source).toBe('stale-cache');
    expect(staleResult.rates.BRL).toBe(5.2);
  });

  it('vuelve a consultar la API tras invalidar la cache manualmente', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<FetchLike>>()
      .mockResolvedValue(okResponse({ BRL: 5.2 }));

    const client = new ExchangeRateApiClient({
      settings: settings({ cacheTtlMs: 3600000 }),
      fetchFn
    });

    await client.getRates('USD', { timeoutMs: 5000, maxAttempts: 3, cacheTtlMs: 3600000 });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    client.invalidate();
    await client.getRates('USD', { timeoutMs: 5000, maxAttempts: 3, cacheTtlMs: 3600000 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
