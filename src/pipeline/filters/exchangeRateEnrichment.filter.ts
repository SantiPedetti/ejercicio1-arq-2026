import { addWarning, ReservationContext } from '../../domain/reservationContext';
import { currencyForCountry, UNKNOWN_COUNTRY_FALLBACK_CURRENCY } from '../../services/exchangeRate/countryCurrency';
import { ExchangeRateResult } from '../../services/exchangeRate/exchangeRateProvider';
import { Logger } from '../../support/logger';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

const FILTER = 'exchangeRateEnrichment' as const;

function handleUnmappedCountry(context: ReservationContext, code: string): string {
  addWarning(
    context,
    FILTER,
    'UNKNOWN_DESTINATION_CURRENCY',
    `No hay moneda mapeada para el pais ${code}; se mantiene ${UNKNOWN_COUNTRY_FALLBACK_CURRENCY}`
  );
  return UNKNOWN_COUNTRY_FALLBACK_CURRENCY;
}

function resolveTargetCurrency(context: ReservationContext): string | undefined {
  if (!context.flight) {
    addWarning(context, FILTER, 'FLIGHT_NOT_RESOLVED', 'No hay vuelo resuelto en el contexto, no se puede determinar la moneda de destino');
    return undefined;
  }
  const code = context.flight.destinationCountryCode;
  return currencyForCountry(code) ?? handleUnmappedCountry(context, code);
}

function checkFallbackWarning(context: ReservationContext, result: ExchangeRateResult): void {
  if (result.source === 'fallback') {
    addWarning(
      context,
      FILTER,
      'EXCHANGE_RATE_FALLBACK',
      `Se aplico la tasa de respaldo configurada para ${result.targetCurrency} porque la API externa no respondio`
    );
  }
}

function applyRateResult(context: ReservationContext, result: ExchangeRateResult): void {
  context.currency = {
    baseCurrency: result.baseCurrency,
    targetCurrency: result.targetCurrency,
    rate: result.rate,
    rateSource: result.source,
    retrievedAt: result.retrievedAt
  };
  checkFallbackWarning(context, result);
}

function setIdentityCurrency(context: ReservationContext, base: string): void {
  context.currency = {
    baseCurrency: base,
    targetCurrency: base,
    rate: 1,
    rateSource: 'identity',
    retrievedAt: new Date().toISOString()
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
): void {
  const msg = error instanceof Error ? error.message : String(error);
  const id = context.request.id || context.request.reservationId || '';
  logEnrichmentWarning(logger, id, target, msg);
  addWarning(context, FILTER, 'EXCHANGE_RATE_UNAVAILABLE', `No se pudo obtener la tasa de cambio (${msg}); la reserva continua en ${base}`);
  setIdentityCurrency(context, base);
}

class ExchangeRateEnrichmentFilter implements Filter {
  readonly name = FILTER;

  constructor(private readonly deps: FilterDependencies) {}

  async execute(context: ReservationContext): Promise<ReservationContext> {
    const target = resolveTargetCurrency(context);
    if (!target) return context;
    const base = this.deps.config.exchangeRate.baseCurrency.toUpperCase();
    try {
      const result = await this.deps.exchangeRates.getRate(target);
      applyRateResult(context, result);
    } catch (error) {
      handleRateError(context, target, base, error, this.deps.logger);
    }
    return context;
  }
}

export const createExchangeRateEnrichmentFilter: FilterFactory = (deps) =>
  new ExchangeRateEnrichmentFilter(deps);
