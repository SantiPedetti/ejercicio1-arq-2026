import { rejectReservation } from '../../domain/reservationContext';
import { round2 } from '../../support/money';
import { Filter, FilterFactory } from '../filter';

const FILTER: 'taxesAndFees' = 'taxesAndFees';

/**
 * Cierra el calculo en USD: impuestos sobre el precio neto, tasa fija de
 * aeropuerto y sobrecargo por combustible sobre el precio base del vuelo.
 */
export const createTaxesAndFeesFilter: FilterFactory = ({ config }): Filter => ({
  name: FILTER,
  execute(context) {
    const pricing = context.pricing;
    if (!pricing) {
      return rejectReservation(
        context,
        FILTER,
        'PRICING_NOT_INITIALIZED',
        'No hay desglose de precios; el filtro de precio base debe ejecutarse antes'
      );
    }

    const { taxRate, airportFeeUsd, fuelSurchargeRate } = config.taxes;

    pricing.taxesUsd = round2(pricing.netPriceUsd * taxRate);
    pricing.airportFeeUsd = round2(airportFeeUsd);
    pricing.fuelSurchargeUsd = round2(pricing.flightBasePriceUsd * fuelSurchargeRate);
    pricing.totalUsd = round2(
      pricing.netPriceUsd + pricing.taxesUsd + pricing.airportFeeUsd + pricing.fuelSurchargeUsd
    );

    return context;
  }
});
