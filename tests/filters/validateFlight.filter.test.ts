import { createValidateFlightFilter } from '../../src/pipeline/filters/validateFlight.filter';
import { contextFor, issueCodes, testDeps } from '../helpers/testDeps';

const filter = createValidateFlightFilter(testDeps());

describe('filtro de validacion de vuelo', () => {
  it('acepta un vuelo existente, con asientos y ruta y fecha validas', async () => {
    const context = await filter.execute(contextFor());

    expect(context.status).toBe('PENDING');
    expect(context.flight?.flightCode).toBe('AA001');
    expect(context.issues).toHaveLength(0);
  });

  it('rechaza la reserva si el vuelo no existe', async () => {
    const context = await filter.execute(contextFor({ flightCode: 'ZZ999' }));

    expect(context.status).toBe('REJECTED');
    expect(issueCodes(context)).toEqual(['FLIGHT_NOT_FOUND']);
  });

  it('rechaza la reserva si el vuelo no tiene asientos disponibles', async () => {
    const context = await filter.execute(
      contextFor({ flightCode: 'AA0002', origin: 'MIA', destination: 'JFK', departureDate: '2026-10-01' })
    );

    expect(issueCodes(context)).toEqual(['NO_SEATS']);
  });

  it('rechaza la reserva si la ruta no coincide con la del vuelo', async () => {
    const context = await filter.execute(contextFor({ destination: 'MAD' }));

    expect(issueCodes(context)).toEqual(['ROUTE_MISMATCH']);
  });

  it('rechaza la reserva si la fecha de salida ya paso', async () => {
    const context = await filter.execute(
      contextFor({ flightCode: 'UX0099', origin: 'MAD', destination: 'MIA', departureDate: '2026-09-15' })
    );

    expect(issueCodes(context)).toEqual(['FLIGHT_DEPARTED']);
  });

  it('rechaza la reserva si la fecha solicitada no coincide con la fecha del vuelo', async () => {
    const context = await filter.execute(
      contextFor({ departureDate: '2026-11-20' })
    );

    expect(issueCodes(context)).toEqual(['DATE_MISMATCH']);
  });

  it('acepta codigos de vuelo y aeropuertos en minusculas', async () => {
    const context = await filter.execute(
      contextFor({ flightCode: 'aa001', origin: 'jfk', destination: 'eze', departureDate: '2026-10-08' })
    );

    expect(context.issues).toHaveLength(0);
  });
});
