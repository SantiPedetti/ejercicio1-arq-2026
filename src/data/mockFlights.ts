import { Flight } from '../domain/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Las fechas se calculan relativas al momento de carga para que los datos mock
 * no caduquen: el sistema exige fecha de salida futura.
 */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

/**
 * Base de datos en memoria de vuelos. Cubre rutas distintas, precios base
 * variados, vuelos con asientos limitados o agotados, duraciones diferentes y
 * un vuelo ya partido para validar el control de fecha.
 */
export const mockFlights: Flight[] = [
  {
    flightCode: 'AA001',
    airline: 'American Airlines',
    origin: 'EZE',
    destination: 'MIA',
    destinationCountryCode: 'US',
    departureDate: daysFromNow(21),
    durationMinutes: 555,
    basePriceUsd: 450,
    availableSeats: 12
  },
  {
    flightCode: 'LA4567',
    airline: 'LATAM',
    origin: 'EZE',
    destination: 'GRU',
    destinationCountryCode: 'BR',
    departureDate: daysFromNow(10),
    durationMinutes: 165,
    basePriceUsd: 180,
    availableSeats: 3
  },
  {
    flightCode: 'IB6841',
    airline: 'Iberia',
    origin: 'EZE',
    destination: 'MAD',
    destinationCountryCode: 'ES',
    departureDate: daysFromNow(45),
    durationMinutes: 745,
    basePriceUsd: 890,
    availableSeats: 40
  },
  {
    flightCode: 'AR1140',
    airline: 'Aerolineas Argentinas',
    origin: 'AEP',
    destination: 'MDZ',
    destinationCountryCode: 'AR',
    departureDate: daysFromNow(5),
    durationMinutes: 115,
    basePriceUsd: 95,
    availableSeats: 60
  },
  {
    // Vuelo sin asientos disponibles.
    flightCode: 'AM0404',
    airline: 'Aeromexico',
    origin: 'MEX',
    destination: 'JFK',
    destinationCountryCode: 'US',
    departureDate: daysFromNow(14),
    durationMinutes: 300,
    basePriceUsd: 320,
    availableSeats: 0
  },
  {
    flightCode: 'AF0416',
    airline: 'Air France',
    origin: 'CDG',
    destination: 'EZE',
    destinationCountryCode: 'AR',
    departureDate: daysFromNow(30),
    durationMinutes: 830,
    basePriceUsd: 1100,
    availableSeats: 8
  },
  {
    flightCode: 'LA800',
    airline: 'LATAM',
    origin: 'SCL',
    destination: 'LIM',
    destinationCountryCode: 'PE',
    departureDate: daysFromNow(7),
    durationMinutes: 220,
    basePriceUsd: 210,
    availableSeats: 25
  },
  {
    flightCode: 'QF0012',
    airline: 'Qantas',
    origin: 'SYD',
    destination: 'LAX',
    destinationCountryCode: 'US',
    departureDate: daysFromNow(60),
    durationMinutes: 830,
    basePriceUsd: 1450,
    availableSeats: 5
  },
  {
    // Vuelo con fecha de salida pasada.
    flightCode: 'LA4570',
    airline: 'LATAM',
    origin: 'EZE',
    destination: 'GRU',
    destinationCountryCode: 'BR',
    departureDate: daysFromNow(-3),
    durationMinutes: 165,
    basePriceUsd: 175,
    availableSeats: 20
  }
];
