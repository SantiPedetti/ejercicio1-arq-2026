/**
 * Configuracion global de pruebas: aislamiento estricto de la red.
 * Cualquier invocacion al fetch global fallara de inmediato indicando que debe
 * inyectarse un mock o un proveedor simulado.
 */
const networkBlockedFetch = (): Promise<Response> => {
  throw new Error(
    'Network call blocked: global fetch must not be called in tests. Inject a mock fetch or exchangeRateProvider instead.'
  );
};

globalThis.fetch = networkBlockedFetch as unknown as typeof fetch;
