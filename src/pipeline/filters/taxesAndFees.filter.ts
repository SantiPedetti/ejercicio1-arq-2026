import { rejectReservation, ReservationContext } from '../../domain/reservationContext';
import { round2 } from '../../support/money';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

const FILTER = 'taxesAndFees' as const;

function calculateTaxes(
  pricing: NonNullable<ReservationContext['pricing']>,
  taxes: FilterDependencies['config']['taxes']
): void {
  pricing.taxesUsd = round2(pricing.netPriceUsd * taxes.taxRate);
  pricing.airportFeeUsd = round2(taxes.airportFeeUsd);
  pricing.fuelSurchargeUsd = round2(pricing.flightBasePriceUsd * taxes.fuelSurchargeRate);
  pricing.totalUsd = round2(
    pricing.netPriceUsd + pricing.taxesUsd + pricing.airportFeeUsd + pricing.fuelSurchargeUsd
  );
}

class TaxesAndFeesFilter implements Filter {
  readonly name = FILTER;

  constructor(private readonly config: FilterDependencies['config']) {}

  execute(context: ReservationContext): ReservationContext {
    if (!context.pricing) {
      return rejectReservation(
        context,
        FILTER,
        'PRICING_NOT_INITIALIZED',
        'No hay desglose de precios; el filtro de precio base debe ejecutarse antes'
      );
    }
    calculateTaxes(context.pricing, this.config.taxes);
    return context;
  }
}

export const createTaxesAndFeesFilter: FilterFactory = ({ config }) => new TaxesAndFeesFilter(config);
