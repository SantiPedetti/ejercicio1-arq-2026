import { rejectReservation } from '../../domain/reservationContext';
import { round2 } from '../../support/money';
import { Filter, FilterFactory } from '../filter';

const FILTER: 'basePrice' = 'basePrice';

/**
 * Inicializa el desglose de precios: multiplica el precio base publicado por la
 * cantidad de asientos y por el multiplicador de la clase solicitada.
 */
export const createBasePriceFilter: FilterFactory = ({ config }): Filter => ({
  name: FILTER,
  execute(context) {
    const flight = context.flight;
    if (!flight) {
      return rejectReservation(
        context,
        FILTER,
        'FLIGHT_NOT_RESOLVED',
        'No se puede calcular el precio base sin un vuelo resuelto en el contexto'
      );
    }

    const seats = context.request.seats ?? 1;
    const multiplier = config.seatClassMultipliers[context.request.seatClass];
    if (typeof multiplier !== 'number') {
      return rejectReservation(
        context,
        FILTER,
        'SEAT_CLASS_NOT_CONFIGURED',
        `No hay multiplicador configurado para la clase ${context.request.seatClass}`
      );
    }

    const flightBasePriceUsd = round2(flight.basePriceUsd * seats);
    const classAdjustedPriceUsd = round2(flightBasePriceUsd * multiplier);

    context.pricing = {
      flightBasePriceUsd,
      classAdjustedPriceUsd,
      loyaltyDiscountUsd: 0,
      passengerTypeDiscountUsd: 0,
      netPriceUsd: classAdjustedPriceUsd,
      taxesUsd: 0,
      airportFeeUsd: 0,
      fuelSurchargeUsd: 0,
      totalUsd: classAdjustedPriceUsd
    };
    context.metadata.seatClassMultiplier = multiplier;
    context.metadata.seats = seats;

    return context;
  }
});
