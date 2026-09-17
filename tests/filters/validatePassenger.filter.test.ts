import {
  createValidatePassengerFilter,
  expectedPassengerType
} from '../../src/pipeline/filters/validatePassenger.filter';
import { contextFor, issueCodes, testDeps } from '../helpers/testDeps';

const filter = createValidatePassengerFilter(testDeps());

describe('filtro de validacion de pasajero', () => {
  it('acepta un pasajero activo con datos coherentes y lo deja en el contexto', async () => {
    const context = await filter.execute(contextFor({ passengerId: 'P001' }));

    expect(context.status).toBe('pending');
    expect(context.aborted).toBe(false);
    expect(context.passenger?.id).toBe('P001');
    expect(context.issues).toHaveLength(0);
  });

  it('rechaza la reserva si el pasajero no existe', async () => {
    const context = await filter.execute(contextFor({ passengerId: 'NO-EXISTE' }));

    expect(context.status).toBe('rejected');
    expect(context.aborted).toBe(true);
    expect(issueCodes(context)).toEqual(['PASSENGER_NOT_FOUND']);
  });

  it('rechaza la reserva si el pasajero esta inactivo', async () => {
    const context = await filter.execute(contextFor({ passengerId: 'P006' }));

    expect(context.status).toBe('rejected');
    expect(issueCodes(context)).toEqual(['PASSENGER_INACTIVE']);
  });

  it('rechaza la reserva si el nombre esta incompleto', async () => {
    const context = await filter.execute(contextFor({ passengerId: 'P011' }));

    expect(issueCodes(context)).toEqual(['PASSENGER_NAME_INVALID']);
  });

  it('rechaza la reserva si la edad no es coherente con el tipo de pasajero', async () => {
    const menor = await filter.execute(contextFor({ passengerId: 'P009' }));
    const mayor = await filter.execute(contextFor({ passengerId: 'P010' }));

    expect(issueCodes(menor)).toEqual(['PASSENGER_TYPE_MISMATCH']);
    expect(menor.issues[0]?.message).toContain('child');
    expect(issueCodes(mayor)).toEqual(['PASSENGER_TYPE_MISMATCH']);
    expect(mayor.issues[0]?.message).toContain('senior');
  });

  it('clasifica la edad segun los umbrales del negocio', () => {
    expect(expectedPassengerType(11)).toBe('child');
    expect(expectedPassengerType(12)).toBe('adult');
    expect(expectedPassengerType(65)).toBe('adult');
    expect(expectedPassengerType(66)).toBe('senior');
  });
});
