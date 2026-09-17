/** Redondeo monetario a dos decimales, evitando arrastrar error binario. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
