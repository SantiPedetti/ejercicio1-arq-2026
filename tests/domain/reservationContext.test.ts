import {
  addError,
  addWarning,
  createContext,
  createNeutralPricing,
  errorsOf,
  hasErrors,
  hasWarnings,
  rejectReservation,
  warningsOf
} from '../../src/domain/reservationContext';
import { reservation, testFlights } from '../helpers/testDeps';

describe('dominio: reservationContext', () => {
  it('crea un contexto inicial con pricing neutro si se provee vuelo', () => {
    const flight = testFlights.findByCode('AA001');
    const ctx = createContext(reservation(), { flight });

    expect(ctx.status).toBe('PENDING');
    expect(ctx.aborted).toBe(false);
    expect(ctx.pricing?.baseFare).toBe(450);
    expect(ctx.pricing?.currentPrice).toBe(450);
  });

  it('crea un contexto con ID generado si no viene en el request', () => {
    const ctx = createContext({
      passengerId: 'P001',
      flightCode: 'AA001',
      origin: 'JFK',
      destination: 'EZE',
      departureDate: '2026-10-20',
      seatClass: 'economy',
      passengerType: 'adult'
    });

    expect(ctx.request.id).toBeDefined();
    expect(typeof ctx.request.id).toBe('string');
  });

  it('createNeutralPricing crea un desglose valido', () => {
    const p = createNeutralPricing(300);
    expect(p).toEqual({
      baseFare: 300,
      classPrice: 300,
      currentPrice: 300,
      loyaltyDiscount: 0,
      passengerTypeDiscount: 0
    });
  });

  it('gestiona errores y warnings acumulados', () => {
    let ctx = createContext(reservation());
    expect(hasErrors(ctx)).toBe(false);
    expect(hasWarnings(ctx)).toBe(false);

    ctx = addWarning(ctx, 'testFilter', 'TEST_WARN', 'un aviso', { detail: 1 });
    expect(hasWarnings(ctx)).toBe(true);
    expect(hasErrors(ctx)).toBe(false);
    expect(warningsOf(ctx)).toHaveLength(1);
    expect(warningsOf(ctx)[0]?.details).toEqual({ detail: 1 });

    ctx = addError(ctx, 'testFilter', 'TEST_ERR', 'un error');
    expect(hasErrors(ctx)).toBe(true);
    expect(errorsOf(ctx)).toHaveLength(1);

    ctx = rejectReservation(ctx, 'testFilter', 'REJECTED_CODE', 'rechazo', { reason: 'bad' });
    expect(ctx.status).toBe('REJECTED');
    expect(ctx.aborted).toBe(true);
    expect(errorsOf(ctx)).toHaveLength(2);
  });
});
