# Documentacion arquitectonica — Sistema de Reservas de Vuelos

Documento educativo: no describe solo *que* existe, sino *por que* cada decision es razonable, que fuerzas la motivan, que alternativas habia y que trade-offs introduce.

Cada afirmacion relevante lleva una etiqueta de evidencia:

- **Confirmada:** respaldada por la consigna, el codigo, la configuracion o las pruebas de este repositorio.
- **Inferida:** deducida del diseno actual, sin evidencia de la intencion historica.
- **Propuesta:** recomendacion que todavia no forma parte del sistema.
- **Desconocida:** no hay informacion suficiente.

Fuentes consultadas: consigna del ejercicio (`Ejercicio de Aplicacion 1`), codigo fuente en `src/`, configuracion en `src/config/pipelineConfig.ts`, pruebas en `tests/` (58 casos), coleccion de Postman y ejecucion manual contra la API externa real. No existe SRS formal, historias de usuario ni metricas de produccion: los huecos quedan listados en la ultima seccion.

---

## 2.1 Proposito del sistema

### Problema y objetivo

Una reserva de vuelo no se puede confirmar con un unico calculo: hay que verificar que el pasajero exista y este habilitado, que el vuelo exista y tenga lugar, y despues construir el precio final componiendo multiplicadores de clase, descuentos comerciales, ajustes por tipo de pasajero, impuestos y tasas. Esas reglas cambian a ritmos distintos y por motivos distintos (comercial, regulatorio, operativo), y parte de la informacion necesaria —la cotizacion de la moneda del pais de destino— proviene de un tercero que puede estar caido.

El objetivo del sistema es **procesar lotes de solicitudes de reserva aplicando esas reglas de forma trazable y configurable**, entregando por cada reserva el precio desglosado, la conversion de moneda y el detalle de errores y avisos, sin que el fallo de una reserva o de un tercero comprometa el resto del lote. (Confirmada: consigna, secciones "Objetivo" y "Aclaraciones".)

### Usuarios y actores

| Actor | Descripcion | Objetivos principales |
|---|---|---|
| Sistema cliente de reservas | Aplicacion o front-end que envia lotes de solicitudes | Obtener precios finales y el motivo de cada rechazo |
| Operador / analista comercial | Persona que ajusta reglas de negocio del pipeline | Cambiar descuentos, impuestos o habilitar filtros sin redeploy |
| Proveedor de tipo de cambio | Servicio externo ExchangeRate-API | (Actor externo) Proveer cotizaciones actualizadas |
| Equipo de desarrollo | Autores y mantenedores de los filtros | Agregar o modificar filtros con bajo riesgo de regresion |

(Confirmada para el cliente y el proveedor: endpoints y cliente HTTP existentes. Inferida para operador y equipo de desarrollo: la consigna exige configurabilidad y filtros testeables por separado, pero no nombra roles.)

### Funciones principales

- Procesar un array de reservas a traves de una cadena ordenada de filtros.
- Validar pasajero (existencia, estado, contacto, coherencia edad/tipo).
- Validar vuelo (existencia, disponibilidad, ruta, fecha futura).
- Enriquecer la reserva con la cotizacion de la moneda del pais de destino.
- Calcular precio base por clase, descuentos por lealtad y tipo de pasajero, impuestos y tasas.
- Convertir el total a la moneda de destino.
- Reportar por reserva: estado, desglose de precio, errores, warnings y traza de filtros; y por lote, el tiempo total de procesamiento.
- Consultar el estado del ultimo procesamiento de una reserva.
- Consultar y modificar la configuracion del pipeline en ejecucion.

(Confirmada: `src/pipeline/filters/`, `src/api/`, consigna "Filtros a Implementar" y "Endpoints Requeridos".)

### Alcance

**Incluido:**

- Pipeline de filtros en proceso, sincronico por reserva.
- Datos de pasajeros y vuelos mock en memoria.
- Integracion HTTP con un proveedor publico de tasas de cambio.
- API REST con cuatro endpoints requeridos mas `/health` y reset de configuracion.
- Pruebas unitarias por filtro y de integracion por endpoint.

**Fuera del alcance:**

- Persistencia real (base de datos), transacciones y reserva efectiva de asientos (el sistema no decrementa `availableSeats`).
- Autenticacion, autorizacion y multi-tenancy.
- Cobro, emision de tickets y notificaciones.
- Despliegue, escalado horizontal y observabilidad centralizada.
- Procesamiento asincronico o distribuido de los filtros.

(Confirmada: no hay codigo de persistencia, seguridad ni despliegue en el repositorio; la consigna acota el ejercicio a mock data y pipeline en proceso.)

### Documentos relacionados

- Consigna del ejercicio: `Ejercicio de Aplicacion 1.md` (documento del curso, fuera del repositorio).
- [README](../../README.md) — instalacion, endpoints y reglas de negocio.
- ADRs: [`docs/adr`](../adr).
- Escenarios de calidad: [`docs/architecture/quality-scenarios`](quality-scenarios).

---

## 2.2 Requerimientos significativos de arquitectura

Se incluyen solo los requerimientos que condicionan la estructura, afectan a varios componentes, obligan a adoptar una tactica o tecnologia, o tienen alto costo de cambio. Requerimientos puramente locales (por ejemplo, el formato exacto de un mensaje de error) quedan fuera.

### 2.2.1 Resumen de requerimientos funcionales

| ID | Requerimiento | Descripcion | Actor | Significancia arquitectonica |
|---|---|---|---|---|
| RF-01 | Procesar lote de reservas | `POST /reservations/process` aplica la cadena de filtros a cada reserva y devuelve resultados, resumen y tiempo total | Sistema cliente | Define la topologia del sistema: es el requerimiento que motiva el estilo Pipes & Filters |
| RF-02 | Validar pasajero | Existencia, estado activo, contacto, coherencia edad/tipo | Sistema cliente | Introduce una decision de corte temprano del flujo y un modelo de errores fatales |
| RF-03 | Validar vuelo | Existencia, asientos, ruta, fecha futura | Sistema cliente | Igual que RF-02; ademas aporta el pais de destino que RF-05 necesita |
| RF-04 | Calcular precio | Clase, lealtad, tipo de pasajero, impuestos y tasas | Sistema cliente | Reglas volatiles que se parametrizan en configuracion y se reparten en cuatro filtros |
| RF-05 | Enriquecer con tipo de cambio | Obtener tasas de una API externa y convertir el total | Sistema cliente / proveedor externo | Unico punto de I/O remoto: obliga a tacticas de disponibilidad y define un puerto de integracion |
| RF-06 | Reportar errores, warnings y tiempos | Por reserva y por lote | Sistema cliente | Obliga a que el contexto acumule diagnostico en lugar de cortar con una excepcion |
| RF-07 | Consultar estado de una reserva | `GET /reservations/:id/status` | Sistema cliente | Exige retener resultados fuera del ciclo del request |
| RF-08 | Ver y modificar la configuracion del pipeline | `GET`/`PUT /pipeline/config`, incluida la habilitacion de filtros | Operador comercial | Convierte el orden y las reglas en datos mutables en runtime |

