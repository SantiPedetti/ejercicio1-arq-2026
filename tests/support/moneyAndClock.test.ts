import { FixedClock, SystemClock, systemClock } from '../../src/support/clock';
import { round2 } from '../../src/support/money';

describe('support: money y clock', () => {
  describe('round2', () => {
    it('redondea montos a 2 decimales evitando errores de punto flotante', () => {
      expect(round2(10.005)).toBe(10.01);
      expect(round2(10.004)).toBe(10);
      expect(round2(1.0000001)).toBe(1);
      expect(round2(489.399999999)).toBe(489.4);
    });
  });

  describe('clock', () => {
    it('SystemClock devuelve la fecha actual', () => {
      const clock = new SystemClock();
      const before = Date.now();
      const now = clock.now().getTime();
      const after = Date.now();
      expect(now).toBeGreaterThanOrEqual(before);
      expect(now).toBeLessThanOrEqual(after);
    });

    it('FixedClock devuelve siempre la fecha fija', () => {
      const fixedDate = new Date('2026-09-17T12:00:00.000Z');
      const clock = new FixedClock(fixedDate);
      expect(clock.now()).toEqual(fixedDate);
    });

    it('systemClock exportado es una instancia valida', () => {
      expect(systemClock.now()).toBeInstanceOf(Date);
    });
  });
});
