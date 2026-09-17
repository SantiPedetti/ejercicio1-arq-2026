import { ReservationStatus } from '../domain/reservationContext';
import { ReservationResult } from '../services/reservationResult';

export interface ReservationStatusEntry {
  reservationId: string;
  status: ReservationStatus;
  updatedAt: string;
  result?: ReservationResult;
}

export class ProcessingStore {
  private static readonly MAX_ENTRIES = 1000;
  private readonly entries = new Map<string, ReservationStatusEntry>();

  saveStatus(entry: ReservationStatusEntry): void {
    if (this.entries.size >= ProcessingStore.MAX_ENTRIES && !this.entries.has(entry.reservationId)) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }
    this.entries.set(entry.reservationId, entry);
  }

  saveResult(result: ReservationResult, updatedAt: string = new Date().toISOString()): void {
    this.saveStatus({
      reservationId: result.reservationId,
      status: result.status,
      updatedAt,
      result
    });
  }

  saveAll(results: ReservationResult[], updatedAt: string = new Date().toISOString()): void {
    for (const res of results) {
      this.saveResult(res, updatedAt);
    }
  }

  find(reservationId: string): ReservationStatusEntry | undefined {
    return this.entries.get(reservationId);
  }

  findResult(reservationId: string): ReservationResult | undefined {
    return this.entries.get(reservationId)?.result;
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}

export const processingStore = new ProcessingStore();
