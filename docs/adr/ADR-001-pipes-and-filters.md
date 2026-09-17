# ADR 1: Pipes & Filters en el mismo proceso dentro de capas estrictas

El sistema debe procesar solicitudes de reservas de vuelos aplicando una serie de etapas secuenciales: validaciones de pasajero y vuelo, obtencion de tasas de cambio externas, calculo escalonado de precios (clase, descuentos de lealtad y edad, impuestos y tasas) y conversion a moneda local. Los requisitos de modificabilidad (AC 2, AC 3) demandan poder anadir, quitar o desactivar filtros sin alterar la logica de los demas pasos ni el orquestador. Por otro lado, la consigna exige un backend en Node.js, TypeScript y Express.js que responda de forma sincrona con el tiempo total del lote, acotando la complejidad de despliegue a un entorno controlado.

## Decisión

Nosotros implementaremos el procesamiento de reservas utilizando el patron arquitectonico Pipes & Filters ejecutado en memoria dentro del mismo proceso Node.js, estructurado bajo una jerarquia de capas estrictas (Routes → Controllers → Services → Pipeline/Filters → Repositories/Providers). El flujo de cada reserva atravesara una tuberia de 8 filtros secuenciales independientes que reciben un contexto y devuelven un nuevo contexto enriquecido.

## Justificación

El patron Pipes & Filters desacopla las responsabilidades de calculo, validacion y transformacion: cada filtro se enfoca en una unica tarea de negocio y no conoce la existencia ni la implementacion de los otros filtros. Mantenerlo dentro del mismo proceso satisface la necesidad de respuesta sincrona para el lote y preserva la simplicidad operativa requerida.

Alternativas consideradas y rechazadas:
1. Servicio monolitico con una unica funcion imperativa: Aunque reduce la indireccion, acopla rigidamente las reglas de negocio, impidiendo desactivar filtros por configuracion en caliente (AC 3) y dificultando el testeo unitario aislado de cada regla (AC 6).
2. Arquitectura distribuida basada en colas de mensajes (RabbitMQ, Kafka o AWS SQS): Introducir brokers externos para un procesamiento por lote en memoria constituye sobreingenieria innecesaria (discutido en clase del 10/09), aumenta la complejidad de despliegue y choca con el requerimiento de computar y devolver de inmediato el tiempo total de procesamiento en la respuesta HTTP.
3. Capas relajadas con saltos directos (e.g. rutas accediendo a repositorios o filtros accediendo a la base de datos): Rechazada porque viola las reglas de la catedra sobre unidireccionalidad de capas, diluyendo los limites arquitectonicos.

## Estado

Aceptado

## Consecuencias

Positivas:
- Alta modificabilidad (AC 2): agregar, reemplazar o reconfigurar un filtro no requiere modificar el runner (`Pipeline`) ni los demas filtros.
- Excelente testeabilidad (AC 6): cada filtro se prueba unitariamente mediante inyeccion de dependencias sin levantar el servidor Express ni tocar la red.
- Composicion y aislamiento: se define una frontera clara entre las capas de transporte HTTP, coordinacion de aplicacion, logica de procesamiento y acceso a datos.

Negativas:
- Sobrecarga por indireccion: el paso de mensajes por la tuberia y la ejecucion asincrona de etapas sucesivas introduce un pequeno overhead de latencia frente a un bloque imperativo directo.
- El modelo en memoria limita la escalabilidad al espacio de memoria y ciclo de vida de una unica instancia del proceso Node.js.
