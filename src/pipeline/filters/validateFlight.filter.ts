import { rejectReservation, ReservationContext } from '../../domain/reservationContext';
import { Flight } from '../../domain/types';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

const FILTER = 'validateFlight' as const;

function checkFlightFound(context: ReservationContext, flight: Flight | undefined) {
  if (!flight) {
    return rejectReservation(
      context,
      FILTER,
      'FLIGHT_NOT_FOUND',
      `El vuelo ${context.request.flightCode} no existe`
    );
  }
  return undefined;
}

function checkSeats(context: ReservationContext, flight: Flight) {
  if (flight.availableSeats <= 0) {
    return rejectReservation(
      context,
      FILTER,
      'NO_SEATS',
      `El vuelo ${flight.code || flight.flightCode} no tiene asientos disponibles`
    );
  }
  return undefined;
}

function checkRoute(context: ReservationContext, flight: Flight) {
  const { origin, destination, flightCode } = context.request;
  if (origin.toUpperCase() !== flight.origin.toUpperCase() || destination.toUpperCase() !== flight.destination.toUpperCase()) {
    return rejectReservation(
      context,
      FILTER,
      'ROUTE_MISMATCH',
      `La ruta solicitada ${origin}-${destination} no coincide con la del vuelo ${flightCode} (${flight.origin}-${flight.destination})`
    );
  }
  return undefined;
}

function checkFlightNotDeparted(context: ReservationContext, flight: Flight, now: () => Date) {
  if (new Date(flight.departureAt).getTime() <= now().getTime()) {
    return rejectReservation(
      context,
      FILTER,
      'FLIGHT_DEPARTED',
      `La fecha de salida del vuelo ${flight.code || flight.flightCode} ya paso`
    );
  }
  return undefined;
}

function checkDateMatches(context: ReservationContext, flight: Flight) {
  if (context.request.departureDate !== flight.departureAt.slice(0, 10)) {
    return rejectReservation(
      context,
      FILTER,
      'DATE_MISMATCH',
      `La fecha de salida solicitada ${context.request.departureDate} no coincide con el vuelo (${flight.departureAt.slice(0, 10)})`
    );
  }
  return undefined;
}

function validateFlightDetails(context: ReservationContext, flight: Flight, now: () => Date) {
  return (
    checkSeats(context, flight) ??
    checkRoute(context, flight) ??
    checkFlightNotDeparted(context, flight, now) ??
    checkDateMatches(context, flight)
  );
}

class ValidateFlightFilter implements Filter {
  readonly name = FILTER;
  readonly critical = true;

  constructor(
    private readonly flights: FilterDependencies['flights'],
    private readonly now: FilterDependencies['now']
  ) {}

  execute(context: ReservationContext): ReservationContext {
    const flight = this.flights.findByCode(context.request.flightCode);
    const notFound = checkFlightFound(context, flight);
    if (notFound) return notFound;
    if (!flight) return context;
    const withFlight = { ...context, flight };
    return validateFlightDetails(withFlight, flight, this.now) ?? withFlight;
  }
}

export const createValidateFlightFilter: FilterFactory = ({ flights, now }) =>
  new ValidateFlightFilter(flights, now);
