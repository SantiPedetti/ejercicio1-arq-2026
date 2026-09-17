import { rejectReservation, ReservationContext } from '../../domain/reservationContext';
import { Flight } from '../../domain/types';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

const FILTER = 'validateFlight' as const;

function checkSeatsAvailability(context: ReservationContext, flight: Flight) {
  if (flight.availableSeats <= 0) {
    return rejectReservation(
      context,
      FILTER,
      'NO_SEATS_AVAILABLE',
      `El vuelo ${flight.flightCode} no tiene asientos disponibles`
    );
  }
  return undefined;
}

function checkSeatsCapacity(context: ReservationContext, flight: Flight, requested: number) {
  if (requested > flight.availableSeats) {
    return rejectReservation(
      context,
      FILTER,
      'INSUFFICIENT_SEATS',
      `Se solicitaron ${requested} asientos y el vuelo ${flight.flightCode} solo tiene ${flight.availableSeats}`
    );
  }
  return undefined;
}

function checkRoute(context: ReservationContext, flight: Flight) {
  const { origin, destination, flightCode } = context.request;
  if (origin.toUpperCase() !== flight.origin || destination.toUpperCase() !== flight.destination) {
    return rejectReservation(
      context,
      FILTER,
      'ROUTE_MISMATCH',
      `La ruta solicitada ${origin}-${destination} no coincide con la del vuelo ${flightCode} (${flight.origin}-${flight.destination})`
    );
  }
  return undefined;
}

function checkDepartureDate(context: ReservationContext, flight: Flight, now: () => Date) {
  if (new Date(flight.departureDate).getTime() <= now().getTime()) {
    return rejectReservation(
      context,
      FILTER,
      'FLIGHT_ALREADY_DEPARTED',
      `La fecha de salida del vuelo ${flight.flightCode} (${flight.departureDate}) no es futura`
    );
  }
  return undefined;
}

function validateFlightDetails(context: ReservationContext, flight: Flight, now: () => Date) {
  return (
    checkSeatsAvailability(context, flight) ??
    checkSeatsCapacity(context, flight, context.request.seats ?? 1) ??
    checkRoute(context, flight) ??
    checkDepartureDate(context, flight, now)
  );
}

class ValidateFlightFilter implements Filter {
  readonly name = FILTER;

  constructor(
    private readonly flights: FilterDependencies['flights'],
    private readonly now: FilterDependencies['now']
  ) {}

  execute(context: ReservationContext): ReservationContext {
    const flight = this.flights.findByCode(context.request.flightCode);
    if (!flight) {
      return rejectReservation(
        context,
        FILTER,
        'FLIGHT_NOT_FOUND',
        `El vuelo ${context.request.flightCode} no existe`
      );
    }
    context.flight = flight;
    return validateFlightDetails(context, flight, this.now) ?? context;
  }
}

export const createValidateFlightFilter: FilterFactory = ({ flights, now }) =>
  new ValidateFlightFilter(flights, now);
