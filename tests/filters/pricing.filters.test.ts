import { ReservationContext } from '../../src/domain/reservationContext';
import { ReservationRequest } from '../../src/domain/types';
import { FilterDependencies } from '../../src/pipeline/filter';
import { createBasePriceFilter } from '../../src/pipeline/filters/basePrice.filter';
import { createLoyaltyDiscountFilter } from '../../src/pipeline/filters/loyaltyDiscount.filter';
import { createPassengerTypeAdjustmentFilter } from '../../src/pipeline/filters/passengerTypeAdjustment.filter';
import { createTaxesAndFeesFilter } from '../../src/pipeline/filters/taxesAndFees.filter';
import { createValidateFlightFilter } from '../../src/pipeline/filters/validateFlight.filter';
import { createValidatePassengerFilter } from '../../src/pipeline/filters/validatePassenger.filter';
import { contextFor, issueCodes, testDeps } from '../helpers/testDeps';

/** Ejecuta la cadena de precios completa sobre una reserva valida. */
async function priceReservation(
  overrides: Partial<ReservationRequest>,
  deps: FilterDependencies = testDeps()
): Promise<ReservationContext> {
  const chain = [
    createValidatePassengerFilter(deps),
    createValidateFlightFilter(deps),
    createBasePriceFilter(deps),
    createLoyaltyDiscountFilter(deps),
    createPassengerTypeAdjustmentFilter(deps),
    createTaxesAndFeesFilter(deps)
  ];

  let context = contextFor(overrides);
  for (const filter of chain) {
    context = await filter.execute(context);
  }
  return context;
}

describe('cadena de filtros de precio', () => {
  it('reserva economy de un adulto sin programa de lealtad: sin descuentos', async () => {
    const context = await priceReservation({ passengerId: 'P012' });

    expect(context.pricing).toMatchObject({
      flightBasePriceUsd: 450,
      classAdjustedPriceUsd: 450,
      loyaltyDiscountUsd: 0,
      passengerTypeDiscountUsd: 0,
      netPriceUsd: 450,
      taxesUsd: 54,
      airportFeeUsd: 25,
      fuelSurchargeUsd: 36,
      totalUsd: 565
    });
    expect(context.issues).toHaveLength(0);
  });

  it('pasajero gold: aplica 15% de descuento por lealtad', async () => {
    const context = await priceReservation({ passengerId: 'P001' });

    expect(context.pricing).toMatchObject({
      loyaltyDiscountUsd: 67.5,
      netPriceUsd: 382.5,
      taxesUsd: 45.9,
      totalUsd: 489.4
    });
  });

  it('nino silver en business: combina multiplicador de clase, lealtad y tipo de pasajero', async () => {
    const context = await priceReservation({
      passengerId: 'P003',
      flightCode: 'IB6841',
      origin: 'EZE',
      destination: 'MAD',
      seatClass: 'business'
    });

    expect(context.pricing).toMatchObject({
      flightBasePriceUsd: 890,
      classAdjustedPriceUsd: 2225,
      loyaltyDiscountUsd: 222.5,
      passengerTypeDiscountUsd: 500.63,
      netPriceUsd: 1501.87,
      taxesUsd: 180.22,
      airportFeeUsd: 25,
      fuelSurchargeUsd: 71.2,
      totalUsd: 1778.29
    });
  });

  it('senior gold en primera clase: aplica multiples ajustes en cascada', async () => {
    const context = await priceReservation({
      passengerId: 'P004',
      flightCode: 'QF0012',
      origin: 'SYD',
      destination: 'LAX',
      seatClass: 'first'
    });

    expect(context.pricing).toMatchObject({
      classAdjustedPriceUsd: 5800,
      loyaltyDiscountUsd: 870,
      passengerTypeDiscountUsd: 739.5,
      netPriceUsd: 4190.5,
      totalUsd: 4834.36
    });
  });

  it('escala el precio base y el sobrecargo por combustible con la cantidad de asientos', async () => {
    const context = await priceReservation({
      passengerId: 'P002',
      flightCode: 'LA4567',
      origin: 'EZE',
      destination: 'GRU',
      seats: 2
    });

    expect(context.pricing).toMatchObject({
      flightBasePriceUsd: 360,
      loyaltyDiscountUsd: 36,
      fuelSurchargeUsd: 28.8,
      totalUsd: 416.68
    });
  });

  it('usa los porcentajes de la configuracion, no constantes embebidas', async () => {
    const deps = testDeps({
      config: {
        ...testDeps().config,
        loyaltyDiscounts: { none: 0, bronze: 0.5, silver: 0.5, gold: 0.5 },
        taxes: { taxRate: 0, airportFeeUsd: 0, fuelSurchargeRate: 0 }
      }
    });

    const context = await priceReservation({ passengerId: 'P001' }, deps);

    expect(context.pricing).toMatchObject({
      loyaltyDiscountUsd: 225,
      netPriceUsd: 225,
      taxesUsd: 0,
      airportFeeUsd: 0,
      fuelSurchargeUsd: 0,
      totalUsd: 225
    });
  });

  it('rechaza el calculo si el precio base no fue inicializado', async () => {
    const deps = testDeps();
    const context = await createLoyaltyDiscountFilter(deps).execute(contextFor());

    expect(context.status).toBe('rejected');
    expect(issueCodes(context)).toEqual(['PRICING_NOT_INITIALIZED']);
  });
});
