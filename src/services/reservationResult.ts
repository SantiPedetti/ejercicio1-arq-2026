import { errorsOf, ReservationContext, ReservationStatus, warningsOf } from '../domain/reservationContext';
import { CurrencyMetadata, FilterTrace, PriceBreakdown, ProcessingIssue } from '../domain/types';

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
    destinationCountryCode: string;
  };
  pricing?: PriceBreakdown;
  currency?: CurrencyMetadata;
  errors: ProcessingIssue[];
  warnings: ProcessingIssue[];
  trace: FilterTrace[];
  processedAt: string;
}

function projectPassenger(p: ReservationContext['passenger']) {
  if (!p) return undefined;
  return {
    id: p.id,
    fullName: `${p.firstName} ${p.lastName}`.trim(),
    passengerType: p.passengerType,
    loyaltyTier: p.loyaltyTier
  };
}

function projectFlight(f: ReservationContext['flight']) {
  if (!f) return undefined;
  return {
    flightCode: f.flightCode,
    origin: f.origin,
    destination: f.destination,
    departureDate: f.departureDate,
    destinationCountryCode: f.destinationCountryCode
  };
}

/** Proyecta el contexto interno del pipeline al contrato publico de la API. */
export function toReservationResult(context: ReservationContext, processedAt = new Date()): ReservationResult {
  const result: ReservationResult = {
    reservationId: context.request.reservationId,
    status: context.status,
    errors: errorsOf(context),
    warnings: warningsOf(context),
    trace: context.trace,
    processedAt: processedAt.toISOString()
  };
  if (context.passenger) result.passenger = projectPassenger(context.passenger);
  if (context.flight) result.flight = projectFlight(context.flight);
  if (context.pricing) result.pricing = context.pricing;
  if (context.currency) result.currency = context.currency;
  return result;
}
