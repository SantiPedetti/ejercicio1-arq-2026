import { addWarning, ReservationContext } from '../../domain/reservationContext';
import { currencyForCountry } from '../../services/exchangeRate/countryCurrency';
import { ExchangeRateOptions, RatesResult } from '../../services/exchangeRate/exchangeRateProvider';
import { Logger } from '../../support/logger';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

const FILTER = 'exchangeRateEnrichment' as const;

function warnNoFlight(context: ReservationContext): ReservationContext {
  return addWarning(
    context,
    FILTER,
    'EXCHANGE_RATE_SKIPPED_NO_FLIGHT',
    'No hay vuelo resuelto en el contexto; se omite el tipo de cambio'
  );
}

function warnUnknownCurrency(context: ReservationContext, country: string): ReservationContext {
  return addWarning(
    context,
    FILTER,
    'UNKNOWN_CURRENCY',
    `No hay moneda mapeada para el pais ${country}; la reserva continua en USD`
  );
}

function resolveTargetCurrency(context: ReservationContext): { context: ReservationContext; target?: string } {
  if (!context.flight) return { context: warnNoFlight(context) };
  const country = context.flight.destinationCountry;
  const target = currencyForCountry(country);
  if (!target) return { context: warnUnknownCurrency(context, country) };
  return { context, target };
}

function buildExchangeOptions(deps: FilterDependencies): ExchangeRateOptions {
  return {
    timeoutMs: deps.config.exchangeRate.timeoutMs,
    maxAttempts: deps.config.exchangeRate.maxAttempts ?? deps.config.exchangeRate.maxRetries ?? 3,
    cacheTtlMs: deps.config.exchangeRate.cacheTtlMs
  };
}

async function fetchRates(deps: FilterDependencies, base: string): Promise<RatesResult> {
  const opts = buildExchangeOptions(deps);
  if (typeof deps.exchangeRates.getRates === 'function') {
    return await deps.exchangeRates.getRates(base, opts);
  }
  if (typeof deps.exchangeRates.getRate === 'function') {
    const fallback = await deps.exchangeRates.getRate(base);
    return {
      rates: { [fallback.targetCurrency]: fallback.rate },
      source: fallback.source as 'api' | 'cache' | 'stale-cache',
      fetchedAt: new Date(fallback.retrievedAt)
    };
  }
  throw new Error('ExchangeRateProvider no implementa getRates');
}

function buildEnrichedContext(
  context: ReservationContext,
  target: string,
  rate: number,
  result: RatesResult
): ReservationContext {
  const fetchedAt = result.fetchedAt instanceof Date ? result.fetchedAt.toISOString() : String(result.fetchedAt);
  return {
    ...context,
    exchangeRate: { currency: target, rate, source: result.source, fetchedAt },
    currency: { baseCurrency: 'USD', targetCurrency: target, rate, rateSource: result.source, retrievedAt: fetchedAt }
  };
}

function applySuccessfulRate(
  context: ReservationContext,
  target: string,
  rate: number,
  result: RatesResult
): ReservationContext {
  const updated = buildEnrichedContext(context, target, rate, result);
  if (result.source === 'stale-cache') {
    return addWarning(updated, FILTER, 'STALE_RATE', `Se aplico la tasa vencida en cache para ${target}`);
  }
  return updated;
}

function handleMissingCurrencyInRates(context: ReservationContext, target: string): ReservationContext {
  return addWarning(
    context,
    FILTER,
    'UNKNOWN_CURRENCY',
    `La moneda ${target} no esta disponible en las tasas del proveedor; se continua en USD`
  );
}

function handleRateError(
  context: ReservationContext,
  target: string,
  base: string,
  error: unknown,
  logger: Logger
): ReservationContext {
  const msg = error instanceof Error ? error.message : String(error);
  logger.warn('No se pudo enriquecer la reserva con tipo de cambio', { targetCurrency: target, error: msg });
  const message = `No se pudo obtener la tasa de cambio para ${target} (${msg}); la reserva continua en ${base}`;
  return addWarning(context, FILTER, 'EXCHANGE_RATE_UNAVAILABLE', message);
}

async function enrichTarget(
  ctx: ReservationContext,
  target: string,
  base: string,
  deps: FilterDependencies
): Promise<ReservationContext> {
  try {
    const result = await fetchRates(deps, base);
    const rate = result.rates[target];
    if (typeof rate !== 'number' || rate <= 0) return handleMissingCurrencyInRates(ctx, target);
    return applySuccessfulRate(ctx, target, rate, result);
  } catch (error) {
    return handleRateError(ctx, target, base, error, deps.logger);
  }
}

class ExchangeRateEnrichmentFilter implements Filter {
  readonly name = FILTER;
  readonly critical = false;

  constructor(private readonly deps: FilterDependencies) {}

  async execute(context: ReservationContext): Promise<ReservationContext> {
    const { context: ctx, target } = resolveTargetCurrency(context);
    if (!target) return ctx;
    const base = this.deps.config.exchangeRate.baseCurrency.toUpperCase();
    if (target === base) return ctx;
    return enrichTarget(ctx, target, base, this.deps);
  }
}

export const createExchangeRateEnrichmentFilter: FilterFactory = (deps) =>
  new ExchangeRateEnrichmentFilter(deps);
