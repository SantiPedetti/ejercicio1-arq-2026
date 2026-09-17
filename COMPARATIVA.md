# COMPARATIVA — `main` vs `version/claude-antigravity`

- **`main`** (`bede58d`): implementación generada a partir de un plan externo (agente `devin-local`), sin revisión adversarial.
- **`version/claude-antigravity`**: misma base, ajustada en 7 fases contra el plan revisado (`docs/plan/PLAN.md` v7, aprobado por Antigravity tras 5 rondas de revisión; `docs/plan/PLAN-REVIEW-LOG.md` registra los 25 hallazgos).
- **Alcance del diff:** 111 archivos (51 nuevos, 49 modificados, 11 borrados); los tests pasan de 9 a 30 archivos.

No se reescribió desde cero: la base ya traía el pipeline de 8 filtros, la inyección de dependencias y el sobre `{ reservations, config }`. Lo que sigue es lo que cambió y por qué.

## 1. Defectos de comportamiento

| # | En `main` | En la rama | Por qué |
|---|---|---|---|
| 1.1 | El recargo de combustible (8%) se calcula sobre la tarifa base del vuelo | Se calcula sobre el precio de la clase | Decisión Q2 del plan. Con la fórmula de `main`, el caso "niño en business" da 398.00 en lugar de los 422.00 esperados. |
| 1.2 | Una reserva malformada devuelve 400 para todo el lote | Cada reserva se valida por separado: la inválida queda `REJECTED` con `INVALID_RESERVATION` y el lote sigue | La consigna pide procesar un lote y reportar errores por reserva; un dato malo de un pasajero no puede tumbar a los otros 99. |
| 1.3 | Si falla la API de tipo de cambio, se usan tasas fijas de respaldo (`fallbackRates`) | Se usa la última tasa cacheada aunque esté vencida (`STALE_RATE`) y, si no hay, la reserva sigue en USD con `EXCHANGE_RATE_UNAVAILABLE` | La consigna dice "si falla, el procesamiento continúa con warnings y precios en USD". Una tasa inventada mostraría un precio en ARS que nadie cobró. |
| 1.4 | Deshabilitar el filtro de precio base rechaza la reserva | El source deja precios neutros, así que cualquier filtro se puede apagar sin romper el cálculo | La consigna exige poder habilitar/deshabilitar filtros; en `main` esa configuración producía `NaN` o rechazo. |
| 1.5 | El orden de los filtros se puede cambiar por `PUT /pipeline/config` | Orden fijo; `filterOrder` en el PUT devuelve 400 | Un orden arbitrario permite calcular impuestos antes que el precio. El beneficio no compensa el modo de fallo. |
| 1.6 | Una request puede cambiar timeout, reintentos y TTL de caché del proveedor compartido | Esos parámetros solo se cambian con `PUT`; el resto sí se puede sobreescribir por request | Dos lotes concurrentes con distinta configuración se pisaban sobre el mismo singleton. |
| 1.7 | `PUT /pipeline/config` permite cambiar la URL de la API externa | La URL sale solo del entorno (`EXCHANGE_API_BASE_URL`) | Cambiar por HTTP a dónde sale el servidor es una puerta abierta; es configuración de infraestructura, no de negocio. |
| 1.8 | Un JSON mal formado de la API se reintenta | Se corta con `INVALID_RESPONSE` sin reintentar | Reintentar solo tiene sentido ante fallas transitorias (red, timeout, 5xx, 429). |
| 1.9 | Sin límite en el almacén de resultados | Acotado a 1000 entradas (FIFO) | Un proceso de larga vida crecía sin techo. |
| 1.10 | `x-correlation-id` inexistente | Generado por request y validado si lo manda el cliente | Trazabilidad por reserva en los logs, sin permitir inyectar texto arbitrario. |

## 2. Contrato y datos

| En `main` | En la rama | Por qué |
|---|---|---|
| La reserva no trae fecha de vuelo ni tipo de pasajero | Trae `departureDate` y `passengerType` declarado | Sin fecha no se puede validar "fecha futura" ni calcular la edad al viajar; sin tipo declarado, el requisito "confirmar edad vs tipo de pasajero" no tiene contra qué comparar. |
| El pasajero mock tiene `age` fija | Tiene `birthDate`; la edad se calcula a la fecha del vuelo | Una edad fija no envejece y hace imposible probar los bordes 11/12 y 65/66. |
| Los vuelos mock usan `Date.now()` | Se construyen con un reloj inyectable | Con fechas relativas al reloj real, los tests pasaban o fallaban según el día. |
| El vuelo no expone el país | `originCountry` y `destinationCountry` | El filtro de tipo de cambio necesita el país para deducir la moneda; con solo códigos IATA, todo caía en `UNKNOWN_CURRENCY`. |
| Campo `seats` que multiplica el precio | Eliminado | No está en la consigna. |
| Estados `processed` / `processed_with_warnings` | `PENDING`, `PROCESSING`, `CONFIRMED`, `REJECTED`, `FAILED` | Los warnings no cambian el resultado de una reserva: sigue confirmada. |

