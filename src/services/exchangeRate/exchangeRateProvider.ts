import { ExchangeRateSource, RateSource } from '../../domain/types';

export interface ExchangeRateResult {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  source: RateSource;
  retrievedAt: string;
}

export interface RatesResult {
  rates: Record<string, number>;
  source: ExchangeRateSource;
  fetchedAt: Date;
}

export interface ExchangeRateOptions {
  timeoutMs: number;
  maxAttempts: number;
  cacheTtlMs: number;
  retryDelayMs?: number;
}

/**
 * Puerto que abstrae la integracion con el proveedor de tasas de cambio. Los
 * filtros dependen de esta interfaz y no del cliente HTTP concreto, lo que
 * permite sustituirlo en pruebas o cambiar de proveedor sin tocar el pipeline.
 */
export interface ExchangeRateProvider {
  getRates(base: string, opts: ExchangeRateOptions): Promise<RatesResult>;
  invalidate(): void;
  invalidateCache?(): void;
  getRate?(targetCurrency: string): Promise<ExchangeRateResult>;
}

export class ExchangeRateError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ExchangeRateError';
  }
}

/** Se lanza cuando ni la API ni la cache pueden resolver la moneda. */
export class ExchangeRateUnavailableError extends ExchangeRateError {
  constructor(
    readonly targetCurrency: string,
    readonly reason?: string
  ) {
    super(
      `No se pudo obtener la tasa de cambio para ${targetCurrency}` + (reason ? `: ${reason}` : '')
    );
    this.name = 'ExchangeRateUnavailableError';
  }
}
