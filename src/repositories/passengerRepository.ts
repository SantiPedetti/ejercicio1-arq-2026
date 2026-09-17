import { mockPassengers } from '../data/mockPassengers';
import { Passenger } from '../domain/types';

export interface PassengerRepository {
  findById(id: string): Passenger | undefined;
  findAll(): Passenger[];
}

export function createPassengerRepository(passengers: Passenger[] = mockPassengers): PassengerRepository {
  const byId = new Map<string, Passenger>(passengers.map((p) => [p.id, p]));
  return {
    findById: (id) => byId.get(id),
    findAll: () => [...passengers]
  };
}

export const passengerRepository: PassengerRepository = createPassengerRepository();