(Todos Confirmada: consigna "Endpoints Requeridos" / "Filtros a Implementar" y su implementacion en `src/api/reservations.routes.ts`, `src/api/pipeline.routes.ts` y `src/pipeline/filters/`.)

### 2.2.2 Resumen de atributos de calidad

| RF relacionado | ID | Atributo | Descripcion | Prioridad | Estado de evidencia |
|---|---|---|---|---|---|
| RF-01, RF-04, RF-08 | QA-01 | Modificabilidad | Agregar, quitar o reordenar filtros y cambiar porcentajes sin modificar el orquestador ni otros filtros | Alta | Confirmada (`src/pipeline/registry.ts`, `src/config/pipelineConfig.ts`, prueba de reordenamiento en `tests/api/pipeline.routes.test.ts`) |
| RF-05 | QA-02 | Disponibilidad ante fallo del tercero | El procesamiento sobrevive a timeout, error HTTP o caida total del proveedor | Alta | Confirmada (consigna lo exige; `exchangeRateApiClient.ts` y `tests/services/exchangeRateApiClient.test.ts`) |
| RF-01, RF-06 | QA-03 | Robustez / aislamiento de fallos | Una excepcion en un filtro no aborta el lote ni tumba el proceso | Alta | Confirmada (`src/pipeline/pipeline.ts`, prueba "aisla la excepcion de un filtro") |
| RF-02..RF-05 | QA-04 | Testabilidad | Cada filtro se prueba aislado, sin HTTP ni red | Alta | Confirmada (consigna "Aclaraciones"; `FilterDependencies` y 58 pruebas sin red) |
| RF-05 | QA-05 | Rendimiento / eficiencia de la integracion | Evitar llamadas innecesarias al tercero y acotar la latencia por reserva | Media | Confirmada parcialmente (cache TTL 1 h y timeout 5 s implementados; presupuesto de latencia end-to-end: `Pendiente de validacion`) |
| RF-06, RF-01 | QA-06 | Observabilidad / trazabilidad | Poder explicar que filtro hizo que y cuanto tardo | Media | Confirmada (`FilterTrace` en cada resultado, logger estructurado) |
| RF-08 | QA-07 | Configurabilidad en runtime | Cambiar reglas y filtros habilitados sin reiniciar ni redeployar | Media | Confirmada (`PipelineConfigStore`, `PUT /pipeline/config`) |
| RF-01, RF-08 | QA-08 | Seguridad | Control de acceso a la modificacion de reglas de negocio | Baja en el alcance actual | Propuesta (no implementada; ver ADR-005) |

### 2.2.3 Restricciones arquitectonicas

| ID | Tipo | Restriccion | Impacto arquitectonico |
|---|---|---|---|
| RT-01 | Tecnologica | Node.js + TypeScript + Express | Fija el runtime, el modelo de concurrencia (event loop, un solo hilo) y el framework HTTP |
| RT-02 | Estilo impuesto | Debe usarse el patron Pipes & Filters | Elimina la eleccion de estilo: la discusion se traslada a como implementarlo (ADR-001, ADR-002) |
| RT-03 | Datos | Pasajeros y vuelos mock en memoria, en archivos separados y faciles de modificar | Los repositorios son sincronicos; no hay latencia ni fallos de base de datos que tolerar |
| RT-04 | Integracion | Proveedor publico de tipo de cambio, gratuito y con cuota mensual (ExchangeRate-API, sin API key) | Motiva la cache (cuota) y las tasas de respaldo (sin SLA) |
| RT-05 | Integracion | Timeout maximo 5 s, hasta 3 reintentos, cache de tasas por 1 hora con invalidacion manual | Define directamente los parametros de las tacticas de disponibilidad |
| RT-06 | Dominio | Todos los precios base estan en USD | Simplifica el calculo: una sola conversion al final |
| RT-07 | Comportamiento ante fallos | Si la API de cambio falla, el procesamiento continua con warnings y precios en USD | Prohibe que un error de integracion se propague como error de negocio |
| RT-08 | Dominio | Umbrales de edad: child < 12, senior > 65 | Regla de coherencia que el filtro de pasajero debe verificar, no solo usar para descuentos |

(Todas Confirmada: consigna, secciones "Integracion con API de Tipo de Cambio", "Estrategia de Validacion" y "Aclaraciones".)

### 2.2.4 Restricciones organizacionales

| ID | Restriccion | Descripcion | Impacto |
|---|---|---|---|
| RO-01 | Entregables fijos | Codigo TypeScript, pruebas, coleccion de Postman y README | Obliga a mantener documentacion y ejemplos ejecutables como parte del producto |
| RO-02 | Ejercicio academico acotado | Sin infraestructura de despliegue, base de datos ni operacion real | Justifica estado en memoria y ausencia de seguridad (ADR-005, ADR-006) |
| RO-03 | Filtros independientes y testeables por separado | Exigencia explicita de la consigna | Impone inyeccion de dependencias en los filtros y prohibe singletons dentro de ellos |
| RO-04 | Casos de prueba requeridos | La consigna enumera escenarios obligatorios (flujo basico, precios, integracion, errores) | Los datos mock se disenan para cubrir cada escenario |

---

## 3.4.1 Vista de componentes

