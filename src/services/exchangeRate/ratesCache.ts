export interface CachedRates {
  rates: Record<string, number>;
  fetchedAt: Date;
  retrievedAt: string;
  expiresAt: number;
}

/**
 * Cache en memoria de tasas por moneda base con vencimiento por TTL.
 * Guarda la ultima tasa aunque venza para permitir degradacion a stale-cache.
 */
export class RatesCache {
  private readonly entries = new Map<string, CachedRates>();

  constructor(
    private ttlMs: number,
    private readonly now: () => number = () => Date.now()
  ) {}

  get(baseCurrency: string): CachedRates | undefined {
    const entry = this.entries.get(baseCurrency);
    if (!entry || entry.expiresAt <= this.now()) return undefined;
    return entry;
  }

  getStale(baseCurrency: string): CachedRates | undefined {
    return this.entries.get(baseCurrency);
  }

  set(baseCurrency: string, rates: Record<string, number>, fetchedAt?: Date): CachedRates {
    const timestamp = this.now();
    const date = fetchedAt ?? new Date(timestamp);
    const entry: CachedRates = {
      rates,
      fetchedAt: date,
      retrievedAt: date.toISOString(),
      expiresAt: timestamp + this.ttlMs
    };
    this.entries.set(baseCurrency, entry);
    return entry;
  }

  setTtl(ttlMs: number): void {
    this.ttlMs = ttlMs;
  }

  invalidate(baseCurrency?: string): void {
    if (baseCurrency) this.entries.delete(baseCurrency);
    else this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}
