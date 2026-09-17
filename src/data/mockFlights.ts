import { Flight } from '../domain/types';

type FlightTuple = [string, string, string, string, string, number, number, number, number, string?];

const DAY_MS = 24 * 60 * 60 * 1000;

const FLIGHT_DATA: readonly FlightTuple[] = [
  ['AA001', 'JFK', 'EZE', 'US', 'AR', 21, 555, 450, 12, 'American Airlines'],
  ['LA4567', 'SCL', 'GRU', 'CL', 'BR', 10, 165, 200, 20, 'LATAM'],
  ['IB6841', 'MAD', 'EZE', 'ES', 'AR', 45, 745, 900, 40, 'Iberia'],
  ['AF0010', 'JFK', 'CDG', 'US', 'FR', 30, 480, 700, 8, 'Air France'],
  ['AA0002', 'MIA', 'JFK', 'US', 'US', 14, 180, 150, 0, 'American Airlines'],
  ['UX0099', 'MAD', 'MIA', 'ES', 'US', -2, 540, 500, 20, 'Air Europa']
];

function toFlight(now: Date, [code, orig, dest, oCntry, dCntry, days, dur, fare, seats, air]: FlightTuple): Flight {
  const dep = new Date(now.getTime() + days * DAY_MS).toISOString();
  return {
    code, flightCode: code, origin: orig, destination: dest,
    originCountry: oCntry, destinationCountry: dCntry,
    departureAt: dep, durationMinutes: dur,
    baseFare: fare, availableSeats: seats, airline: air
  };
}

export function buildMockFlights(now: Date = new Date()): Flight[] {
  return FLIGHT_DATA.map((tuple) => toFlight(now, tuple));
}

export const mockFlights: Flight[] = buildMockFlights(new Date());
