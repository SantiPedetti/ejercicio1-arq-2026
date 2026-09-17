import { mockFlights } from '../data/mockFlights';
import { Flight } from '../domain/types';

export interface FlightRepository {
  findByCode(flightCode: string): Flight | undefined;
  findAll(): Flight[];
}

const byCode = new Map<string, Flight>(mockFlights.map((flight) => [flight.flightCode, flight]));

export const flightRepository: FlightRepository = {
  findByCode: (flightCode) => byCode.get(flightCode.toUpperCase()),
  findAll: () => [...mockFlights]
};
