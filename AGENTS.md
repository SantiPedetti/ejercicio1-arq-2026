# Notas para agentes

## Comandos de verificación

```bash
npm install
npm run typecheck   # tsc estricto: src (tsconfig.json) + tests (tsconfig.test.json)
npm run lint        # eslint . (typescript-eslint estricto con flat config)
npm run build       # emite dist/ (solo src, tests excluidos del build)
npm run dev         # tsx watch --env-file-if-exists=.env src/server.ts
npm start           # node --env-file-if-exists=.env dist/server.js
npm test            # jest --ci --runInBand --coverage (179 tests)
npm run verify      # typecheck && lint && test
```

> **IMPORTANTE (Regla de construcción):** En el entorno de ejecución automatizado del agente constructor, Jest puede colgarse; por tanto, el constructor verifica su trabajo utilizando únicamente:
> - `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`
> - `node node_modules/typescript/bin/tsc -p tsconfig.test.json`
> - `node node_modules/eslint/bin/eslint.js .`
>
> El revisor externo o usuario es quien corre `npm test` o `npm run verify`.

---

## Convenciones del proyecto

- **Idioma:** Documentación y mensajes de usuario en español (sin tildes en el código fuente TypeScript); identificadores, tipos y nombres de archivo en inglés.
- **Pipeline de 8 filtros en orden estricto inmutable:**
  1. `validatePassenger` (crítico)
  2. `validateFlight` (crítico)
  3. `exchangeRateEnrichment` (no crítico, único con I/O externo)
  4. `basePrice` (crítico)
  5. `loyaltyDiscount` (crítico)
  6. `passengerTypeAdjustment` (crítico)
  7. `taxesAndFees` (crítico)
  8. `currencyConversion` (no crítico)
- **Extensibilidad de filtros:** Un filtro nuevo requiere:
  1. Archivo en `src/pipeline/filters/`
  2. Identificador en `FILTER_NAMES` (`src/config/pipelineConfig.ts`)
  3. Fábrica en `FILTER_FACTORIES` (`src/pipeline/registry.ts`)
  4. Valor por defecto en `DEFAULT_PIPELINE_CONFIG.enabledFilters`
- **Inyección de dependencias:** Los filtros reciben dependencias exclusivamente por `FilterDependencies` (configuración, repositorios, proveedor de tasas, logger, `now`). Prohibido usar singletons o `new Date()` dentro de los filtros (rompe el determinismo de los tests).
- **Inmutabilidad y Contexto:** Cada filtro recibe `ReservationContext` y retorna una nueva copia superficial de los objetos modificados (`{ ...ctx, ... }`). Tras cada paso, el orquestador ejecuta `context-guard` para verificar que los montos numéricos sean finitos y no negativos (código de error `DATA_CORRUPTED`, estado `FAILED`).
- **Gestión de errores:**
  - Errores de negocio: `rejectReservation` (marca `status: 'REJECTED'`, `aborted: true` y añade `Issue` de severidad `error`).
  - Avisos o fallos de integración externa: `addWarning` (reserva confirmada con `warnings`).
  - Excepciones no controladas: capturadas por el orquestador `Pipeline`. Si el filtro es crítico (`critical: true`), la reserva pasa a `FAILED` con `FILTER_EXCEPTION`; si no es crítico, se registra warning `FILTER_EXCEPTION` y el flujo continúa en USD.
- **Validación en 3 fronteras (Zod):**
  1. Body del request HTTP (`singleReservationSchema` y `processReservationsSchema`).
  2. Variables de entorno al arranque con *fail-fast* (`src/config/env.ts`).
  3. Respuestas JSON de la API externa de tipo de cambio (`apiResponseSchema`).
- **Aislamiento de red:** Las pruebas nunca tocan la red. El servicio inyecta stubs de `ExchangeRateProvider` o funciones `fetchFn` simuladas.

---

## Decisiones arquitectónicas y desvíos

Antes de modificar la arquitectura, consultar `docs/architecture/architecture.md` y los 8 ADRs en `docs/adr/`:
- **ADR-001:** Pipes & Filters en el mismo proceso dentro de capas estrictas.
- **ADR-002:** Contexto inmutable, *context-guard* y validación Zod en tres fronteras.
- **ADR-003:** Manejo y aislamiento de fallos según criticidad del filtro.
- **ADR-004:** Fórmula de precio encadenada y combustible sobre `classPrice`.
- **ADR-005:** Integración con ExchangeRate-API mediante timeout (5 s), 3 reintentos con backoff/jitter, caché (1 h), *single-flight* y degradación (*stale-cache* o USD).
- **ADR-006:** Configuración inmutable con snapshot por lote y orden fijo de filtros (sin `filterOrder` dinámico).
- **ADR-007:** Separación entre enriquecimiento de tasa (F3) y conversión monetaria (F8).
- **ADR-008:** Estado en memoria acotado (1000 entradas FIFO), procesamiento síncrono y omisión de decremento de inventario.

### Desvíos aceptados
- **D1 (Anulado en F6):** El lote se procesa de forma concurrente con `Promise.all` para que la técnica de *single-flight* comparta una sola tanda de reintentos entre reservas de un mismo lote (escenario AC 1).
- **D2:** Se mantienen `ts-jest` y `tsx` (en lugar de babel-jest y `node --watch`).
- **D3:** Los valores de enums de negocio están en minúscula (`gold`, `child`, `economy`), mientras que códigos de error y estados van en MAYÚSCULAS.
