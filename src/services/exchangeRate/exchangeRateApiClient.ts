import { ExchangeRateSettings } from '../../config/pipelineConfig';
import { Logger, silentLogger } from '../../support/logger';
import {
  ExchangeRateProvider,
  ExchangeRateResult,
  ExchangeRateUnavailableError
} from './exchangeRateProvider';
import { RatesCache } from './ratesCache';

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export interface ExchangeRateApiClientDeps {
  settings: ExchangeRateSettings;
  logger?: Logger;
  /** Inyectable para poder simular fallos y timeouts en pruebas. */
  fetchFn?: FetchLike;
  cache?: RatesCache;
  sleep?: (ms: number) => Promise<void>;
}

interface ExchangeRateApiResponse {
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Cliente de ExchangeRate-API con las tacticas de disponibilidad exigidas:
 * timeout acotado, reintentos, cache en memoria y tasas de respaldo.
 */
export class ExchangeRateApiClient implements ExchangeRateProvider {
  private readonly settings: ExchangeRateSettings;
  private readonly logger: Logger;
  private readonly fetchFn: FetchLike;
  private readonly cache: RatesCache;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(deps: ExchangeRateApiClientDeps) {
    this.settings = deps.settings;
    this.logger = deps.logger ?? silentLogger;
    this.fetchFn = deps.fetchFn ?? ((url, init) => fetch(url, init));
    this.cache = deps.cache ?? new RatesCache(deps.settings.cacheTtlMs);
    this.sleep = deps.sleep ?? defaultSleep;
  }

  invalidateCache(): void {
    this.cache.invalidate();
  }

  async getRate(targetCurrency: string): Promise<ExchangeRateResult> {
    const base = this.settings.baseCurrency.toUpperCase();
    const target = targetCurrency.toUpperCase();

    if (base === target) {
      return { baseCurrency: base, targetCurrency: target, rate: 1, source: 'identity', retrievedAt: new Date().toISOString() };
    }

    const cached = this.cache.get(base);
    const cachedRate = cached?.rates[target];
    if (cached && typeof cachedRate === 'number') {
      return { baseCurrency: base, targetCurrency: target, rate: cachedRate, source: 'cache', retrievedAt: cached.retrievedAt };
    }

    const failureReason = await this.refreshRates(base);
    if (!failureReason) {
      const fresh = this.cache.get(base);
      const freshRate = fresh?.rates[target];
      if (fresh && typeof freshRate === 'number') {
        return { baseCurrency: base, targetCurrency: target, rate: freshRate, source: 'api', retrievedAt: fresh.retrievedAt };
      }
      this.logger.warn('La API respondio pero no incluye la moneda solicitada', { base, target });
    }

    const fallbackRate = this.settings.fallbackRates[target];
    if (typeof fallbackRate === 'number') {
      this.logger.warn('Se aplica tasa de cambio de respaldo', { base, target, rate: fallbackRate, failureReason });
      return {
        baseCurrency: base,
        targetCurrency: target,
        rate: fallbackRate,
        source: 'fallback',
        retrievedAt: new Date().toISOString()
      };
    }

    throw new ExchangeRateUnavailableError(target, failureReason ?? 'la moneda no esta en la respuesta ni en las tasas de respaldo');
  }

  /**
   * Refresca la cache para la moneda base. Devuelve undefined en caso de exito
   * o el motivo del fallo luego de agotar los reintentos.
   */
  private async refreshRates(base: string): Promise<string | undefined> {
    const attempts = Math.max(1, this.settings.maxRetries);
    let lastError = 'error desconocido';

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const rates = await this.requestRates(base);
        this.cache.setTtl(this.settings.cacheTtlMs);
        this.cache.set(base, rates);
        return undefined;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        this.logger.warn('Fallo la llamada a la API de tipo de cambio', {
          base,
          attempt,
          attempts,
          error: lastError
        });
        if (attempt < attempts) await this.sleep(this.settings.retryDelayMs * attempt);
      }
    }

    this.logger.error('Se agotaron los reintentos contra la API de tipo de cambio', { base, attempts, error: lastError });
    return lastError;
  }

  private async requestRates(base: string): Promise<Record<string, number>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);
    try {
      const response = await this.fetchFn(`${this.settings.apiBaseUrl}/${base}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`la API respondio con estado HTTP ${response.status}`);
      const payload = (await response.json()) as ExchangeRateApiResponse;
      if (!payload.rates || typeof payload.rates !== 'object') {
        throw new Error('la respuesta de la API no contiene el objeto rates');
      }
      return payload.rates;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`timeout de ${this.settings.timeoutMs} ms al consultar la API de tipo de cambio`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