```
                         ┌──────────────────────────────────────────┐
  HTTP  ──────────────►  │  Capa API (Express)                      │
                         │  routes + zod + errorHandler             │
                         └───────────────┬──────────────────────────┘
                                         │  ReservationRequest[] + overrides
                         ┌───────────────▼──────────────────────────┐
                         │  ReservationProcessingService            │
                         │  compone config + dependencias           │
                         └───────┬───────────────────────┬──────────┘
                                 │                       │
                 ┌───────────────▼─────────┐   ┌─────────▼──────────┐
                 │  Pipeline (orquestador) │   │ PipelineConfigStore│
                 │  secuencia + aislamiento│   │ (config mutable)   │
                 └───────────────┬─────────┘   └────────────────────┘
                                 │  ReservationContext
   ┌─────────────────────────────▼───────────────────────────────────┐
   │ validatePassenger → validateFlight → exchangeRateEnrichment →   │
   │ basePrice → loyaltyDiscount → passengerTypeAdjustment →         │
   │ taxesAndFees → currencyConversion                               │
   └─────┬───────────────────┬───────────────────────────────────────┘
         │                   │
 ┌───────▼────────┐  ┌───────▼───────────────┐      ┌────────────────┐
 │ Repositorios   │  │ ExchangeRateProvider  │◄────►│ ExchangeRate-  │
 │ (datos mock)   │  │ cliente + RatesCache  │      │ API (externo)  │
 └────────────────┘  └───────────────────────┘      └────────────────┘
                                 │
                       ┌─────────▼──────────┐
                       │  ProcessingStore   │  (GET /reservations/:id/status)
                       └────────────────────┘
```

Los filtros solo conocen el `ReservationContext` y su objeto de dependencias; nunca se invocan entre si. (Confirmada: `src/pipeline/filter.ts`, `src/pipeline/registry.ts`.)

---

## 3.4.2 Decisiones de diseno

### DD-001 — Pipes & Filters con contexto de reserva como pipe en memoria

**Estado de evidencia:** Confirmada

**Necesidad**

- RF relacionados: RF-01, RF-02, RF-03, RF-04, RF-05.
- Atributos de calidad: QA-01 (modificabilidad), QA-04 (testabilidad).
- Restricciones: RT-02 (estilo impuesto), RT-01, RO-03.

**Diseno adoptado y manifestacion en la vista**

`Pipeline` recibe una lista ordenada de objetos `Filter` y los aplica en secuencia sobre un `ReservationContext`. Los "pipes" no son colas ni streams: son el pasaje del mismo objeto de contexto de un filtro al siguiente dentro del mismo proceso y del mismo tick logico. Cada filtro declara un `name` y un metodo `execute`.

**Clasificacion**

- Estilo arquitectonico: Pipes & Filters.
- Patron: Chain of Responsibility en su variante "todos participan" (no hay corto circuito por consumo del mensaje, sino por marca de aborto).
- Tactica: separacion de responsabilidades para modificabilidad; interfaz uniforme para reducir el acoplamiento.
- Tecnologia: TypeScript (interfaces estructurales), Node.js.

**Justificacion**

Las siete reglas de la consigna son independientes entre si y cambian por motivos distintos. Una cadena de filtros con interfaz uniforme permite modificar una regla tocando un archivo, y cambiar el orden o la composicion sin tocar ninguna implementacion. La uniformidad de la interfaz es lo que habilita QA-01: el orquestador no sabe que hace cada filtro.

**Alternativas**

Analisis actual (no hay evidencia de que se hayan evaluado historicamente): un unico servicio `calculateReservation` con las reglas en orden fijo seria mas corto y mas rapido de leer, pero haria imposible RF-08 (habilitar/deshabilitar filtros) sin condicionales dispersos, y obligaria a probar el calculo completo para verificar una regla. Un pipeline con colas o eventos (por ejemplo, streams de Node o un broker) daria concurrencia y desacople temporal, a costa de complejidad, orden no garantizado y dificultad para devolver un resultado sincronico por HTTP, que es lo que exige RF-01.

**Consecuencias**

- Beneficios: cada regla es una unidad reemplazable; el orden es dato, no codigo; pruebas unitarias triviales por filtro.
- Costos y desventajas: mas archivos y mas indireccion que una funcion monolitica; el lector debe reconstruir mentalmente el calculo total recorriendo ocho filtros.
- Riesgos: acoplamiento implicito por el orden (un filtro asume que otro ya escribio en el contexto). Mitigado con chequeos defensivos: `PRICING_NOT_INITIALIZED`, `FLIGHT_NOT_RESOLVED`.
- Trade-offs: se cambia simplicidad de lectura por flexibilidad de composicion.

**Evidencia**

- `src/pipeline/pipeline.ts`, `src/pipeline/filter.ts`, `src/pipeline/registry.ts`.
- `tests/pipeline/pipeline.test.ts` ("ejecuta los filtros en el orden recibido").

**ADR relacionado**

- [ADR-001 — Adoptar Pipes & Filters en proceso con contexto compartido](../adr/ADR-001-pipes-and-filters.md)

---

### DD-002 — Contexto mutable que acumula diagnostico, en lugar de transformacion inmutable

**Estado de evidencia:** Confirmada

**Necesidad**

- RF relacionados: RF-06, RF-01.
- Atributos de calidad: QA-06 (observabilidad), QA-03 (robustez).
- Restricciones: RT-07.

**Diseno adoptado y manifestacion en la vista**

`ReservationContext` contiene la solicitud original, los datos resueltos (`passenger`, `flight`), el desglose `pricing`, la metadata de moneda, un array `issues` con errores y warnings, y una `trace` por filtro. Los filtros mutan ese objeto mediante funciones auxiliares (`addWarning`, `rejectReservation`) y lo devuelven.

**Clasificacion**

- Estilo: Pipes & Filters (variante de mensaje enriquecido acumulativo).
- Patron: Context Object; Notification (acumulacion de errores en lugar de excepciones).
- Tactica: registro de fallos y de actividad para observabilidad.
- Tecnologia: TypeScript.

**Justificacion**

RF-06 pide un reporte de errores *y* warnings por reserva, y RT-07 exige continuar procesando pese a fallos de integracion. Con excepciones, el primer problema cortaria el flujo y perderiamos los diagnosticos posteriores; con estructuras inmutables, cada filtro tendria que reconstruir y copiar un objeto grande en cada paso sin beneficio funcional visible para el cliente.

**Alternativas**

Analisis actual: (a) filtros puros que devuelven un contexto nuevo (`{...context, pricing}`) — mas seguro frente a mutaciones accidentales y mas facil de razonar en paralelo, a costa de copias y verbosidad; (b) excepciones tipadas por regla — mas idiomatico para "detener el flujo", pero incompatible con acumular varios avisos y con seguir procesando el lote.

**Consecuencias**

- Beneficios: diagnostico completo por reserva; codigo de filtro corto; costo de memoria constante por reserva.
- Costos y desventajas: la mutacion compartida permite que un filtro pise datos de otro sin que el compilador lo impida.
- Riesgos: si en el futuro se ejecutaran filtros en paralelo sobre el mismo contexto, habria condiciones de carrera. Mitigacion: el orquestador es estrictamente secuencial por reserva.
- Trade-offs: se cambia pureza funcional por simplicidad y por un reporte de diagnostico rico.

