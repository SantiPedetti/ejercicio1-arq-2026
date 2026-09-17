import { calculateAge, expectedPassengerType } from '../../domain/age';
import { rejectReservation, ReservationContext } from '../../domain/reservationContext';
import { Passenger } from '../../domain/types';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

export { expectedPassengerType };

const FILTER = 'validatePassenger' as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function checkPassengerFound(context: ReservationContext, passenger: Passenger | undefined) {
  if (!passenger) {
    return rejectReservation(
      context,
      FILTER,
      'PASSENGER_NOT_FOUND',
      `El pasajero ${context.request.passengerId} no existe`
    );
  }
  return undefined;
}

function checkActive(context: ReservationContext, passenger: Passenger) {
  if (!passenger.isActive) {
    return rejectReservation(
      context,
      FILTER,
      'PASSENGER_INACTIVE',
      `El pasajero ${passenger.id} no esta activo`
    );
  }
  return undefined;
}

function checkContact(context: ReservationContext, passenger: Passenger) {
  const hasValidName = typeof passenger.name === 'string' && passenger.name.trim().length > 0;
  const hasValidEmail = EMAIL_PATTERN.test(passenger.email);
  if (!hasValidName || !hasValidEmail) {
    return rejectReservation(
      context,
      FILTER,
      'INVALID_CONTACT',
      `Los datos de contacto del pasajero ${passenger.id} son invalidos`
    );
  }
  return undefined;
}

function checkAgeMatch(context: ReservationContext, passenger: Passenger) {
  const age = calculateAge(passenger.birthDate, context.request.departureDate);
  const expected = expectedPassengerType(age);
  if (expected !== context.request.passengerType) {
    return rejectReservation(
      context,
      FILTER,
      'PASSENGER_TYPE_MISMATCH',
      `La edad ${age} corresponde al tipo "${expected}" pero se declaro "${context.request.passengerType}"`
    );
  }
  return undefined;
}

function validatePassengerDetails(context: ReservationContext, passenger: Passenger) {
  return (
    checkActive(context, passenger) ??
    checkContact(context, passenger) ??
    checkAgeMatch(context, passenger)
  );
}

class ValidatePassengerFilter implements Filter {
  readonly name = FILTER;

  constructor(private readonly passengers: FilterDependencies['passengers']) {}

  execute(context: ReservationContext): ReservationContext {
    const passenger = this.passengers.findById(context.request.passengerId);
    const notFound = checkPassengerFound(context, passenger);
    if (notFound || !passenger) return context;
    context.passenger = passenger;
    return validatePassengerDetails(context, passenger) ?? context;
  }
}

export const createValidatePassengerFilter: FilterFactory = ({ passengers }) =>
  new ValidatePassengerFilter(passengers);
