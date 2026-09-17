export type LoyaltyTier = 'none' | 'bronze' | 'silver' | 'gold';

export type PassengerType = 'child' | 'adult' | 'senior';

export type SeatClass = 'economy' | 'business' | 'first';

export interface Passenger {
  id: string;
  name: string;
  email: string;
  birthDate: string;
  country: string;
  loyaltyTier: LoyaltyTier;
  isActive: boolean;
}

export interface Flight {
  code: string;
  flightCode: string;
  origin: string;
  destination: string;
  originCountry: string;
  destinationCountry: string;
  departureAt: string;
  durationMinutes: number;
  baseFare: number;
  availableSeats: number;
  airline?: string;
}

/** Contrato publico de entrada por cada reserva (BUILD-TASKS F2). */
export interface ReservationInput {
  id?: string;
  passengerId: string;
  flightCode: string;
  origin: string;
  destination: string;
  departureDate: string;
  seatClass: SeatClass;
  passengerType: PassengerType;
}

/** Representacion interna de la reserva dentro del contexto del pipeline. */
export interface ReservationRequest extends ReservationInput {
  id: string;
  reservationId?: string;
}

export interface PriceBreakdown {
  baseFare?: number;
  classPrice?: number;
  currentPrice?: number;
  loyaltyDiscount?: number;
  passengerTypeDiscount?: number;
  subtotal?: number;
  taxes?: number;
  fuelSurcharge?: number;
  airportFee?: number;
  total?: number;
}

export type RateSource = 'api' | 'cache' | 'fallback' | 'identity';

export interface CurrencyMetadata {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  rateSource: RateSource;
  retrievedAt: string;
  convertedTotal?: number;
}

export type IssueSeverity = 'error' | 'warning';

export interface ProcessingIssue {
  filter: string;
  code: string;
  message: string;
  severity: IssueSeverity;
  details?: unknown;
}

export type FilterTraceStatus = 'COMPLETED' | 'SKIPPED' | 'FAILED' | 'NOT_RUN';

export interface FilterTrace {
  filter: string;
  status: FilterTraceStatus;
  durationMs: number;
  detail?: string;
}