**Evidencia**

- `src/domain/reservationContext.ts`, `src/services/reservationResult.ts`.
- `tests/filters/exchangeRate.filters.test.ts` (warnings acumulados sin abortar).

**ADR relacionado**

- [ADR-002 — Contexto mutable acumulativo frente a transformacion inmutable](../adr/ADR-002-contexto-mutable.md)

---

### DD-003 — Interfaz uniforme de filtro con dependencias inyectadas y registry por nombre

**Estado de evidencia:** Confirmada

**Necesidad**

- RF relacionados: RF-02..RF-05, RF-08.
- Atributos de calidad: QA-04 (testabilidad), QA-01 (modificabilidad).
- Restricciones: RO-03 ("cada filtro debe ser independiente y testeable por separado").

**Diseno adoptado y manifestacion en la vista**

Cada filtro se construye con una funcion fabrica `(deps: FilterDependencies) => Filter`. `FilterDependencies` agrupa configuracion, repositorios, proveedor de tasas, logger y reloj (`now`). `FILTER_FACTORIES` mapea `FilterName` a fabrica, y `buildFilters` instancia la lista segun `config.filterOrder`.

**Clasificacion**

- Patron: Factory + Registry; Dependency Injection manual por constructor.
- Tactica: sustitucion de dependencias para testabilidad; parametrizacion del reloj para eliminar no-determinismo.
- Tecnologia: TypeScript (union de literales `FilterName` que garantiza en compilacion que el registry este completo).

**Justificacion**

Sin inyeccion, el filtro de vuelo tomaria `new Date()` y el repositorio global, y probar "fecha ya pasada" dependeria del calendario. Con `now` y repositorios inyectados, cada prueba es determinista y no toca la red ni HTTP. El registry tipado convierte "agregar un filtro" en una operacion verificada por el compilador: si falta una entrada, no compila.

**Alternativas**

Analisis actual: un contenedor de inversion de control (por ejemplo, tsyringe o InversifyJS) daria resolucion automatica, pero agrega una dependencia y metaprogramacion por decoradores para un grafo de objetos que hoy es pequeno y plano. Pasar las dependencias como segundo argumento de `execute` evitaria las fabricas, a costa de repetir el argumento en cada llamada y de permitir que cambien entre pasos.

**Consecuencias**

- Beneficios: filtros puros respecto de su entorno; pruebas rapidas y deterministas; reemplazo del proveedor externo por un doble en una linea.
- Costos y desventajas: hay que construir el objeto de dependencias en cada punto de entrada; `FilterDependencies` tiende a crecer y todos los filtros lo reciben completo aunque usen una parte.
- Riesgos: una dependencia agregada al objeto obliga a actualizar los ayudantes de prueba.
- Trade-offs: algo de ceremonia a cambio de aislamiento.

**Evidencia**

- `src/pipeline/filter.ts`, `src/pipeline/registry.ts`, `tests/helpers/testDeps.ts`.

**ADR relacionado**

- [ADR-001 — Adoptar Pipes & Filters en proceso con contexto compartido](../adr/ADR-001-pipes-and-filters.md)

---

### DD-004 — Aislamiento de fallos en el orquestador y modelo de estados por reserva

**Estado de evidencia:** Confirmada

**Necesidad**

- RF relacionados: RF-01, RF-06.
- Atributos de calidad: QA-03 (robustez), QA-06 (observabilidad).
- Restricciones: RT-07; consigna "el pipeline debe ser robusto ante fallos individuales de filtros".

**Diseno adoptado y manifestacion en la vista**

`Pipeline.process` envuelve cada `filter.execute` en `try/catch`. Una excepcion se traduce en un `issue` con codigo `FILTER_EXCEPTION`, estado `failed` y una entrada de traza con `status: 'failed'`; los filtros siguientes se saltan para esa reserva. `processBatch` itera reserva por reserva, de modo que un fallo individual no afecta a las demas, y devuelve un `summary` con el recuento por estado. Los estados finales son `processed`, `processed_with_warnings`, `rejected` (error de negocio) y `failed` (error tecnico).

**Clasificacion**

- Patron: Error boundary por etapa; Circuit-breaker *no* aplicado (ver Riesgos).
- Tactica: contencion de fallos (`fault containment`), degradacion elegante, deteccion y registro de excepciones.
- Tecnologia: `try/catch` de JavaScript, `performance.now()` para medicion.

**Justificacion**

La consigna distingue explicitamente "datos corruptos en mitad del pipeline" y "filtro que lanza excepcion" como casos a soportar. Separar `rejected` de `failed` importa porque son problemas de naturaleza distinta: el primero es una respuesta valida del negocio y el segundo es un defecto del sistema; mezclarlos haria invisible la tasa de errores tecnicos.

**Alternativas**

Analisis actual: propagar la excepcion y devolver 500 para todo el lote seria mas simple, pero contradice la consigna y castiga a las reservas correctas. Reintentar el filtro que falla no tiene sentido para errores deterministas de datos, y el unico filtro con fallos transitorios (el de tipo de cambio) ya tiene su propia politica de reintentos.

**Consecuencias**

- Beneficios: el proceso nunca cae por un filtro defectuoso; el cliente recibe resultados parciales utiles y un motivo por reserva.
- Costos y desventajas: un defecto sistematico (por ejemplo, un filtro roto para todas las reservas) se reporta como 200 con N reservas `failed`, no como error del servicio; requiere que el consumidor mire `summary.failed`.
- Riesgos: si el fallo es un tercero degradado, procesar todo el lote igual multiplica la latencia. Mitigacion actual: timeout acotado y cache; un circuit breaker queda como **Propuesta**.
- Trade-offs: se prioriza completitud del lote sobre falla rapida.

**Evidencia**

- `src/pipeline/pipeline.ts`.
- `tests/pipeline/pipeline.test.ts` ("aisla la excepcion de un filtro", "procesa el lote completo aunque una reserva falle").

**ADR relacionado**

- [ADR-003 — Aislamiento de fallos por filtro y politica de continuidad](../adr/ADR-003-aislamiento-de-fallos.md)

---

### DD-005 — Distincion entre error de negocio (rechazo) y warning no bloqueante

**Estado de evidencia:** Confirmada

**Necesidad**

- RF relacionados: RF-02, RF-03, RF-05, RF-06.
- Atributos de calidad: QA-02, QA-03.
- Restricciones: RT-07.

**Diseno adoptado y manifestacion en la vista**

