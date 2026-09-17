# ADR 6: Configuración inmutable global con snapshot por lote y orden fijo de filtros

El sistema debe permitir que un operador ajuste reglas de negocio (activacion de filtros, tasas, descuentos) en tiempo de ejecucion sin reiniciar el servidor (`PUT /pipeline/config`, AC 3). Asimismo, una solicitud particular puede adjuntar modificaciones de configuracion en su sobre. Si la configuracion global muta mientras un lote se esta ejecutando, o si un cliente puede alterar el orden de las etapas arbitrariamente, se originan condiciones de carrera y secuencias de ejecucion invalidas (por ejemplo, calcular impuestos antes de validar el vuelo o antes de conocer el precio base).

## Decisión

Nosotros estableceremos un orden rigurosamente fijo para los 8 filtros del pipeline (`FILTER_NAMES`), descartando cualquier soporte para reordenamiento dinámico (`filterOrder` queda prohibido y su presencia en un PUT devuelve HTTP 400). Gestionaremos la configuracion mediante `PipelineConfigStore`:
1. Cada actualizacion global via `PUT /pipeline/config` reemplaza de manera inmutable el estado del almacen.
2. Cada lote obtiene un **snapshot** inmutable de la configuracion vigente al momento de iniciar su ejecucion.
3. Los overrides incluidos en el cuerpo del request se aplican unicamente sobre una copia local para ese lote, sin mutar la configuracion global.
4. Se prohibe sobreescribir la configuracion de infraestructura de tipo de cambio (`exchangeRate`) a traves de peticiones ordinarias de procesamiento.

## Justificación

La tecnica de snapshot por lote aisla la ejecucion del pipeline de modificaciones concurrentes, cumpliendo de forma determinista el escenario AC 3: un lote en curso finaliza con las reglas con las que inicio, mientras que el lote siguiente adopta de inmediato las nuevas pautas. Restringir el orden de los filtros preserva las invariantes del dominio aeronáutico, donde las validaciones de elegibilidad deben preceder necesariamente a la tarificación y la conversion final.

Alternativas consideradas y rechazadas:
1. Permitir reordenamiento dinámico de filtros: Rechazada (Q4) porque las dependencias semanticas entre filtros hacen que casi cualquier reordenamiento sea invalido o cause excepciones por falta de datos previos.
2. Mutacion directa de un singleton de configuracion: Rechazada porque generaba condiciones de carrera donde reservas del mismo lote podian computarse con descuentos o impuestos desalineados.
3. Permitir que los overrides de un POST alterasen la configuracion global: Rechazada por violar el principio de aislamiento entre solicitudes de distintos clientes.

## Estado

Aceptado

## Consecuencias

Positivas:
- Aislamiento garantizado (AC 3): 0 reinicios de aplicacion y 0 lotes con politicas de precios mezcladas.
- Robustez estructural: se imposibilita configurar una secuencia de filtros que viole las precondiciones de calculo.
- Proteccion contra desconfiguraciones accidentales: parametros de red y URLs no son alterables mediante cargas utiles de reserva.

Negativas:
- Rigidez en la secuencia: modificar el orden de evaluacion exigira actualizar el codigo fuente y desplegar un nuevo release.
- La configuracion reside en la memoria de la instancia; en despliegues distribuidos requeriria un almacen centralizado (e.g. Redis o Consul).
