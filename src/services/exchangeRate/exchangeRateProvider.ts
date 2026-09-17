import { RateSource } from '../../domain/types';

export interface ExchangeRateResult {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  source: RateSource;
  retrievedAt: string;
}

/**
 * Puerto que abstrae la integracion con el proveedor de tasas de cambio. Los
 * filtros dependen de esta interfaz y no del cliente HTTP concreto, lo que
 * permite sustituirlo en pruebas o cambiar de proveedor sin tocar el pipeline.
 */
export interface ExchangeRateProvider {
  getRate(targetCurrency: string): Promise<ExchangeRateResult>;
  /** Invalidacion manual de la cache de tasas. */
  invalidateCache(): void;
}

/** Se lanza cuando ni la API ni las tasas de respaldo pueden resolver la moneda. */
export class ExchangeRateUnavailableError extends Error {
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
