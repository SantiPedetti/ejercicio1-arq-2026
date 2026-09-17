import { LoyaltyTier, Passenger } from '../domain/types';

type PassengerTuple = [string, string, string, number, string, LoyaltyTier, boolean];

const PASSENGER_DATA: readonly PassengerTuple[] = [
  ['P001', 'Ana Gomez', 'ana.gomez@example.com', 35, 'AR', 'gold', true],
  ['P002', 'Bruno Silva', 'bruno.silva@example.com', 40, 'BR', 'silver', true],
  ['P003', 'Clara Ruiz', 'clara.ruiz@example.com', 8, 'US', 'bronze', true],
  ['P004', 'Diego Martinez', 'diego.martinez@example.com', 70, 'ES', 'none', true],
  ['P005', 'Elena Torres', 'elena.torres@example.com', 30, 'MX', 'bronze', false],
  ['P006', 'Fabio Rossi', 'fabio.rossi-invalid-email', 50, 'IT', 'silver', true],
  ['P007', 'Gabriela Lima', 'gabriela.lima@example.com', 28, 'UY', 'none', true],
  ['P008', 'Hugo Perez', 'hugo.perez@example.com', 8, 'AR', 'gold', true],
  ['P009', 'Ivan Castro', 'ivan.castro@example.com', 70, 'UY', 'silver', true],
  ['P011', '', 'karen.invalida@example.com', 37, 'UY', 'none', true],
  ['P012', 'Luis Fernandez', 'luis.fernandez@example.com', 45, 'US', 'none', true]
];

function toPassenger(now: Date, [id, name, email, age, country, loyaltyTier, isActive]: PassengerTuple): Passenger {
  const d = new Date(Date.UTC(now.getUTCFullYear() - age, now.getUTCMonth(), now.getUTCDate() - 1));
  const birthDate = d.toISOString().slice(0, 10);
  return { id, name, email, birthDate, country, loyaltyTier, isActive };
}

export function buildMockPassengers(now: Date = new Date()): Passenger[] {
  return PASSENGER_DATA.map((tuple) => toPassenger(now, tuple));
}

export const mockPassengers: Passenger[] = buildMockPassengers(new Date());
