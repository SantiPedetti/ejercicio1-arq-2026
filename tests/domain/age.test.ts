import { calculateAge, expectedPassengerType } from '../../src/domain/age';

describe('dominio: calculo de edad y tipo de pasajero', () => {
  it('calcula edad exacta en anios cumplidos a la fecha de salida', () => {
    // Cumpleanios 2014-10-20
    expect(calculateAge('2014-10-20', '2026-10-19')).toBe(11);
    expect(calculateAge('2014-10-20', '2026-10-20')).toBe(12);
    expect(calculateAge('2014-10-20', '2026-10-21')).toBe(12);
  });

  it('clasifica correctamente en los bordes 11/12 y 65/66', () => {
    expect(expectedPassengerType(11)).toBe('child');
    expect(expectedPassengerType(12)).toBe('adult');
    expect(expectedPassengerType(65)).toBe('adult');
    expect(expectedPassengerType(66)).toBe('senior');
  });

  it('clasifica ninos, adultos y seniors dentro del rango', () => {
    expect(expectedPassengerType(0)).toBe('child');
    expect(expectedPassengerType(8)).toBe('child');
    expect(expectedPassengerType(35)).toBe('adult');
    expect(expectedPassengerType(75)).toBe('senior');
  });
});
