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

  if (context.passenger) {
    result.passenger = {
      id: context.passenger.id,
      fullName: `${context.passenger.firstName} ${context.passenger.lastName}`.trim(),
      passengerType: context.passenger.passengerType,
      loyaltyTier: context.passenger.loyaltyTier
    };
  }

  if (context.flight) {
    result.flight = {
      flightCode: context.flight.flightCode,
      origin: context.flight.origin,
      destination: context.flight.destination,
      departureDate: context.flight.departureDate,
      destinationCountryCode: context.flight.destinationCountryCode
    };
  }

  if (context.pricing) result.pricing = context.pricing;
  if (context.currency) result.currency = context.currency;

  return result;
}
