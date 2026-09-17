import { z } from 'zod';
import {
  pipelineConfigPatchSchema,
  processReservationsSchema,
  singleReservationSchema,
  toValidationIssues
} from '../../src/api/schemas';

describe('capa HTTP: esquemas Zod (schemas)', () => {
  it('singleReservationSchema valida campos obligatorios y formato', () => {
    const valid = {
      id: 'R-1',
      passengerId: 'P001',
      flightCode: 'AA001',
      origin: 'JFK',
      destination: 'EZE',
      departureDate: '2026-10-20',
      seatClass: 'economy',
      passengerType: 'adult'
    };
    expect(singleReservationSchema.safeParse(valid).success).toBe(true);

    const badDate = { ...valid, departureDate: '20-10-2026' };
    expect(singleReservationSchema.safeParse(badDate).success).toBe(false);

    const badAirport = { ...valid, origin: 'NEWYORK' };
    expect(singleReservationSchema.safeParse(badAirport).success).toBe(false);

    const extraField = { ...valid, campoInventado: 123 };
    expect(singleReservationSchema.safeParse(extraField).success).toBe(false);
  });

  it('processReservationsSchema detecta duplicados y limite de reservas', () => {
    const valid = {
      passengerId: 'P001',
      flightCode: 'AA001',
      origin: 'JFK',
      destination: 'EZE',
      departureDate: '2026-10-20',
      seatClass: 'economy',
      passengerType: 'adult'
    };

    const duplicate = processReservationsSchema.safeParse({
      reservations: [{ ...valid, id: 'R-DUP' }, { ...valid, id: 'R-DUP' }]
    });
    expect(duplicate.success).toBe(false);

    const empty = processReservationsSchema.safeParse({ reservations: [] });
    expect(empty.success).toBe(false);

    const withExchangeRate = processReservationsSchema.safeParse({
      reservations: [valid],
      config: { exchangeRate: { timeoutMs: 1000 } }
    });
    expect(withExchangeRate.success).toBe(false);
  });

  it('pipelineConfigPatchSchema valida parches parciales y rechaza desconocidos', () => {
    const validPatch = {
      taxes: { airportFeeUsd: 30 }
    };
    expect(pipelineConfigPatchSchema.safeParse(validPatch).success).toBe(true);

    const invalidKey = { claveInvalida: true };
    expect(pipelineConfigPatchSchema.safeParse(invalidKey).success).toBe(false);
  });

  it('toValidationIssues formatea errores de Zod incluyendo raiz cuando path esta vacio', () => {
    const rootSchema = z.string().refine(() => false, { message: 'error en raiz' });
    const parsed = rootSchema.safeParse(123);
    if (!parsed.success) {
      const issues = toValidationIssues(parsed.error);
      expect(issues.some((i) => i.path === '(raiz)')).toBe(true);
    }
  });
});
