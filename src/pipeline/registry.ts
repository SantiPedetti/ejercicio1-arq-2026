import { FilterName, PipelineConfig } from '../config/pipelineConfig';
import { Filter, FilterDependencies, FilterFactory } from './filter';
import { createBasePriceFilter } from './filters/basePrice.filter';
import { createCurrencyConversionFilter } from './filters/currencyConversion.filter';
import { createExchangeRateEnrichmentFilter } from './filters/exchangeRateEnrichment.filter';
import { createLoyaltyDiscountFilter } from './filters/loyaltyDiscount.filter';
import { createPassengerTypeAdjustmentFilter } from './filters/passengerTypeAdjustment.filter';
import { createTaxesAndFeesFilter } from './filters/taxesAndFees.filter';
import { createValidateFlightFilter } from './filters/validateFlight.filter';
import { createValidatePassengerFilter } from './filters/validatePassenger.filter';
import { Pipeline } from './pipeline';

/**
 * Catalogo de filtros disponibles. Agregar un filtro nuevo solo requiere
 * registrarlo aqui y nombrarlo en la configuracion: el orquestador no cambia.
 */
export const FILTER_FACTORIES: Record<FilterName, FilterFactory> = {
  validatePassenger: createValidatePassengerFilter,
  validateFlight: createValidateFlightFilter,
  exchangeRateEnrichment: createExchangeRateEnrichmentFilter,
  basePrice: createBasePriceFilter,
  loyaltyDiscount: createLoyaltyDiscountFilter,
  passengerTypeAdjustment: createPassengerTypeAdjustmentFilter,
  taxesAndFees: createTaxesAndFeesFilter,
  currencyConversion: createCurrencyConversionFilter
};

export function buildFilters(config: PipelineConfig, deps: FilterDependencies): Filter[] {
  return config.filterOrder
    .filter((name) => FILTER_FACTORIES[name] !== undefined)
    .map((name) => FILTER_FACTORIES[name](deps));
}

export function createPipeline(config: PipelineConfig, deps: FilterDependencies): Pipeline {
  return new Pipeline(buildFilters(config, deps), {
    enabledFilters: config.enabledFilters,
    logger: deps.logger
  });
}
