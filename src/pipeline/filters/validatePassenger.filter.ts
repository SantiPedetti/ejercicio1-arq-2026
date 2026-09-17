import { addWarning, rejectReservation } from '../../domain/reservationContext';
import { PassengerType } from '../../domain/types';
import { Filter, FilterFactory } from '../filter';

const FILTER: 'validatePassenger' = 'validatePassenger';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const CHILD_MAX_AGE = 12;
export const SENIOR_MIN_AGE = 65;

/** Tipo de pasajero que corresponde a una edad segun las reglas del negocio. */
export function expectedPassengerType(age: number): PassengerType {
  if (age < CHILD_MAX_AGE) return 'child';
  if (age > SENIOR_MIN_AGE) return 'senior';
  return 'adult';
}

/**
 * Valida existencia, estado, datos de contacto y coherencia entre edad y tipo
 * de pasajero. Cualquier incumplimiento rechaza la reserva.
 */
export const createValidatePassengerFilter: FilterFactory = ({ passengers }): Filter => ({
  name: FILTER,
  execute(context) {
    const { passengerId } = context.request;
    const passenger = passengers.findById(passengerId);

    if (!passenger) {
      return rejectReservation(context, FILTER, 'PASSENGER_NOT_FOUND', `El pasajero ${passengerId} no existe`);
    }

    context.passenger = passenger;

    if (!passenger.isActive) {
      return rejectReservation(context, FILTER, 'PASSENGER_INACTIVE', `El pasajero ${passengerId} no esta activo`);
    }

    if (passenger.firstName.trim().length === 0 || passenger.lastName.trim().length === 0) {
      return rejectReservation(context, FILTER, 'PASSENGER_NAME_INVALID', 'El nombre del pasajero esta incompleto');
    }

    if (!EMAIL_PATTERN.test(passenger.email)) {
      return rejectReservation(
        context,
        FILTER,
        'PASSENGER_EMAIL_INVALID',
        `El email del pasajero no tiene un formato valido: ${passenger.email}`
      );
    }

    const expectedType = expectedPassengerType(passenger.age);
    if (expectedType !== passenger.passengerType) {
      return rejectReservation(
        context,
        FILTER,
        'PASSENGER_TYPE_MISMATCH',
        `La edad ${passenger.age} corresponde al tipo "${expectedType}" y el pasajero esta registrado como "${passenger.passengerType}"`
      );
    }

    // El telefono no bloquea la reserva: solo degrada la calidad del contacto.
    if (passenger.phone.trim().length === 0) {
      addWarning(context, FILTER, 'PASSENGER_PHONE_MISSING', 'El pasajero no tiene telefono de contacto registrado');
    }

    return context;
  }
});
