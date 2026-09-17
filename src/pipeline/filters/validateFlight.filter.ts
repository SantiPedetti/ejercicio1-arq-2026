import { rejectReservation } from '../../domain/reservationContext';
import { Filter, FilterFactory } from '../filter';

const FILTER: 'validateFlight' = 'validateFlight';

/**
 * Valida existencia del vuelo, disponibilidad de asientos, coherencia de la
 * ruta solicitada y que la fecha de salida siga siendo futura.
 */
export const createValidateFlightFilter: FilterFactory = ({ flights, now }): Filter => ({
  name: FILTER,
  execute(context) {
    const { flightCode, origin, destination } = context.request;
    const requestedSeats = context.request.seats ?? 1;
    const flight = flights.findByCode(flightCode);

    if (!flight) {
      return rejectReservation(context, FILTER, 'FLIGHT_NOT_FOUND', `El vuelo ${flightCode} no existe`);
    }

    context.flight = flight;

    if (flight.availableSeats <= 0) {
      return rejectReservation(context, FILTER, 'NO_SEATS_AVAILABLE', `El vuelo ${flightCode} no tiene asientos disponibles`);
    }

    if (requestedSeats > flight.availableSeats) {
      return rejectReservation(
        context,
        FILTER,
        'INSUFFICIENT_SEATS',
        `Se solicitaron ${requestedSeats} asientos y el vuelo ${flightCode} solo tiene ${flight.availableSeats}`
      );
    }

    if (origin.toUpperCase() !== flight.origin || destination.toUpperCase() !== flight.destination) {
      return rejectReservation(
        context,
        FILTER,
        'ROUTE_MISMATCH',
        `La ruta solicitada ${origin}-${destination} no coincide con la del vuelo ${flightCode} (${flight.origin}-${flight.destination})`
      );
    }

    if (new Date(flight.departureDate).getTime() <= now().getTime()) {
      return rejectReservation(
        context,
        FILTER,
        'FLIGHT_ALREADY_DEPARTED',
        `La fecha de salida del vuelo ${flightCode} (${flight.departureDate}) no es futura`
      );
    }

    return context;
  }
});
