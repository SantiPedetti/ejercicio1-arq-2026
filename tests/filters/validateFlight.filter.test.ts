import { createValidateFlightFilter } from '../../src/pipeline/filters/validateFlight.filter';
import { contextFor, issueCodes, testDeps } from '../helpers/testDeps';

const filter = createValidateFlightFilter(testDeps());

describe('filtro de validacion de vuelo', () => {
  it('acepta un vuelo existente, con asientos y ruta y fecha validas', async () => {
    const context = await filter.execute(contextFor());

    expect(context.status).toBe('pending');
    expect(context.flight?.flightCode).toBe('AA001');
    expect(context.issues).toHaveLength(0);
  });

  it('rechaza la reserva si el vuelo no existe', async () => {
    const context = await filter.execute(contextFor({ flightCode: 'ZZ999' }));

    expect(context.status).toBe('rejected');
    expect(issueCodes(context)).toEqual(['FLIGHT_NOT_FOUND']);
  });

  it('rechaza la reserva si el vuelo no tiene asientos disponibles', async () => {
    const context = await filter.execute(
      contextFor({ flightCode: 'AM0404', origin: 'MEX', destination: 'JFK' })
    );

    expect(issueCodes(context)).toEqual(['NO_SEATS_AVAILABLE']);
  });

  it('rechaza la reserva si se piden mas asientos que los disponibles', async () => {
    const context = await filter.execute(
      contextFor({ flightCode: 'LA4567', origin: 'EZE', destination: 'GRU', seats: 5 })
    );

    expect(issueCodes(context)).toEqual(['INSUFFICIENT_SEATS']);
  });

  it('rechaza la reserva si la ruta no coincide con la del vuelo', async () => {
    const context = await filter.execute(contextFor({ destination: 'MAD' }));

    expect(issueCodes(context)).toEqual(['ROUTE_MISMATCH']);
  });

  it('rechaza la reserva si la fecha de salida ya paso', async () => {
    const context = await filter.execute(
      contextFor({ flightCode: 'LA4570', origin: 'EZE', destination: 'GRU' })
    );

    expect(issueCodes(context)).toEqual(['FLIGHT_ALREADY_DEPARTED']);
  });

  it('acepta codigos de vuelo y aeropuertos en minusculas', async () => {
    const context = await filter.execute(
      contextFor({ flightCode: 'aa001', origin: 'eze', destination: 'mia' })
    );

    expect(context.issues).toHaveLength(0);
  });
});
