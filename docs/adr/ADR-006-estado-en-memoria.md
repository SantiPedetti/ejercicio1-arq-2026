# ADR-006: Datos mock y estado de procesamiento en memoria, detras de abstracciones

- **Estado:** Aceptado
- **Fecha:** 2026-09-17
- **Responsables:** Equipo de desarrollo del ejercicio
- **Estado de evidencia:** Confirmada

## Contexto

La consigna pide datos de prueba predefinidos en memoria que simulen una base de datos, en archivos separados (`/data/mockPassengers.ts`, `/data/mockFlights.ts`), cargados al inicio y faciles de modificar para distintos escenarios de testing. Ademas exige `GET /reservations/:id/status`, que devuelve el estado del procesamiento de una reserva concreta: eso implica retener informacion **despues** de que termine el request que la genero. No hay base de datos en el alcance.

## Requerimientos relacionados

- RF: RF-02 (validar pasajero), RF-03 (validar vuelo), RF-07 (estado de una reserva).
- Atributos de calidad: QA-04 testabilidad, QA-06 observabilidad.
- Restricciones tecnicas: RT-03 (datos mock en memoria, en archivos separados).
- Restricciones organizacionales: RO-02 (sin infraestructura), RO-04 (escenarios de prueba requeridos).

## Opciones consideradas

Comparacion como **analisis actual**; la restriccion de usar datos mock esta **documentada en la consigna**.

### Opcion A — Arrays en modulos, indexados en `Map` detras de repositorios; resultados en un `ProcessingStore` en memoria (elegida)

- Ventajas: cumple RT-03; busquedas O(1); los filtros no conocen la fuente de datos, por lo que migrar a persistencia real no los toca; los datos se disenan por escenario de prueba.
- Desventajas: interfaz sincronica; el estado se pierde al reiniciar; no hay consultas ni indices reales.
- Impacto: maximiza QA-04 con costo minimo.

### Opcion B — Importar los arrays directamente en cada filtro

- Ventajas: menos capas.
- Desventajas: acopla los filtros al formato de los datos y a su ubicacion; cualquier cambio de fuente obliga a modificar los filtros; complica inyectar datos de prueba distintos.
- Impacto: degrada QA-04 y QA-01.

### Opcion C — SQLite en memoria o una base real

- Ventajas: semantica de base de datos real (consultas, transacciones, concurrencia); persistencia opcional.
- Desventajas: dependencia y asincronia que el ejercicio no pide; arranque mas complejo; contradice RT-03.
- Impacto: desproporcionada para el alcance.

### Opcion D — No retener resultados y recalcular en `GET /reservations/:id/status`

- Ventajas: sin estado que gestionar.
- Desventajas: imposible: el endpoint recibe solo un id y no la reserva original; recalcular daria otro resultado si cambiaron la configuracion o las tasas, con lo cual dejaria de ser un "estado del procesamiento".
- Impacto: incumple RF-07.

## Decision

Los datos mock viven en `src/data/` como arrays tipados y se indexan en un `Map` al cargar el modulo; el acceso pasa siempre por `passengerRepository` / `flightRepository`, que exponen `findById` / `findByCode` y `findAll`. Las fechas de salida de los vuelos se calculan **relativas al arranque** (`daysFromNow`), incluido un vuelo con fecha pasada para el caso de validacion.

Los resultados de procesamiento se proyectan al contrato publico (`toReservationResult`) y se guardan en `ProcessingStore`, un `Map` por `reservationId` que conserva el ultimo resultado y sostiene `GET /reservations/:id/status`. Tanto los repositorios como el store se inyectan, de modo que las pruebas usan instancias limpias.

## Justificacion

La indireccion del repositorio cuesta muy poco y es lo unico que hace que una futura migracion a persistencia real no toque los ocho filtros; sin ella, el acoplamiento se repartiria por todo el pipeline. Calcular las fechas de forma relativa evita el defecto clasico de los datos de prueba con fechas fijas, que dejan de ser "futuras" con el paso del tiempo y rompen las pruebas sin que cambie el codigo. Guardar el resultado proyectado —y no el contexto interno— evita que el endpoint de estado exponga estructuras internas del pipeline.

## Consecuencias positivas

- Los escenarios obligatorios de la consigna estan cubiertos por construccion: pasajero inactivo, incoherencias edad/tipo, contacto invalido, vuelo sin asientos, asientos escasos, vuelo ya partido y destinos con monedas distintas.
- Busquedas O(1) y sin latencia de I/O en las validaciones.
- Las pruebas no necesitan preparar ni limpiar una base de datos.
- Los filtros son indiferentes al origen de los datos.

## Consecuencias negativas y trade-offs

- Los repositorios son sincronicos: migrar a una base real cambiaria la interfaz a asincronica (atenuado porque `Filter.execute` ya admite `Promise`).
- El estado de procesamiento se pierde al reiniciar y no se comparte entre instancias: `GET /reservations/:id/status` puede devolver 404 tras un reinicio.
- El store crece sin limite mientras el proceso viva: es una fuga de memoria potencial en uso intensivo.
- El sistema **no reserva efectivamente** el asiento (no decrementa `availableSeats`), por lo que dos reservas simultaneas pueden validar contra el mismo asiento.

## Riesgos y mitigaciones

| Riesgo | Probabilidad o impacto | Mitigacion |
|---|---|---|
| Crecimiento ilimitado de `ProcessingStore` | Media en uso prolongado / medio | `clear()` disponible; politica de expiracion o limite LRU queda como **Propuesta** |
| Perdida del historial de procesamiento al reiniciar | Alta / bajo en el alcance academico | Documentado como limitacion en el README; persistencia como Propuesta |
| Sobreventa por no decrementar asientos | Alta si se usara en produccion / alto | Explicitamente fuera de alcance; requeriria transacciones y control de concurrencia |
| Datos mock que caducan | Baja | Fechas calculadas relativas al arranque |

## Evidencia

- Consigna, secciones "Datos de Prueba" e "Implementacion Sugerida".
- `src/data/mockPassengers.ts`, `src/data/mockFlights.ts`, `src/repositories/`, `src/store/processingStore.ts`.
- `tests/filters/validatePassenger.filter.test.ts`, `tests/filters/validateFlight.filter.test.ts`, `tests/api/reservations.routes.test.ts` (`GET /:id/status` y su 404).

## Decisiones relacionadas

- [ADR-001 — Adoptar Pipes & Filters](ADR-001-pipes-and-filters.md)
- [ADR-005 — Configuracion del pipeline mutable en memoria](ADR-005-configuracion-mutable.md)
