# ADR 8: Estado en memoria acotado, procesamiento síncrono y omisión de reserva de inventario

El sistema debe permitir consultar el resultado de una reserva procesada mediante `GET /reservations/:id/status` y requiere reportar el tiempo total de procesamiento en la respuesta de cada lote. No obstante, el alcance del proyecto no contempla bases de datos externas ni persistencia en disco. Mantener un historial ilimitado de reservas en la memoria del proceso provocaria agotamiento de memoria (*memory leak*). Asimismo, debia definirse si la validacion de asientos debia descontar cupo sobre los vuelos mock.

## Decisión

Nosotros implementaremos:
1. **Almacén de estado acotado en memoria (`ProcessingStore`)**: implementado con una estructura `Map` restringida a un maximo de 1000 registros bajo politica de reemplazo FIFO (al alcanzarse el limite, se descarta la reserva mas antigua).
2. **Procesamiento sincrono del lote**: el endpoint `POST /reservations/process` ejecuta todas las reservas concurrentemente via `Promise.all` dentro del mismo ciclo HTTP, calculando y retornando de inmediato el tiempo total (`processingTimeMs`).
3. **Verificacion de disponibilidad sin decremento**: el filtro `validateFlight` constata que `availableSeats > 0`, pero no descuenta ni bloquea inventario sobre el vuelo.

## Justificación

Limitar el almacenamiento a 1000 entradas garantiza un uso acotado y estable de la memoria RAM del proceso Node.js, satisfaciendo el requerimiento de consulta posterior de estado sin comprometer la estabilidad del servidor. El modelo sincrono cumple directamente con el contrato especificado en la consigna (que exige devolver los resultados calculados y la duracion en el cuerpo de la respuesta). Evitar descontar asientos en los mocks en memoria previene condiciones de carrera (*race conditions*) y asegura la repetibilidad y determinismo de la suite de pruebas automatizadas.

Alternativas consideradas y rechazadas:
1. Procesamiento asincrono con HTTP 202 Accepted y colas en background: Rechazada (Q5) porque choca frontalmente con el requisito de retornar de forma directa el tiempo total transcurrido y los precios calculados en la respuesta del POST.
2. Decrementar el cupo de asientos (`availableSeats`): Rechazada (Q5) porque sin un motor transaccional ACID real, mutar los datos en memoria tornaria no-deterministas las pruebas e introduciria fallos dependientes del orden de ejecucion.
3. Persistencia en base de datos embebida (SQLite o similar): Rechazada por anadir dependencias nativas y complejidad de migraciones ajenas al objetivo de evaluar el patron Pipes & Filters.

## Estado

Aceptado

## Consecuencias

Positivas:
- Prevencion de fugas de memoria: el tope FIFO de 1000 entradas estabiliza el consumo de memoria en ejecuciones prolongadas.
- Pruebas deterministas (AC 6): los datos mock de vuelos permanecen inmutables, permitiendo reiterar las pruebas sin necesidad de resetear inventarios.
- Cumplimiento contractual inmediato con el cliente HTTP.

Negativas:
- Volatilidad: al detener o reiniciar la aplicacion se pierde todo el historial previo de estados.
- No apto para escalado horizontal directo: multiples replicas del servicio tendrian almacenes aislados y desincronizados.
