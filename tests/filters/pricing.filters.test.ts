import { ReservationContext } from '../../src/domain/reservationContext';
import { ReservationInput } from '../../src/domain/types';
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
  overrides: Partial<ReservationInput>,
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
  it('reserva economy de un adulto sin programa de lealtad: sin descuentos (P007 en AA001)', async () => {
    const context = await priceReservation({ passengerId: 'P007' });

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

  it('pasajero gold: aplica 15% de descuento por lealtad (P001 en AA001)', async () => {
    const context = await priceReservation({ passengerId: 'P001' });

    expect(context.pricing).toMatchObject({
      loyaltyDiscountUsd: 67.5,
      netPriceUsd: 382.5,
      taxesUsd: 45.9,
      totalUsd: 489.4
    });
  });

  // se habilita en F4 (requiere la formula de fuel surcharge sobre classPrice de F4)
  it.skip('nino gold en business: combina clase, lealtad y tipo (P008 en LA4567 = 422.00)', async () => {
    const context = await priceReservation({
      passengerId: 'P008',
      flightCode: 'LA4567',
      origin: 'SCL',
      destination: 'GRU',
      departureDate: '2026-09-27',
      seatClass: 'business',
      passengerType: 'child'
    });

    expect(context.pricing).toMatchObject({
      flightBasePriceUsd: 200,
      classAdjustedPriceUsd: 500,
      loyaltyDiscountUsd: 75,
      passengerTypeDiscountUsd: 106.25,
      netPriceUsd: 318.75,
      taxesUsd: 38.25,
      airportFeeUsd: 25,
      fuelSurchargeUsd: 40,
      totalUsd: 422
    });
  });

  // se habilita en F4 (requiere la formula de fuel surcharge sobre classPrice de F4)
  it.skip('senior en primera clase: aplica multiples ajustes en cascada (P004 en IB6841 = 3740.20)', async () => {
    const context = await priceReservation({
      passengerId: 'P004',
      flightCode: 'IB6841',
      origin: 'MAD',
      destination: 'EZE',
      departureDate: '2026-11-01',
      seatClass: 'first',
      passengerType: 'senior'
    });

    expect(context.pricing).toMatchObject({
      classAdjustedPriceUsd: 3600,
      loyaltyDiscountUsd: 0,
      passengerTypeDiscountUsd: 540,
      netPriceUsd: 3060,
      taxesUsd: 367.2,
      airportFeeUsd: 25,
      fuelSurchargeUsd: 288,
      totalUsd: 3740.2
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

    expect(context.status).toBe('REJECTED');
    expect(issueCodes(context)).toEqual(['PRICING_NOT_INITIALIZED']);
  });
});