`rejectReservation` marca `aborted = true` y estado `rejected`: la usan los filtros de validacion y los chequeos de precondiciones de los filtros de precio. `addWarning` no altera el flujo: la usan los fallos de integracion, la falta de telefono y la ausencia de metadata de moneda. El orquestador respeta `aborted` salteando los filtros posteriores, salvo los marcados `runOnAborted`.

**Clasificacion**

- Patron: Notification; Guard clause.
- Tactica: degradacion elegante para disponibilidad.
- Tecnologia: TypeScript (`IssueSeverity`).

**Justificacion**

La consigna es explicita: pasajero inexistente o vuelo sin asientos deben rechazar la reserva, mientras que un fallo de la API de cambio debe continuar "con warnings y precios en USD". Sin esta distincion en el modelo, cualquier tratamiento uniforme violaria una de las dos reglas.

**Alternativas**

Analisis actual: una sola lista de errores con un flag `blocking` es equivalente en potencia expresiva, pero obliga a filtrar en cada consumidor; devolver HTTP 4xx por reserva rechazada es imposible en un lote con resultados mixtos.

**Consecuencias**

- Beneficios: contrato claro para el cliente (`errors` vs `warnings`); el codigo de cada filtro expresa la severidad en el punto de deteccion.
- Costos y desventajas: la clasificacion es una decision de diseno por caso y puede volverse inconsistente entre filtros sin una guia escrita.
- Riesgos: degradar a warning algo que el negocio considera bloqueante produciria reservas con precio incorrecto en silencio. Mitigacion: los warnings cambian el estado a `processed_with_warnings`, visible en el resumen.
- Trade-offs: mas matices en el contrato de salida a cambio de fidelidad al requerimiento.

**Evidencia**

- `src/domain/reservationContext.ts`, `src/pipeline/filters/validatePassenger.filter.ts`, `src/pipeline/filters/exchangeRateEnrichment.filter.ts`.
- `tests/api/reservations.routes.test.ts` ("continua en USD con warning cuando la API de tipo de cambio falla").

**ADR relacionado**

- [ADR-003 — Aislamiento de fallos por filtro y politica de continuidad](../adr/ADR-003-aislamiento-de-fallos.md)

---

### DD-006 — Puerto `ExchangeRateProvider` con adaptador HTTP concreto

**Estado de evidencia:** Confirmada

**Necesidad**

- RF relacionados: RF-05.
- Atributos de calidad: QA-04 (testabilidad), QA-02 (disponibilidad), QA-01 (modificabilidad).
- Restricciones: RT-04 (proveedor gratuito sin API key), RO-03.

**Diseno adoptado y manifestacion en la vista**

El filtro de enriquecimiento depende de la interfaz `ExchangeRateProvider` (`getRate`, `invalidateCache`). `ExchangeRateApiClient` la implementa sobre `fetch` nativo y recibe `settings`, `cache`, `logger`, `fetchFn` y `sleep` por constructor. La aplicacion puede inyectar otro proveedor completo (`exchangeRateProvider`) o solo otro transporte (`fetchFn`).

**Clasificacion**

- Patron: Adapter / Ports & Adapters (hexagonal) aplicado localmente a una integracion.
- Tactica: intermediario para reducir acoplamiento; sustitucion de dependencias para pruebas.
- Tecnologia: `fetch` y `AbortController` nativos de Node 20+ (sin axios ni node-fetch).

**Justificacion**

La consigna ofrece cuatro proveedores posibles y aclara que la API es externa y puede fallar; el punto de variacion es evidente. Con el puerto, cambiar de ExchangeRate-API a Fixer implica una clase nueva y ninguna modificacion del pipeline. Ademas, las 58 pruebas corren sin red porque el doble se inyecta en la frontera correcta.

**Alternativas**

Analisis actual: llamar `fetch` directamente en el filtro seria mas corto pero volveria al filtro no testeable sin interceptar HTTP global; usar una libreria cliente (axios) agregaria dependencia y no aporta nada que `fetch` + `AbortController` no cubran para un GET.

**Consecuencias**

- Beneficios: integracion sustituible; pruebas sin red; el pipeline ignora los detalles de HTTP.
- Costos y desventajas: una interfaz extra para un unico implementador real.
- Riesgos: la interfaz expone `invalidateCache`, lo que filtra un detalle de implementacion (que hay cache) al puerto. Aceptado porque RT-05 exige invalidacion manual como requerimiento, no como detalle.
- Trade-offs: indireccion a cambio de aislamiento del cambio y de la prueba.

**Evidencia**

- `src/services/exchangeRate/exchangeRateProvider.ts`, `src/services/exchangeRate/exchangeRateApiClient.ts`.
- `tests/helpers/testDeps.ts` (dobles `stubRateProvider` y `failingRateProvider`).

**ADR relacionado**

- [ADR-004 — Integracion resiliente con la API de tipo de cambio](../adr/ADR-004-integracion-tipo-de-cambio.md)

---

### DD-007 — Timeout, reintentos, cache con TTL y tasas de respaldo en el cliente de tasas

**Estado de evidencia:** Confirmada

**Necesidad**

- RF relacionados: RF-05.
- Atributos de calidad: QA-02 (disponibilidad), QA-05 (rendimiento).
- Restricciones: RT-04, RT-05, RT-07.

**Diseno adoptado y manifestacion en la vista**

`ExchangeRateApiClient.getRate` resuelve en este orden: moneda base igual a destino (`identity`, sin red) → cache vigente (`cache`) → llamada HTTP con `AbortController` y timeout de 5 s, hasta 3 intentos con backoff lineal (`api`) → tasa de respaldo configurada (`fallback`) → excepcion `ExchangeRateUnavailableError` si no hay respaldo. La respuesta de la API se cachea completa por moneda base, de modo que una llamada cubre todas las monedas destino durante la hora siguiente. El origen de la tasa viaja al cliente en `currency.rateSource`.

**Clasificacion**

- Patron: Retry, Cache-aside, Fallback / graceful degradation.
- Tactica: timeout para deteccion de fallos; reintento para fallos transitorios; cache para reducir carga y latencia; valor por defecto para disponibilidad.
- Tecnologia: `AbortController`, `Map` en memoria.

**Justificacion**

RT-05 fija los parametros. La cuota mensual del proveedor (RT-04) hace que la cache no sea solo una optimizacion, sino una condicion de viabilidad: un lote de 50 reservas al mismo destino consume una sola llamada. Exponer `rateSource` permite al consumidor saber si el precio se calculo con una cotizacion real o con un valor de respaldo, que es informacion de negocio, no de infraestructura.

