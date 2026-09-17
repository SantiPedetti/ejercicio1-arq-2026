import { rejectReservation, ReservationContext } from '../../domain/reservationContext';
import { PriceBreakdown } from '../../domain/types';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

const FILTER = 'taxesAndFees' as const;

function calculateTaxes(pricing: PriceBreakdown, taxes: FilterDependencies['config']['taxes']): PriceBreakdown {
  const subtotal = pricing.currentPrice ?? pricing.netPriceUsd ?? 0;
  const taxesUsd = subtotal * taxes.taxRate;
  const airportFeeUsd = taxes.airportFeeUsd;
  const baseFare = pricing.flightBasePriceUsd ?? pricing.baseFare ?? 0;
  const fuelSurchargeUsd = baseFare * taxes.fuelSurchargeRate;
  const totalUsd = subtotal + taxesUsd + airportFeeUsd + fuelSurchargeUsd;
  return {
    ...pricing, subtotal, taxesUsd, taxes: taxesUsd,
    airportFeeUsd, airportFee: airportFeeUsd,
    fuelSurchargeUsd, fuelSurcharge: fuelSurchargeUsd, totalUsd, total: totalUsd
  };
}

class TaxesAndFeesFilter implements Filter {
  readonly name = FILTER;
  readonly critical = true;

  constructor(private readonly config: FilterDependencies['config']) {}

  execute(context: ReservationContext): ReservationContext {
    if (!context.pricing) {
      return rejectReservation(
        context,
        FILTER,
        'MISSING_DATA',
        'No hay desglose de precios; el filtro de precio base debe ejecutarse antes'
      );
    }
    const pricing = calculateTaxes(context.pricing, this.config.taxes);
    return { ...context, pricing };
  }
}

export const createTaxesAndFeesFilter: FilterFactory = ({ config }) => new TaxesAndFeesFilter(config);
