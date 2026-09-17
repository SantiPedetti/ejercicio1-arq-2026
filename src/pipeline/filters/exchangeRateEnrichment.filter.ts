import { addWarning, ReservationContext } from '../../domain/reservationContext';
import { currencyForCountry, UNKNOWN_COUNTRY_FALLBACK_CURRENCY } from '../../services/exchangeRate/countryCurrency';
import { ExchangeRateResult } from '../../services/exchangeRate/exchangeRateProvider';
import { Logger } from '../../support/logger';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

const FILTER = 'exchangeRateEnrichment' as const;

function handleUnmappedCountry(context: ReservationContext, code: string): { context: ReservationContext; target: string } {
  const updated = addWarning(
    context,
    FILTER,
    'UNKNOWN_DESTINATION_CURRENCY',
    `No hay moneda mapeada para el pais ${code}; se mantiene ${UNKNOWN_COUNTRY_FALLBACK_CURRENCY}`
  );
  return { context: updated, target: UNKNOWN_COUNTRY_FALLBACK_CURRENCY };
}

function resolveTargetCurrency(context: ReservationContext): { context: ReservationContext; target?: string } {
  if (!context.flight) {
    const updated = addWarning(context, FILTER, 'FLIGHT_NOT_RESOLVED', 'No hay vuelo resuelto en el contexto, no se puede determinar la moneda de destino');
    return { context: updated };
  }
  const code = context.flight.destinationCountry;
  const target = currencyForCountry(code);
  return target ? { context, target } : handleUnmappedCountry(context, code);
}

function checkFallbackWarning(context: ReservationContext, result: ExchangeRateResult): ReservationContext {
  if (result.source === 'fallback') {
    return addWarning(
      context,
      FILTER,
      'EXCHANGE_RATE_FALLBACK',
      `Se aplico la tasa de respaldo configurada para ${result.targetCurrency} porque la API externa no respondio`
    );
  }
  return context;
}

function applyRateResult(context: ReservationContext, result: ExchangeRateResult): ReservationContext {
  const withCurrency: ReservationContext = {
    ...context,
    currency: {
      baseCurrency: result.baseCurrency,
      targetCurrency: result.targetCurrency,
      rate: result.rate,
      rateSource: result.source,
      retrievedAt: result.retrievedAt
    }
  };
  return checkFallbackWarning(withCurrency, result);
}

function setIdentityCurrency(context: ReservationContext, base: string): ReservationContext {
  return {
    ...context,
    currency: {
      baseCurrency: base,
      targetCurrency: base,
      rate: 1,
      rateSource: 'identity',
      retrievedAt: new Date().toISOString()
    }
  };
}

function logEnrichmentWarning(logger: Logger, reservationId: string, target: string, error: string): void {
  logger.warn('No se pudo enriquecer la reserva con tipo de cambio', {
    reservationId,
    targetCurrency: target,
    error
  });
}

function handleRateError(
  context: ReservationContext,
  target: string,
  base: string,
  error: unknown,
  logger: Logger
): ReservationContext {
  const msg = error instanceof Error ? error.message : String(error);
  const id = context.request.id || context.request.reservationId || '';
  logEnrichmentWarning(logger, id, target, msg);
  const withWarn = addWarning(context, FILTER, 'EXCHANGE_RATE_UNAVAILABLE', `No se pudo obtener la tasa de cambio (${msg}); la reserva continua en ${base}`);
  return setIdentityCurrency(withWarn, base);
}

class ExchangeRateEnrichmentFilter implements Filter {
  readonly name = FILTER;
  readonly critical = false;

  constructor(private readonly deps: FilterDependencies) {}

  async execute(context: ReservationContext): Promise<ReservationContext> {
    const { context: ctx, target } = resolveTargetCurrency(context);
    if (!target) return ctx;
    const base = this.deps.config.exchangeRate.baseCurrency.toUpperCase();
    try {
      const result = await this.deps.exchangeRates.getRate(target);
      return applyRateResult(ctx, result);
    } catch (error) {
      return handleRateError(ctx, target, base, error, this.deps.logger);
    }
  }
}

export const createExchangeRateEnrichmentFilter: FilterFactory = (deps) =>
  new ExchangeRateEnrichmentFilter(deps);