**Alternativas**

Analisis actual: sin cache, el sistema agotaria la cuota y multiplicaria la latencia del lote; sin fallback, un proveedor caido dejaria reservas sin convertir y violaria RT-07; con reintentos sin timeout, una conexion colgada bloquearia el lote indefinidamente. Un circuit breaker seria el siguiente paso natural si se observara degradacion sostenida: queda **Propuesta**.

**Consecuencias**

- Beneficios: el procesamiento nunca depende de la disponibilidad del tercero; latencia acotada; consumo de cuota minimo.
- Costos y desventajas: las tasas de respaldo estan cableadas en la configuracion y envejecen, por lo que un fallback prolongado produce precios convertidos inexactos; la cache puede servir tasas de hasta una hora de antiguedad.
- Riesgos: en el peor caso (proveedor colgado), el costo por moneda base es `timeout x intentos` ≈ 15 s. Medicion real observada en ejecucion manual con host inalcanzable: ~1 s con `timeoutMs: 400` y 2 intentos. Presupuesto aceptable de latencia por lote: `Pendiente de validacion`.
- Trade-offs: se acepta precision de la cotizacion a cambio de disponibilidad y previsibilidad.

**Evidencia**

- `src/services/exchangeRate/exchangeRateApiClient.ts`, `src/services/exchangeRate/ratesCache.ts`, `DEFAULT_PIPELINE_CONFIG.exchangeRate`.
- `tests/services/exchangeRateApiClient.test.ts` (10 casos: api, cache, TTL vencido, invalidacion, reintentos, fallback, HTTP 503, timeout abortado, sin respaldo, identidad).
- Verificacion manual contra el proveedor real: primera llamada `rateSource: "api"` en ~1040 ms; segunda `rateSource: "cache"` en ~0.4 ms.

**ADR relacionado**

- [ADR-004 — Integracion resiliente con la API de tipo de cambio](../adr/ADR-004-integracion-tipo-de-cambio.md)

---

### DD-008 — Reglas de negocio y topologia del pipeline como configuracion mutable en memoria

**Estado de evidencia:** Confirmada

**Necesidad**

- RF relacionados: RF-04, RF-08.
- Atributos de calidad: QA-07 (configurabilidad), QA-01 (modificabilidad).
- Restricciones: RO-02 (sin infraestructura), consigna "es posible configurar que filtros estan habilitados/deshabilitados".

**Diseno adoptado y manifestacion en la vista**

`PipelineConfig` contiene `filterOrder`, `enabledFilters`, multiplicadores de clase, porcentajes de lealtad y de tipo de pasajero, impuestos y los parametros de la integracion. `PipelineConfigStore` guarda una copia profunda, devuelve clones en `get()` y aplica parches parciales en `update()`. `POST /reservations/process` acepta un `config` que se aplica **solo a ese request**, construyendo un store efimero sobre la configuracion global.

**Clasificacion**

- Patron: Configuration object / External configuration; Copy-on-read para evitar aliasing.
- Tactica: parametrizacion en tiempo de ejecucion (binding tardio) para modificabilidad.
- Tecnologia: objeto en memoria, validado con zod en la frontera HTTP.

**Justificacion**

Los porcentajes de la consigna son exactamente el tipo de regla que cambia sin aviso. Tenerlos como datos permite que un operador ajuste un descuento con un `PUT`, y permite que las pruebas verifiquen que los filtros leen la configuracion y no constantes embebidas. Los overrides por request, ademas, hacen reproducibles los escenarios de error (por ejemplo, apuntar la integracion a un host inalcanzable) sin ensuciar el estado global.

**Alternativas**

Analisis actual: variables de entorno o un archivo JSON serian suficientes para parametrizar, pero exigirian reinicio y no cubren RF-08; una base de datos de configuracion daria persistencia y auditoria, fuera del alcance (RO-02).

**Consecuencias**

- Beneficios: cambio de reglas sin redeploy; escenarios de prueba reproducibles; los filtros quedan libres de constantes.
- Costos y desventajas: la configuracion se pierde al reiniciar y no se comparte entre instancias; no hay historial de cambios.
- Riesgos: **sin autenticacion, cualquiera con acceso a la red puede alterar precios** (QA-08, Propuesta). Un `filterOrder` mal armado (por ejemplo, sin `basePrice`) degrada los resultados; mitigado porque los filtros posteriores rechazan con `PRICING_NOT_INITIALIZED` en lugar de calcular mal.
- Trade-offs: flexibilidad operativa a cambio de superficie de riesgo y de estado no durable.

**Evidencia**

- `src/config/pipelineConfig.ts`, `src/api/pipeline.routes.ts`.
- `tests/api/pipeline.routes.test.ts` (parche parcial, reordenamiento, rechazo de config invalida, reset); `tests/filters/pricing.filters.test.ts` ("usa los porcentajes de la configuracion, no constantes embebidas").

**ADR relacionado**

- [ADR-005 — Configuracion del pipeline mutable en memoria](../adr/ADR-005-configuracion-mutable.md)

---

### DD-009 — Validacion del contrato en la frontera HTTP con esquemas estrictos

**Estado de evidencia:** Confirmada

**Necesidad**

- RF relacionados: RF-01, RF-08.
- Atributos de calidad: QA-03 (robustez), QA-06 (diagnostico util).
- Restricciones: consigna, caso de prueba "reserva con datos malformados".

**Diseno adoptado y manifestacion en la vista**

`src/api/schemas.ts` define esquemas zod `.strict()` para el cuerpo de `POST /reservations/process` y para el parche de configuracion. Los errores se traducen a `400` con `code` (`INVALID_REQUEST` / `INVALID_CONFIG`) y un detalle `path` + `message` por campo. El JSON malformado se captura en el manejador de errores como `MALFORMED_JSON`. El pipeline, por lo tanto, nunca recibe datos de forma desconocida desde HTTP.

**Clasificacion**

- Patron: Schema validation en la frontera; Data Transfer Object.
- Tactica: validacion de entrada para prevenir fallos; frontera de errores.
- Tecnologia: zod 4 y `express.json()`.

**Justificacion**

Separar "payload invalido" (400, culpa del cliente) de "reserva rechazada por el negocio" (200 con `errors`) es necesario para que el cliente sepa si debe corregir el request o informar al usuario. Validar en un solo lugar evita chequeos defensivos repetidos en ocho filtros y hace que los tipos del dominio sean confiables aguas abajo.

**Alternativas**

