import { rejectReservation, ReservationContext } from '../../domain/reservationContext';
import { PriceBreakdown } from '../../domain/types';
import { Filter, FilterDependencies, FilterFactory } from '../filter';

const FILTER = 'taxesAndFees' as const;

function calculateTaxes(pricing: PriceBreakdown, taxes: FilterDependencies['config']['taxes']): PriceBreakdown {
  const subtotal = pricing.currentPrice ?? 0;
  const taxesAmount = subtotal * taxes.taxRate;
  const airportFee = taxes.airportFeeUsd;
  const classPrice = pricing.classPrice ?? pricing.baseFare ?? 0;
  const fuelSurcharge = classPrice * taxes.fuelSurchargeRate;
  const total = subtotal + taxesAmount + airportFee + fuelSurcharge;
  return {
    ...pricing, subtotal, taxes: taxesAmount, airportFee, fuelSurcharge, total
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
