import { env } from './env';
import { LoyaltyTier, PassengerType, SeatClass } from '../domain/types';

export const FILTER_NAMES = [
  'validatePassenger',
  'validateFlight',
  'exchangeRateEnrichment',
  'basePrice',
  'loyaltyDiscount',
  'passengerTypeAdjustment',
  'taxesAndFees',
  'currencyConversion'
] as const;

export type FilterName = (typeof FILTER_NAMES)[number];

export interface ExchangeRateSettings {
  baseCurrency: string;
  apiBaseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  cacheTtlMs: number;
  /** Tasas usadas cuando la API externa no responde. */
  fallbackRates: Record<string, number>;
}

export interface TaxSettings {
  /** Porcentaje de impuestos sobre el precio neto. */
  taxRate: number;
  /** Tasa de aeropuerto fija en USD. */
  airportFeeUsd: number;
  /** Porcentaje de sobrecargo por combustible sobre el precio base del vuelo. */
  fuelSurchargeRate: number;
}

export interface PipelineConfig {
  /** Orden de ejecucion de los filtros; define la topologia del pipeline. */
  filterOrder: FilterName[];
  enabledFilters: Record<FilterName, boolean>;
  seatClassMultipliers: Record<SeatClass, number>;
  loyaltyDiscounts: Record<LoyaltyTier, number>;
  passengerTypeDiscounts: Record<PassengerType, number>;
  taxes: TaxSettings;
  exchangeRate: ExchangeRateSettings;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  filterOrder: [...FILTER_NAMES],
  enabledFilters: {
    validatePassenger: true,
    validateFlight: true,
    exchangeRateEnrichment: true,
    basePrice: true,
    loyaltyDiscount: true,
    passengerTypeAdjustment: true,
    taxesAndFees: true,
    currencyConversion: true
  },
  seatClassMultipliers: {
    economy: 1,
    business: 2.5,
    first: 4
  },
  loyaltyDiscounts: {
    none: 0,
    bronze: 0.05,
    silver: 0.1,
    gold: 0.15
  },
  passengerTypeDiscounts: {
    child: 0.25,
    adult: 0,
    senior: 0.15
  },
  taxes: {
    taxRate: 0.12,
    airportFeeUsd: 25,
    fuelSurchargeRate: 0.08
  },
  exchangeRate: {
    baseCurrency: 'USD',
    apiBaseUrl: env.EXCHANGE_API_BASE_URL,
    timeoutMs: 5000,
    maxRetries: 3,
    retryDelayMs: 200,
    cacheTtlMs: 60 * 60 * 1000,
    fallbackRates: {
      USD: 1,
      ARS: 1000,
      BRL: 5.2,
      EUR: 0.92,
      GBP: 0.79,
      CLP: 950,
      MXN: 17.5,
      PEN: 3.75,
      UYU: 39.5,
      COP: 4000
    }
  }
};

/** Copia profunda simple: la configuracion solo contiene datos serializables. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type PipelineConfigPatch = {
  filterOrder?: FilterName[];
  enabledFilters?: Partial<Record<FilterName, boolean>>;
  seatClassMultipliers?: Partial<Record<SeatClass, number>>;
  loyaltyDiscounts?: Partial<Record<LoyaltyTier, number>>;
  passengerTypeDiscounts?: Partial<Record<PassengerType, number>>;
  taxes?: Partial<TaxSettings>;
  exchangeRate?: Partial<Omit<ExchangeRateSettings, 'apiBaseUrl'>>;
};

function mergeExchangeRate(
  current: ExchangeRateSettings,
  patch?: Partial<Omit<ExchangeRateSettings, 'apiBaseUrl'>>
): ExchangeRateSettings {
  return {
    ...current,
    ...patch,
    fallbackRates: { ...current.fallbackRates, ...patch?.fallbackRates }
  };
}

/**
 * Configuracion viva del pipeline. Es mutable en tiempo de ejecucion porque el
 * sistema expone PUT /pipeline/config, y las reglas de negocio son parametros
 * en lugar de constantes embebidas en los filtros.
 */
export class PipelineConfigStore {
  private config: PipelineConfig;

  constructor(initial: PipelineConfig = DEFAULT_PIPELINE_CONFIG) {
    this.config = clone(initial);
  }

  get(): PipelineConfig {
    return clone(this.config);
  }

  /** Aplica un parche parcial y devuelve la configuracion resultante. */
  update(patch: PipelineConfigPatch): PipelineConfig {
    const cur = this.config;
    this.config = {
      filterOrder: patch.filterOrder ? [...patch.filterOrder] : cur.filterOrder,
      enabledFilters: { ...cur.enabledFilters, ...patch.enabledFilters },
      seatClassMultipliers: { ...cur.seatClassMultipliers, ...patch.seatClassMultipliers },
      loyaltyDiscounts: { ...cur.loyaltyDiscounts, ...patch.loyaltyDiscounts },
      passengerTypeDiscounts: { ...cur.passengerTypeDiscounts, ...patch.passengerTypeDiscounts },
      taxes: { ...cur.taxes, ...patch.taxes },
      exchangeRate: mergeExchangeRate(cur.exchangeRate, patch.exchangeRate)
    };
    return this.get();
  }

  reset(): PipelineConfig {
    this.config = clone(DEFAULT_PIPELINE_CONFIG);
    return this.get();
  }
}

/** Instancia compartida por la aplicacion HTTP. */
export const pipelineConfigStore = new PipelineConfigStore();