Analisis actual: validacion manual con `typeof` evitaria la dependencia, a costa de mensajes pobres y codigo repetitivo; validar dentro de cada filtro duplicaria reglas y mezclaria responsabilidades; usar `class-validator` requeriria decoradores y clases en lugar de tipos estructurales.

**Consecuencias**

- Beneficios: errores accionables por campo; tipos de dominio garantizados; una sola dependencia en runtime ademas de Express.
- Costos y desventajas: el esquema duplica la forma de los tipos del dominio y hay que mantener ambos sincronizados.
- Riesgos: `.strict()` rechaza campos desconocidos, lo que rompe clientes que envien extras. Aceptado deliberadamente: detecta typos de configuracion temprano.
- Trade-offs: rigidez del contrato a cambio de deteccion temprana.

**Evidencia**

- `src/api/schemas.ts`, `src/api/errorHandler.ts`.
- `tests/api/reservations.routes.test.ts` ("devuelve 400 con detalle cuando el payload esta malformado", "devuelve 400 cuando el cuerpo no es JSON valido").

**ADR relacionado**

- [ADR-003 — Aislamiento de fallos por filtro y politica de continuidad](../adr/ADR-003-aislamiento-de-fallos.md)

---

### DD-010 — Datos mock en memoria detras de repositorios indexados

**Estado de evidencia:** Confirmada

**Necesidad**

- RF relacionados: RF-02, RF-03.
- Atributos de calidad: QA-04 (testabilidad).
- Restricciones: RT-03, RO-04.

**Diseno adoptado y manifestacion en la vista**

`src/data/mockPassengers.ts` y `src/data/mockFlights.ts` declaran los datos; `passengerRepository` y `flightRepository` exponen `findById` / `findByCode` sobre un `Map` construido al cargar el modulo. Las fechas de salida se calculan relativas al arranque (`daysFromNow`), y hay un vuelo con fecha pasada, uno sin asientos y uno con asientos escasos.

**Clasificacion**

- Patron: Repository.
- Tactica: indireccion para sustituir la fuente de datos; datos de prueba disenados por escenario.
- Tecnologia: modulos TypeScript, `Map`.

**Justificacion**

La consigna pide datos mock en archivos separados, cargados al inicio y faciles de modificar. Interponer un repositorio permite que los filtros no sepan si los datos vienen de un array o de una base, que es la unica forma de que la migracion futura a persistencia real no toque los filtros. Calcular las fechas de forma relativa evita que las pruebas de "fecha futura" caduquen con el paso del tiempo, que es un defecto clasico de los datos de prueba fijos.

**Alternativas**

Analisis actual: importar los arrays directamente en cada filtro seria mas corto y acoplaria los filtros al formato de los datos; usar SQLite en memoria daria semantica de base real (consultas, indices) a costa de asincronia y de una dependencia que el ejercicio no pide.

**Consecuencias**

- Beneficios: busquedas O(1); filtros independientes de la fuente; escenarios de prueba cubiertos por construccion.
- Costos y desventajas: la interfaz es sincronica, por lo que migrar a una base real obligaria a volverla asincronica y a propagar `await` (los filtros ya son `async`, lo que reduce el impacto).
- Riesgos: el sistema no decrementa `availableSeats`, por lo que no hay control de concurrencia ni reserva efectiva. Explicitamente fuera de alcance.
- Trade-offs: simplicidad hoy contra un cambio de interfaz manana.

**Evidencia**

- `src/data/mockPassengers.ts`, `src/data/mockFlights.ts`, `src/repositories/`.
- `tests/filters/validateFlight.filter.test.ts` (casos de asientos, ruta y fecha).

**ADR relacionado**

- [ADR-006 — Datos mock y estado de procesamiento en memoria](../adr/ADR-006-estado-en-memoria.md)

---

### DD-011 — Separacion del filtro de tipo de cambio en enriquecimiento y conversion

**Estado de evidencia:** Confirmada

**Necesidad**

- RF relacionados: RF-04, RF-05.
- Atributos de calidad: QA-02, QA-05.
- Restricciones: RT-06 (precios base en USD), orden de filtros de la consigna.

**Diseno adoptado y manifestacion en la vista**

La consigna ubica el filtro de tipo de cambio en la posicion 3, antes del calculo del precio base (posicion 4). Convertir un precio que todavia no fue calculado es imposible. La responsabilidad se dividio en dos filtros: `exchangeRateEnrichment` conserva la posicion 3 y realiza la unica llamada externa (deteccion de moneda de destino, obtencion y cacheo de la tasa, metadata en el contexto); `currencyConversion` se ejecuta al cierre y aplica esa tasa sobre `totalUsd`, sin volver a llamar a la API.

**Clasificacion**

- Patron: Content Enricher seguido de Translator (vocabulario de patrones de integracion).
- Tactica: separacion de responsabilidades; mantener el punto de I/O en una sola etapa.
- Tecnologia: TypeScript.

**Justificacion**

Se preservan dos propiedades a la vez: la llamada externa ocurre donde la consigna la ubica (util si el orden expresa una intencion de negocio, por ejemplo fallar temprano si el tercero es indispensable), y el resultado es aritmeticamente correcto porque la conversion se aplica a un total existente. Ademas, deja un solo lugar con I/O remoto, lo que concentra las tacticas de disponibilidad.

**Alternativas**

Analisis actual: (a) mover el filtro unico al final del pipeline — mas simple, un filtro menos, pero se aparta del orden enunciado; (b) mantener el filtro en la posicion 3 convirtiendo el `basePriceUsd` del vuelo — coherente con el enunciado, pero dejaria la conversion desactualizada respecto del total final, que es el numero que el cliente paga.

**Consecuencias**

- Beneficios: correccion aritmetica sin contradecir el orden de la consigna; conversion desacoplada de la integracion; `currencyConversion` se puede deshabilitar sin perder la metadata de la tasa.
- Costos y desventajas: ocho filtros en lugar de siete; hay un acoplamiento por datos entre ambos (`context.currency`).
- Riesgos: si se deshabilita solo `exchangeRateEnrichment`, la conversion no tiene tasa. Mitigado: `currencyConversion` emite el warning `CURRENCY_METADATA_MISSING` y mantiene el total en USD.
- Trade-offs: un filtro adicional a cambio de correccion y de fidelidad al orden pedido.

**Evidencia**

- `src/pipeline/filters/exchangeRateEnrichment.filter.ts`, `src/pipeline/filters/currencyConversion.filter.ts`, `DEFAULT_PIPELINE_CONFIG.filterOrder`.
- `tests/filters/exchangeRate.filters.test.ts` ("mantiene el total en USD con un warning si falta la metadata de moneda").