## 3. Diseño del pipeline

| En `main` | En la rama | Por qué |
|---|---|---|
| Los filtros mutan el contexto que reciben | Devuelven un contexto nuevo | Un filtro que escribe sobre el objeto compartido rompe el aislamiento del patrón y hace difícil razonar sobre fallas a mitad de camino. |
| Sin verificación entre filtros | `context-guard` tras cada filtro: montos finitos y ≥ 0, y precio de clase presente tras `basePrice`; si no, `DATA_CORRUPTED` | Es el caso "datos corruptos en mitad del pipeline" que pide la consigna. |
| Todos los fallos se tratan igual | Cada filtro declara su criticidad: los de validación y precio cortan la reserva; tipo de cambio y conversión solo agregan warning | La consigna separa "la API externa puede fallar y se sigue" de "el pasajero no existe". |
| El redondeo ocurre dentro de cada filtro | Solo al final, en el sink | Redondear en cada paso acumula diferencias de centavos. |
| Cada lote lee la configuración viva | Toma una copia fija al empezar | Un `PUT` a mitad de un lote cambiaba las reglas de precio entre una reserva y la siguiente. |
| Una sola llamada por reserva a la API | Caché con TTL y *single-flight* | Un lote de 100 reservas disparaba 100 llamadas a la API externa. |

## 4. Herramientas y verificación

| En `main` | En la rama | Por qué |
|---|---|---|
| `npm test` (Jest), sin umbral | `npm run verify` = tipos + lint + tests con cobertura mínima de 80% | Un solo comando que prueba el trabajo. Hoy: 179 tests, 96% de líneas y 82% de ramas. |
| Sin linter | ESLint estricto, funciones de hasta 15 líneas en `src/` | Recomendación de la cátedra (clase del 10/09). |
| Logger propio con `console` | Pino, con un log por filtro (`filter`, `status`, `durationMs`, `correlationId`) | Observabilidad estructurada, también vista en clase. |
| Sin variables de entorno | `src/config/env.ts` con Zod y *fail-fast*, más `.env.example` | La app no arranca con configuración inválida, en lugar de fallar en la primera request. |
| Rangos de versiones (`^`) | Versiones exactas y `.npmrc` con `save-exact` | Entrega reproducible. |
| 9 archivos de test | 30, con los 16 casos de la consigna mapeados 1:1 y los 7 escenarios de calidad | Los tests son la evidencia de la consigna; además, un `fetch` global falso hace fallar cualquier test que intente salir a la red. |

## 5. Documentación

| En `main` | En la rama | Por qué |
|---|---|---|
| `architecture.md` con estructura propia | Estructura del SADP 2.0 de la cátedra: RF/AC/RS, vistas, catálogo, interfaces, variabilidad y anexos A–D | Es el formato que se evalúa. |
| 5 escenarios de calidad sin medida, en archivos sueltos | 7 escenarios con las 6 partes de Bass y una medida numérica cada uno, dentro del documento, con su test en la suite | Un escenario sin medida no se puede verificar. |
| 7 ADR, uno de ellos "contexto mutable" | 8 ADR con la plantilla en español (decisión, justificación, alternativas rechazadas, estado, consecuencias negativas) | Alinea con el material de la cátedra y con el diseño que quedó. |
| Sin matriz de trazabilidad ni sección de uso de IA | Ambas presentes | La trazabilidad evita requerimientos sin test; la declaración de uso de IA es obligatoria en cada entrega. |
| Sin diagramas propios | 9 diagramas Mermaid más el esquema interactivo `docs/architecture/archify-arquitectura.html` | Las reglas de la cátedra piden diagramas con leyenda y distinción de llamadas locales y remotas. |
| Colección de Postman con el contrato viejo | Actualizada: 6 endpoints y los 16 casos de la consigna con su response guardada | Es uno de los entregables. |

## 6. Lo que se mantuvo de `main`

- El patrón: 8 filtros, orquestador, inyección de dependencias por filtro.
- La separación entre el filtro 3 (obtiene la tasa) y el filtro 8 (convierte), que venía del plan externo y resultó mejor que dejar la conversión en el paso final.
- `ts-jest` y `tsx` en lugar de babel-jest, y los enums en minúscula: desvíos aceptados por el usuario, sin efecto sobre el diseño.
- `POST /pipeline/config/reset`: no lo pide la consigna, pero es útil y no molesta.

Un desvío se revirtió: el lote volvió a procesarse en paralelo (`Promise.all`). En secuencia, cada reserva abría su propia tanda de reintentos contra la API y no se cumplía el escenario AC 1 (máximo 3 intentos por lote).
