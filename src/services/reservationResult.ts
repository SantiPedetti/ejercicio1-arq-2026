import { errorsOf, ReservationContext, ReservationStatus, warningsOf } from '../domain/reservationContext';
import { CurrencyMetadata, FilterTrace, PriceBreakdown, ProcessingIssue } from '../domain/types';
import { round2 } from '../support/money';

export interface ReservationResult {
  reservationId: string;
  status: ReservationStatus;
  passenger?: {
    id: string;
    fullName: string;
    passengerType: string;
    loyaltyTier: string;
  };
  flight?: {
    flightCode: string;
    origin: string;
    destination: string;
    departureDate: string;
    destinationCountry: string;
  };
  pricing?: PriceBreakdown;
  currency?: CurrencyMetadata;
  errors: ProcessingIssue[];
  warnings: ProcessingIssue[];
  trace: FilterTrace[];
  processedAt: string;
}

function projectPassenger(p: ReservationContext['passenger'], ctx: ReservationContext) {
  if (!p) return undefined;
  return {
    id: p.id,
    fullName: p.name,
    passengerType: ctx.request.passengerType,
    loyaltyTier: p.loyaltyTier
  };
}

function projectFlight(f: ReservationContext['flight']) {
  if (!f) return undefined;
  return {
    flightCode: f.code || f.flightCode,
    origin: f.origin,
    destination: f.destination,
    departureDate: f.departureAt.slice(0, 10),
    destinationCountry: f.destinationCountry
  };
}

function roundPricing(p: PriceBreakdown): PriceBreakdown {
  const rounded = { ...p };
  for (const [key, val] of Object.entries(p)) {
    if (typeof val === 'number') {
      (rounded as Record<string, unknown>)[key] = round2(val);
    }
  }
  return rounded;
}

function roundCurrency(c?: CurrencyMetadata): CurrencyMetadata | undefined {
  if (!c) return undefined;
  const convertedTotal = typeof c.convertedTotal === 'number' ? round2(c.convertedTotal) : undefined;
  return { ...c, ...(convertedTotal !== undefined ? { convertedTotal } : {}) };
}

/** Proyecta el contexto interno del pipeline al contrato publico de la API. */
export function toReservationResult(context: ReservationContext, processedAt = new Date()): ReservationResult {
  return {
    reservationId: context.request.id || context.request.reservationId || '',
    status: context.status,
    ...(context.passenger ? { passenger: projectPassenger(context.passenger, context) } : {}),
    ...(context.flight ? { flight: projectFlight(context.flight) } : {}),
    ...(context.pricing ? { pricing: roundPricing(context.pricing) } : {}),
    ...(context.currency ? { currency: roundCurrency(context.currency) } : {}),
    errors: errorsOf(context),
    warnings: warningsOf(context),
    trace: context.trace,
    processedAt: processedAt.toISOString()
  };
}
