import { mockFlights } from '../data/mockFlights';
import { Flight } from '../domain/types';

export interface FlightRepository {
  findByCode(flightCode: string): Flight | undefined;
  findAll(): Flight[];
}

function indexFlights(flights: Flight[]): Map<string, Flight> {
  const byCode = new Map<string, Flight>();
  for (const flight of flights) {
    byCode.set(flight.code.toUpperCase(), flight);
    if (flight.flightCode) {
      byCode.set(flight.flightCode.toUpperCase(), flight);
    }
  }
  return byCode;
}

export function createFlightRepository(flights: Flight[] = mockFlights): FlightRepository {
  const byCode = indexFlights(flights);
  return {
    findByCode: (code) => byCode.get(code.toUpperCase()),
    findAll: () => [...flights]
  };
}

export const flightRepository: FlightRepository = createFlightRepository();
