import {
  createPassengerRepository,
  passengerRepository
} from '../../src/repositories/passengerRepository';
import {
  createFlightRepository,
  flightRepository
} from '../../src/repositories/flightRepository';

describe('repositorios de datos mock', () => {
  describe('PassengerRepository', () => {
    it('encuentra pasajero por id existente', () => {
      const p = passengerRepository.findById('P001');
      expect(p).toBeDefined();
      expect(p?.id).toBe('P001');
      expect(p?.name).toBeDefined();
    });

    it('devuelve undefined si el pasajero no existe', () => {
      expect(passengerRepository.findById('P999')).toBeUndefined();
    });

    it('devuelve todos los pasajeros con findAll()', () => {
      const all = passengerRepository.findAll();
      expect(all.length).toBeGreaterThanOrEqual(9);
      expect(all.some((p) => p.id === 'P001')).toBe(true);
    });

    it('permite instanciar un repositorio con lista personalizada', () => {
      const custom = createPassengerRepository([
        {
          id: 'PX-1',
          name: 'Custom',
          email: 'custom@test.com',
          birthDate: '1990-01-01',
          country: 'AR',
          loyaltyTier: 'gold',
          isActive: true
        }
      ]);
      expect(custom.findById('PX-1')?.name).toBe('Custom');
      expect(custom.findAll()).toHaveLength(1);
    });
  });

  describe('FlightRepository', () => {
    it('encuentra vuelo por codigo existente (case-insensitive)', () => {
      const f1 = flightRepository.findByCode('AA001');
      const f2 = flightRepository.findByCode('aa001');
      expect(f1).toBeDefined();
      expect(f2).toBeDefined();
      expect(f1?.code).toBe('AA001');
    });

    it('devuelve undefined si el vuelo no existe', () => {
      expect(flightRepository.findByCode('XX999')).toBeUndefined();
    });

    it('devuelve todos los vuelos con findAll()', () => {
      const all = flightRepository.findAll();
      expect(all.length).toBeGreaterThanOrEqual(6);
      expect(all.some((f) => f.code === 'AA001')).toBe(true);
    });

    it('permite instanciar un repositorio con vuelos personalizados', () => {
      const custom = createFlightRepository([
        {
          code: 'FX001',
          flightCode: 'FX001',
          origin: 'EZE',
          destination: 'MAD',
          originCountry: 'AR',
          destinationCountry: 'ES',
          departureAt: '2026-10-10T10:00:00.000Z',
          durationMinutes: 700,
          baseFare: 500,
          availableSeats: 50
        }
      ]);
      expect(custom.findByCode('fx001')?.code).toBe('FX001');
      expect(custom.findAll()).toHaveLength(1);
    });
  });
});
