# Documentacion

## Arquitectura

- [Documentacion arquitectonica](architecture/architecture.md) — proposito, requerimientos significativos, atributos de calidad, restricciones, decisiones de diseno (DD-001 a DD-012) y matriz de trazabilidad.

## Escenarios de calidad

- [AC-001 — Caida o timeout de la API de tipo de cambio](architecture/quality-scenarios/AC-001-caida-api-tipo-de-cambio.md)
- [AC-002 — Incorporar un filtro nuevo al pipeline](architecture/quality-scenarios/AC-002-alta-de-filtro-nuevo.md)
- [AC-003 — Deshabilitar o reconfigurar un filtro sin reiniciar](architecture/quality-scenarios/AC-003-deshabilitar-filtro-en-caliente.md)
- [AC-004 — Excepcion inesperada dentro de un filtro](architecture/quality-scenarios/AC-004-excepcion-en-un-filtro.md)
- [AC-005 — Reutilizacion de tasas desde la cache](architecture/quality-scenarios/AC-005-cache-de-tasas.md)

## Decisiones de arquitectura (ADR)

| ADR | Titulo |
|---|---|
| [ADR-001](adr/ADR-001-pipes-and-filters.md) | Adoptar Pipes & Filters en proceso con contexto compartido |
| [ADR-002](adr/ADR-002-contexto-mutable.md) | Contexto mutable acumulativo frente a transformacion inmutable |
| [ADR-003](adr/ADR-003-aislamiento-de-fallos.md) | Aislamiento de fallos por filtro y politica de continuidad del lote |
| [ADR-004](adr/ADR-004-integracion-tipo-de-cambio.md) | Integracion resiliente con la API de tipo de cambio |
| [ADR-005](adr/ADR-005-configuracion-mutable.md) | Configuracion del pipeline mutable en memoria, con overrides por request |
| [ADR-006](adr/ADR-006-estado-en-memoria.md) | Datos mock y estado de procesamiento en memoria, detras de abstracciones |
| [ADR-007](adr/ADR-007-orden-pipeline-tipo-de-cambio.md) | Orden del pipeline y separacion del filtro de tipo de cambio |
