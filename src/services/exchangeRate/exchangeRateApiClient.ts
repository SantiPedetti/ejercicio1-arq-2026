import { z } from 'zod';
import { ExchangeRateSettings } from '../../config/pipelineConfig';
import { Logger, silentLogger } from '../../support/logger';
import {
  ExchangeRateError,
  ExchangeRateOptions,
  ExchangeRateProvider,
  ExchangeRateResult,
  ExchangeRateUnavailableError,
  RatesResult
} from './exchangeRateProvider';
import { RatesCache } from './ratesCache';

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export interface ExchangeRateApiClientDeps {
  settings: ExchangeRateSettings;
  logger?: Logger;
  fetchFn?: FetchLike;
  cache?: RatesCache;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

const apiResponseSchema = z
  .object({
    base: z.string(),
    rates: z.record(z.string(), z.number().positive())
  })
  .passthrough();

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function isRetryableHttp(status: number): boolean {
  return status === 429 || status >= 500;
}

function calculateDelay(attempt: number, baseMs = 200, random = Math.random): number {
  const nominal = baseMs * Math.pow(2, attempt - 1);
  const jitter = 0.8 + random() * 0.4;
  return Math.round(nominal * jitter);
}

function checkAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.name === 'TimeoutError';
  }
  return false;
}

function parsePayload(json: unknown): Record<string, number> {
  const parsed = apiResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ExchangeRateError('INVALID_RESPONSE', parsed.error);
  }
  return parsed.data.rates;
}

async function callFetch(url: string, timeoutMs: number, fetchFn: FetchLike): Promise<Response> {
  try {
    return await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (checkAbortError(err)) throw new Error(`timeout de ${timeoutMs} ms`);
    throw err;
  }
}

async function fetchRatesHttp(
  url: string,
  timeoutMs: number,
  fetchFn: FetchLike
): Promise<Record<string, number>> {
  const res = await callFetch(url, timeoutMs, fetchFn);
  if (!res.ok) {
    const msg = `la API respondio con estado HTTP ${res.status}`;
    if (!isRetryableHttp(res.status)) throw new ExchangeRateError(msg);
    throw new Error(msg);
  }
  return parsePayload(await res.json());
}

/**
 * Cliente HTTP y cache con tacticas de disponibilidad: timeout por intento,
 * reintentos con backoff y jitter, single-flight y degradacion a stale-cache.
 */
export class ExchangeRateApiClient implements ExchangeRateProvider {
  private readonly settings: ExchangeRateSettings;
  private readonly logger: Logger;
  private readonly fetchFn: FetchLike;
  private readonly cache: RatesCache;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly inFlightPromises = new Map<string, Promise<RatesResult>>();

  constructor(deps: ExchangeRateApiClientDeps) {
    this.settings = deps.settings;
    this.logger = deps.logger ?? silentLogger;
    this.fetchFn = deps.fetchFn ?? ((url, init) => fetch(url, init));
    this.cache = deps.cache ?? new RatesCache(deps.settings.cacheTtlMs, deps.now);
    this.sleep = deps.sleep ?? defaultSleep;
    this.now = deps.now ?? (() => Date.now());
    this.random = deps.random ?? Math.random;
  }

  invalidate(): void {
    this.cache.invalidate();
    this.inFlightPromises.clear();
  }

  invalidateCache(): void {
    this.invalidate();
  }

  private async onAttemptError(err: unknown, attempt: number, max: number): Promise<never> {
    if (err instanceof ExchangeRateError) throw err;
    this.logger.warn('Fallo intento contra la API de tipo de cambio', { attempt, maxAttempts: max, err });
    if (attempt < max) await this.sleep(calculateDelay(attempt, 200, this.random));
    throw err;
  }

  private async executeAttempt(
    url: string,
    timeoutMs: number,
    attempt: number,
    max: number
  ): Promise<Record<string, number>> {
    try {
      return await fetchRatesHttp(url, timeoutMs, this.fetchFn);
    } catch (err) {
      return await this.onAttemptError(err, attempt, max);
    }
  }

  private throwExhausted(base: string, max: number, lastError: unknown): never {
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    this.logger.error('Se agotaron los reintentos contra la API de tipo de cambio', { base, max });
    throw new ExchangeRateError(`Fallo tras ${max} intentos: ${msg}`);
  }

  private async tryAttempt(url: string, timeoutMs: number, attempt: number, max: number) {
    try {
      return { rates: await this.executeAttempt(url, timeoutMs, attempt, max) };
    } catch (err) {
      if (err instanceof ExchangeRateError) throw err;
      return { error: err };
    }
  }

  private async requestWithRetries(base: string, opts: ExchangeRateOptions): Promise<Record<string, number>> {
    const max = opts.maxAttempts ?? this.settings.maxAttempts ?? 3;
    const url = `${this.settings.apiBaseUrl}/${base}`;
    let lastError: unknown;
    for (let attempt = 1; attempt <= max; attempt += 1) {
      const res = await this.tryAttempt(url, opts.timeoutMs, attempt, max);
      if (res.rates) return res.rates;
      lastError = res.error;
    }
    return this.throwExhausted(base, max, lastError);
  }

  private handleFetchFailure(base: string, err: unknown): RatesResult {
    const stale = this.cache.getStale(base);
    if (stale) {
      this.logger.warn('Se aplica tasa de cambio vencida en cache', { base });
      return { rates: stale.rates, source: 'stale-cache', fetchedAt: stale.fetchedAt };
    }
    throw err instanceof ExchangeRateError ? err : new ExchangeRateError(String(err));
  }

  private async fetchAndCache(base: string, opts: ExchangeRateOptions): Promise<RatesResult> {
    try {
      const rates = await this.requestWithRetries(base, opts);
      const fetchedAt = new Date(this.now());
      this.cache.setTtl(opts.cacheTtlMs);
      this.cache.set(base, rates, fetchedAt);
      return { rates, source: 'api', fetchedAt };
    } catch (err) {
      return this.handleFetchFailure(base, err);
    }
  }

  async getRates(base: string, opts: ExchangeRateOptions): Promise<RatesResult> {
    const baseUpper = base.toUpperCase();
    const cached = this.cache.get(baseUpper);
    if (cached) return { rates: cached.rates, source: 'cache', fetchedAt: cached.fetchedAt };
    const inFlight = this.inFlightPromises.get(baseUpper);
    if (inFlight) return inFlight;
    const promise = this.fetchAndCache(baseUpper, opts);
    this.inFlightPromises.set(baseUpper, promise);
    try {
      return await promise;
    } finally {
      this.inFlightPromises.delete(baseUpper);
    }
  }

  async getRate(targetCurrency: string): Promise<ExchangeRateResult> {
    const base = this.settings.baseCurrency.toUpperCase();
    const target = targetCurrency.toUpperCase();
    if (base === target) {
      return { baseCurrency: base, targetCurrency: target, rate: 1, source: 'identity', retrievedAt: new Date(this.now()).toISOString() };
    }
    const res = await this.getRates(base, {
      timeoutMs: this.settings.timeoutMs,
      maxAttempts: this.settings.maxAttempts ?? this.settings.maxRetries ?? 3,
      cacheTtlMs: this.settings.cacheTtlMs
    });
    const rate = res.rates[target];
    if (typeof rate !== 'number') throw new ExchangeRateUnavailableError(target);
    return { baseCurrency: base, targetCurrency: target, rate, source: res.source, retrievedAt: res.fetchedAt.toISOString() };
  }
}