**ADR relacionado**

- [ADR-007 — Orden del pipeline y separacion del filtro de tipo de cambio](../adr/ADR-007-orden-pipeline-tipo-de-cambio.md)

---

### DD-012 — Traza de ejecucion por filtro y logging estructurado

**Estado de evidencia:** Confirmada

**Necesidad**

- RF relacionados: RF-06, RF-07.
- Atributos de calidad: QA-06 (observabilidad).
- Restricciones: consigna ("tiempo total de procesamiento", "logging de errores de integracion").

**Diseno adoptado y manifestacion en la vista**

Cada paso agrega a `context.trace` una entrada con `filter`, `status` (`executed` | `skipped` | `disabled` | `failed`), `durationMs` y un `detail` opcional. El lote reporta `processingTimeMs`. El logger emite JSON por linea con nivel configurable (`LOG_LEVEL`), y se silencia en pruebas. `ProcessingStore` retiene el ultimo resultado por reserva para `GET /reservations/:id/status`.

**Clasificacion**

- Patron: Execution log / Audit trail.
- Tactica: registro de actividad y de fallos para observabilidad.
- Tecnologia: `performance.now()`, `console` con JSON estructurado.

**Justificacion**

En un pipeline configurable, "el precio salio distinto" solo se puede explicar sabiendo que filtros corrieron. La traza convierte esa pregunta en un dato de la respuesta, y `durationMs` por filtro identifica de inmediato cual etapa domina la latencia (en la verificacion manual, `exchangeRateEnrichment` explico 1040 ms de 1042 ms totales en la primera llamada).

**Alternativas**

Analisis actual: un logger de libreria (pino, winston) daria transporte, rotacion y niveles maduros; se omitio para no agregar dependencias en un ejercicio sin infraestructura de logs. OpenTelemetry seria el camino correcto para un entorno real y queda **Propuesta**.

**Consecuencias**

- Beneficios: diagnostico autoexplicativo por reserva; medicion por etapa sin herramientas externas.
- Costos y desventajas: la traza agranda la respuesta proporcionalmente a la cantidad de filtros; `console` no es adecuado para produccion.
- Riesgos: si un filtro futuro incluyera datos personales en `detail`, quedarian expuestos en la respuesta y en los logs.
- Trade-offs: verbosidad de la respuesta a cambio de trazabilidad.

**Evidencia**

- `src/pipeline/pipeline.ts`, `src/support/logger.ts`, `src/store/processingStore.ts`.
- `tests/api/reservations.routes.test.ts` (la traza tiene 8 entradas; filtro deshabilitado marcado como `disabled`).

**ADR relacionado**

- [ADR-006 — Datos mock y estado de procesamiento en memoria](../adr/ADR-006-estado-en-memoria.md)

---

## Matriz de trazabilidad

| RF | Atributo o restriccion | Decision | Patron o tactica | ADR | Evidencia |
|---|---|---|---|---|---|
| RF-01 | QA-01, RT-02 | DD-001 | Pipes & Filters / interfaz uniforme | ADR-001 | `src/pipeline/pipeline.ts`; `tests/pipeline/pipeline.test.ts` |
| RF-01, RF-06 | QA-03 | DD-004 | Error boundary / contencion de fallos | ADR-003 | `src/pipeline/pipeline.ts`; prueba "aisla la excepcion de un filtro" |
| RF-06 | QA-06 | DD-002 | Context object / Notification | ADR-002 | `src/domain/reservationContext.ts` |
| RF-06, RF-07 | QA-06 | DD-012 | Execution log | ADR-006 | `FilterTrace` en respuestas; `src/support/logger.ts` |
| RF-02 | RT-08, QA-04 | DD-003, DD-005 | Guard clause / DI | ADR-001, ADR-003 | `validatePassenger.filter.ts`; `tests/filters/validatePassenger.filter.test.ts` |
| RF-03 | RT-03, QA-04 | DD-003, DD-010 | Repository / DI del reloj | ADR-006 | `validateFlight.filter.ts`; `tests/filters/validateFlight.filter.test.ts` |
| RF-04 | QA-01, QA-07 | DD-008 | Configuration object / binding tardio | ADR-005 | `pipelineConfig.ts`; `tests/filters/pricing.filters.test.ts` |
| RF-05 | QA-02, RT-04, RT-05, RT-07 | DD-006, DD-007 | Adapter, Retry, Cache-aside, Fallback | ADR-004 | `exchangeRateApiClient.ts`; `tests/services/exchangeRateApiClient.test.ts` |
| RF-04, RF-05 | RT-06 | DD-011 | Content Enricher + Translator | ADR-007 | `exchangeRateEnrichment.filter.ts`, `currencyConversion.filter.ts` |
| RF-07 | RO-02 | DD-010, DD-012 | Repository en memoria | ADR-006 | `src/store/processingStore.ts`; pruebas de `GET /:id/status` |
| RF-08 | QA-07, QA-08 | DD-008, DD-009 | External configuration + Schema validation | ADR-005 | `src/api/pipeline.routes.ts`, `src/api/schemas.ts` |
| RF-01, RF-08 | QA-03 | DD-009 | Validacion en la frontera | ADR-003 | `src/api/schemas.ts`; pruebas de 400 |

No hay filas huerfanas: cada decision referencia al menos un RF, un atributo o restriccion, un ADR y evidencia verificable del repositorio.

---

## Preguntas y datos pendientes

| Dato faltante | Responsable | Efecto sobre el analisis |
|---|---|---|
| Presupuesto de latencia por lote y tamano maximo esperado de lote | Product owner del curso | Sin el, QA-05 no tiene medida verificable; hoy el limite es un tope arbitrario de 200 reservas por request (`Pendiente de validacion`) |
| Volumen de reservas por hora y por destino | Product owner | Determina si la cuota mensual del proveedor gratuito alcanza y si hace falta un circuit breaker |
| Politica de antiguedad aceptable de una cotizacion | Area comercial | El TTL de 1 hora y las tasas de respaldo se tomaron de la consigna, sin validacion de negocio |
| Quien puede modificar la configuracion del pipeline | Area de seguridad / catedra | QA-08 queda como Propuesta; hoy el endpoint es abierto |
| Se debe reservar efectivamente el asiento (decrementar `availableSeats`) | Product owner | Definiria la necesidad de transacciones y control de concurrencia, hoy fuera de alcance |
| Origen historico de los porcentajes de descuento e impuestos | Catedra | Se implementaron tal como los enuncia la consigna; no hay evidencia de su justificacion de negocio |
