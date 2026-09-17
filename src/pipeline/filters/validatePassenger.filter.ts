import { addWarning, rejectReservation, ReservationContext } from '../../domain/reservationContext';
import { Passenger, PassengerType } from '../../domain/types';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

const FILTER = 'validatePassenger' as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const CHILD_MAX_AGE = 12;
export const SENIOR_MIN_AGE = 65;

/** Tipo de pasajero que corresponde a una edad segun las reglas del negocio. */
export function expectedPassengerType(age: number): PassengerType {
  if (age < CHILD_MAX_AGE) return 'child';
  if (age > SENIOR_MIN_AGE) return 'senior';
  return 'adult';
}

function checkActiveAndName(context: ReservationContext, passenger: Passenger) {
  if (!passenger.isActive) {
    return rejectReservation(
      context,
      FILTER,
      'PASSENGER_INACTIVE',
      `El pasajero ${passenger.id} no esta activo`
    );
  }
  if (passenger.firstName.trim().length === 0 || passenger.lastName.trim().length === 0) {
    return rejectReservation(context, FILTER, 'PASSENGER_NAME_INVALID', 'El nombre del pasajero esta incompleto');
  }
  return undefined;
}

function checkEmail(context: ReservationContext, email: string) {
  if (!EMAIL_PATTERN.test(email)) {
    return rejectReservation(
      context,
      FILTER,
      'PASSENGER_EMAIL_INVALID',
      `El email del pasajero no tiene un formato valido: ${email}`
    );
  }
  return undefined;
}

function checkPassengerType(context: ReservationContext, passenger: Passenger) {
  const expectedType = expectedPassengerType(passenger.age);
  if (expectedType !== passenger.passengerType) {
    return rejectReservation(
      context,
      FILTER,
      'PASSENGER_TYPE_MISMATCH',
      `La edad ${passenger.age} corresponde al tipo "${expectedType}" y el pasajero esta registrado como "${passenger.passengerType}"`
    );
  }
  if (passenger.phone.trim().length === 0) {
    addWarning(context, FILTER, 'PASSENGER_PHONE_MISSING', 'El pasajero no tiene telefono de contacto registrado');
  }
  return undefined;
}

function checkPassenger(context: ReservationContext, passenger: Passenger) {
  return (
    checkActiveAndName(context, passenger) ??
    checkEmail(context, passenger.email) ??
    checkPassengerType(context, passenger)
  );
}

class ValidatePassengerFilter implements Filter {
  readonly name = FILTER;

  constructor(private readonly passengers: FilterDependencies['passengers']) {}

  execute(context: ReservationContext): ReservationContext {
    const passenger = this.passengers.findById(context.request.passengerId);
    if (!passenger) {
      return rejectReservation(
        context,
        FILTER,
        'PASSENGER_NOT_FOUND',
        `El pasajero ${context.request.passengerId} no existe`
      );
    }
    context.passenger = passenger;
    return checkPassenger(context, passenger) ?? context;
  }
}

export const createValidatePassengerFilter: FilterFactory = ({ passengers }) =>
  new ValidatePassengerFilter(passengers);
