# Notas para agentes

## Comandos de verificacion

```bash
npm install
npm run typecheck   # tsc estricto: src (tsconfig.json) + tests (tsconfig.test.json)
npm test            # jest + ts-jest + supertest
npm run build       # emite dist/ (solo src, tests excluidos del build)
npm run dev         # tsx watch src/server.ts
```

Ejecutar siempre `npm run typecheck` y `npm test` antes de dar por terminado un cambio.

## Convenciones del proyecto

- Documentacion y mensajes de usuario en espanol (sin tildes en el codigo fuente); identificadores, tipos y nombres de archivo en ingles.
- Un filtro nuevo requiere: archivo en `src/pipeline/filters/`, nombre en `FILTER_NAMES`, fabrica en `FILTER_FACTORIES` y valor en `DEFAULT_PIPELINE_CONFIG.enabledFilters`. El compilador falla si falta el registro.
- Los filtros reciben todo por `FilterDependencies` (config, repositorios, proveedor de tasas, logger, `now`). No usar singletons ni `new Date()` dentro de un filtro: rompe el determinismo de las pruebas.
- Las reglas de negocio (porcentajes, multiplicadores, impuestos) van en `src/config/pipelineConfig.ts`, nunca como constantes en los filtros.
- Errores de negocio: `rejectReservation`. Fallos de integracion o avisos: `addWarning`. Las excepciones las captura el orquestador.
- Las pruebas no deben tocar la red: inyectar `exchangeRateProvider` o `fetchFn`.

## Decisiones ya documentadas

Antes de cambiar la arquitectura, leer `docs/architecture/architecture.md` y los ADRs en `docs/adr/`. En particular, el filtro de tipo de cambio esta dividido en `exchangeRateEnrichment` (posicion 3, unica llamada externa) y `currencyConversion` (ultima posicion): ver ADR-007.
