import { mockPassengers } from '../data/mockPassengers';
import { Passenger } from '../domain/types';

export interface PassengerRepository {
  findById(id: string): Passenger | undefined;
  findAll(): Passenger[];
}

/** Indice por id construido al cargar la aplicacion para busquedas O(1). */
const byId = new Map<string, Passenger>(mockPassengers.map((passenger) => [passenger.id, passenger]));

export const passengerRepository: PassengerRepository = {
  findById: (id) => byId.get(id),
  findAll: () => [...mockPassengers]
};
