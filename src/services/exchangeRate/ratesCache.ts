export interface CachedRates {
  rates: Record<string, number>;
  retrievedAt: string;
  expiresAt: number;
}

/**
 * Cache en memoria de tasas por moneda base con vencimiento por TTL.
 * Evita llamadas innecesarias a la API externa (tactica de rendimiento) y
 * amortigua fallos transitorios del proveedor.
 */
export class RatesCache {
  private readonly entries = new Map<string, CachedRates>();

  constructor(
    private ttlMs: number,
    private readonly now: () => number = () => Date.now()
  ) {}

  get(baseCurrency: string): CachedRates | undefined {
    const entry = this.entries.get(baseCurrency);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(baseCurrency);
      return undefined;
    }
    return entry;
  }

  set(baseCurrency: string, rates: Record<string, number>): CachedRates {
    const timestamp = this.now();
    const entry: CachedRates = {
      rates,
      retrievedAt: new Date(timestamp).toISOString(),
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
