import { FilterName, PipelineConfig } from '../config/pipelineConfig';
import { ReservationContext } from '../domain/reservationContext';
import { FlightRepository } from '../repositories/flightRepository';
import { PassengerRepository } from '../repositories/passengerRepository';
import { ExchangeRateProvider } from '../services/exchangeRate/exchangeRateProvider';
import { Logger } from '../support/logger';

/**
 * Dependencias que un filtro puede necesitar. Se inyectan al construirlo para
 * que cada filtro sea testeable de forma aislada, sin acoplarse a instancias
 * globales ni al orquestador.
 */
export interface FilterDependencies {
  config: PipelineConfig;
  passengers: PassengerRepository;
  flights: FlightRepository;
  exchangeRates: ExchangeRateProvider;
  logger: Logger;
  now: () => Date;
}

/**
 * Contrato uniforme de todo filtro del pipeline: recibe el contexto de una
 * reserva y devuelve el contexto enriquecido. La uniformidad de la interfaz es
 * lo que permite reordenar, agregar o quitar filtros sin tocar el orquestador.
 */
export interface Filter {
  readonly name: FilterName;
  /**
   * Cuando es true el filtro se ejecuta incluso si la reserva ya fue rechazada
   * (por ejemplo, filtros de auditoria). Por defecto es false.
   */
  readonly runOnAborted?: boolean;
  execute(context: ReservationContext): Promise<ReservationContext> | ReservationContext;
}

export type FilterFactory = (deps: FilterDependencies) => Filter;
