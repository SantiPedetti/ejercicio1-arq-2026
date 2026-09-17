import { ReservationResult } from '../services/reservationResult';

/**
 * Almacen en memoria del ultimo resultado de procesamiento por reserva, que
 * sostiene el endpoint GET /reservations/:id/status. Se pierde al reiniciar el
 * proceso: es una decision deliberada del alcance del ejercicio.
 */
export class ProcessingStore {
  private readonly results = new Map<string, ReservationResult>();

  save(result: ReservationResult): void {
    this.results.set(result.reservationId, result);
  }

  saveAll(results: ReservationResult[]): void {
    results.forEach((result) => this.save(result));
  }

  find(reservationId: string): ReservationResult | undefined {
    return this.results.get(reservationId);
  }

  clear(): void {
    this.results.clear();
  }

  size(): number {
    return this.results.size;
  }
}

export const processingStore = new ProcessingStore();
