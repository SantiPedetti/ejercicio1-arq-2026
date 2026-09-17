# Arquitectura — Reglas a seguir para diseñar y documentar

Guía de referencia de FI-3851 Arquitectura de Software (Universidad ORT Uruguay, 2026-2). Reúne las reglas de la documentación de la cátedra para aplicarlas en los ejercicios de Tecnología, el Obligatorio y el parcial.

## Fuentes

| Código | Documento | Qué aporta |
|---|---|---|
| **[SADP]** | `Template_SADP_2_0.docx` ("Documento resumido — Descripción de arquitectura") | Estructura obligatoria del documento de arquitectura. Reemplaza a `Template_SADP_1_7.docx` (ver §3.3). |
| **[ADR]** | `ADR-Template_repo.txt` → [github.com/pmerson/ADR-template](https://github.com/pmerson/ADR-template) | Plantilla y pautas de uso de los ADR. |
| **[VIEW]** | `ADR-View-Template_repo.txt` → [github.com/pmerson/architecture-view-template](https://github.com/pmerson/architecture-view-template) | Plantilla de vista y *Seven tips for design diagrams*. |
| **[TS]** | `TS-4619.pdf`: P. Merson (SEI), *How to Represent the Architecture of Your Enterprise Application Using UML 2.0 and More* | Vistas múltiples, cómo documentar una vista y contenido del documento de arquitectura. |
| **[IA]** | `Condiciones de uso de IA en Obligatorios.pdf` | Reglas obligatorias de uso de IA y de la defensa. |
| **[CLASE]** | Resúmenes de clase (`Clases/Analisis_Antigravity/`) y guía del RAT 1 (Bass, *SAP* 4.ª ed., caps. 1, 3 y 22) | Criterios que se remarcaron en clase. Son resúmenes generados con IA: ante una duda, manda el material oficial. |

---

## 1. Reglas de oro

1. **Documentar en múltiples vistas, no en un solo diagrama.** Como mínimo hay que pensar en las vistas de módulos, las de componentes y conectores (C&C, en ejecución), las de asignación o despliegue y el modelo de datos, si hay persistencia. [TS p.12, p.55]
2. **Seguir una plantilla**: el SADP 2.0 para el documento, la plantilla de vista de Merson para cada vista y la plantilla de ADR para cada decisión. [TS p.55; SADP; VIEW; ADR]
3. **La documentación no debe apelar a la intuición del lector.** Todo diagrama lleva **leyenda de notación**, incluidos los colores y el significado de cada tipo de línea. [TS p.42, p.55; VIEW tip 1]
4. **Registrar el porqué.** Cada decisión significativa tiene su justificación y las alternativas que se descartaron ("Why is more important than how"). [ADR; TS p.45, p.51]
5. **Decir explícitamente qué patrones se usan** (en el nombre de la vista, en el diagrama o en el texto). Así el lector entiende la solución, sus beneficios, sus restricciones y sus trade-offs. [VIEW tip 4; TS p.54; CLASE RAT §3.1]
6. **No hay arquitectura perfecta, solo trade-offs.** Cada decisión se justifica en función de los atributos de calidad que favorece y de los que penaliza. [CLASE 18/08, 10/09]
7. **Documentar una vista solo si le aporta valor** al equipo o a otros interesados. [VIEW README]
8. **Mantener los diagramas actualizados o eliminarlos**; un diagrama desactualizado que se deja igual es la peor opción. [VIEW tip 6]
9. **UML no siempre es la mejor notación.** Se puede usar notación informal, pero siempre con leyenda. [TS p.55]
10. **En la defensa se evalúa que se entienda el porqué de cada componente y táctica**, no que el código compile. [CLASE 27/08; IA 4]

---

## 2. Requerimientos que guían la arquitectura (*drivers*)

### 2.1 Los tres tipos [TS p.48; CLASE RAT §2.1]

| Tipo | Qué es | ID en el SADP | Ejemplo |
|---|---|---|---|
| Funcional | Lo **que** hace el sistema (casos de uso) | `RF n` | RF 2 Comprar: permite… (actor UsuarioWEB) |
| Atributo de calidad | **Cómo** se comporta (rendimiento, disponibilidad, modificabilidad…) | `AC n` | AC 1 Usabilidad: debido a la carga de datos es fundamental que… |
| Restricción | Decisión impuesta (tecnología, plataforma, plazos, costo) | `RS n` | RS 1 Plataforma Windows: el sistema debe implementarse en… |

- En el documento se incluyen **solo los requerimientos significativos para la arquitectura**: los de mayor impacto en el diseño, sin copiar el SRS entero. También cuentan los **organizacionales** (tiempos, costo). [SADP §2.2]
- **La funcionalidad y los atributos de calidad son ortogonales.** Lo que determina la estructura son los atributos de calidad y las restricciones, no las funciones. [CLASE RAT §2.2; CLASE 01/09]
- Hay que tener una **lista priorizada** de atributos de calidad. [CLASE RAT §1.6]

### 2.2 Escenarios de atributos de calidad [CLASE RAT §2.3–2.4; CLASE 08/09]

- Prohibido especificar con "-ilidades" vagas ("el sistema será altamente disponible"). Todo atributo se traduce a un **escenario medible**.
- En la bibliografía de Bass, los atributos se especifican con escenarios de calidad, no con *fitness functions* (ese concepto es de otro libro, *Building Evolutionary Architectures*).
- Cada escenario tiene **exactamente 6 partes**:

| # | Parte | Pregunta que responde |
|---|---|---|
| 1 | Fuente del estímulo | ¿Quién o qué lo genera? |
| 2 | Estímulo | ¿Qué condición llega al sistema? |
| 3 | Artefacto | ¿Qué parte del sistema se ve afectada? |
| 4 | Entorno | ¿En qué condiciones (normal, pico de carga, degradado, desarrollo)? |
| 5 | Respuesta | ¿Qué hace el sistema? |
| 6 | Medida de respuesta | ¿Con qué número se verifica el éxito? (p. ej. ≤ 200 ms, recuperación ≤ 5 s, cambio ≤ 2 días-persona) |

Plantilla sugerida:

```markdown
### AC n — <Atributo>: <título corto>   (mismo formato de ID que el template SADP: `AC 1`, `AC 2`…)
| Parte | Valor |
|---|---|
| Fuente | |
| Estímulo | |
| Artefacto | |
| Entorno | |
| Respuesta | |
| Medida de respuesta | |
**Tácticas que lo satisfacen:** … · **ADR relacionados:** ADR-00X
```

- La disponibilidad se mide con porcentajes: 99,9 % equivale a unas 8,76 h de caída por año; 99,999 %, a unos 5,26 min. [CLASE 01/09]
- Hay dos familias de atributos. Los **de ejecución** son rendimiento, disponibilidad, seguridad y escalabilidad. Los **de desarrollo** son modificabilidad, testeabilidad, portabilidad y deployabilidad. [CLASE 01/09]

---

## 3. Estructura obligatoria del documento de arquitectura (SADP 2.0)

Carátula: **nombre del proyecto, fecha de elaboración, autores** e índice. [SADP]

| § | Sección | Qué va |
|---|---|---|
| 1 | **Introducción** | Visión general del documento, su estructura y cómo lo usan sus lectores. |
| 1.1 | Propósito | "El propósito del presente documento es proveer una especificación completa de la arquitectura del [sistema]". |
| 2 | **Antecedentes** | |
| 2.1 | Propósito del sistema | Resumen de las funciones y los usuarios, con referencias a otros documentos. No reemplaza a la especificación de requerimientos. |
| 2.2 | Requerimientos significativos de arquitectura | Funcionales, atributos de calidad, restricciones y requerimientos organizacionales que impactan el diseño. |
| 2.2.1 | Resumen de requerimientos funcionales | Tabla **ID · Descripción · Actor**. |
| 2.2.2 | Resumen de requerimientos de atributos de calidad | Tabla **ID requerimiento · ID atributo de calidad o restricción · Descripción**. Vincula cada `RF` con su `AC` o `RS`. |
| 3 | **Documentación de la arquitectura** | Una sección por **punto de vista** (módulos, C&C, asignación). Cada uno puede tener varias vistas. |
| 3.1 | Diagrama de contexto | El sistema como **una caja**, con todos los elementos externos con los que interactúa y el **tipo de conector** de cada uno. Normalmente es un diagrama C&C. |
| 3.2 | Vistas de módulos | |
| 3.2.1 | Vista de descomposición | Estructura jerárquica ("es parte de"), documentada recursivamente desde el sistema. Representación primaria, catálogo de elementos (opcional) y decisiones de diseño con links a los ADR. |
| 3.2.2 | Vista de uso | Dependencias "usa" entre módulos; **sirve para analizar el acoplamiento**. Representación primaria, catálogo (opcional) y decisiones de diseño (estilos, patrones y tácticas explicados según los RF y los atributos de calidad, con links a los ADR). |
| 3.2.3 | Vista de layers | Agrupa módulos por responsabilidad. Representación primaria, catálogo (opcional), decisiones (opcional) y otras vistas de módulos, como la de generalización o herencia. |
| 3.2.4 | Catálogo de elementos | Tabla **Elemento · Responsabilidades (paquete · descripción)**. Si los módulos son los mismos en todas las vistas, hay **un solo catálogo** para todas. |
| 3.2.5 | Interfaces (opcional) | Tabla **Interfaz · Paquete que la implementa · Servicio · Descripción**: mecanismo (web services, RPC, SDK, colas), si es síncrona o asíncrona y sus restricciones de tiempo o formato. |
| 3.2.6 | Comportamiento | Diagramas de comportamiento de los **principales casos de uso de arquitectura**, para validar que no falten paquetes ni responsabilidades. |
| 3.3 | Vistas de componentes y conectores | Visión del sistema **en ejecución**: componentes, formas de conexión e interacciones de las funcionalidades o mecanismos clave. |
| 3.3.1 | Representación primaria | Diagramas C&C. |
| 3.3.2 | Catálogo de elementos | Tabla **Componente/conector · Tipo · Descripción**. |
| 3.3.3 | Interfaces | Tabla **Interfaz · Componente que la provee · Servicio · Descripción**. |
| 3.3.4 | Comportamiento | Diagramas de secuencia de los principales casos de uso de arquitectura. |
| 3.3.5 | Relación con elementos lógicos | Tabla **Componente · Paquetes** que lo construyen. |
| 3.3.6 | Decisiones de diseño | Estilos, patrones y tácticas según los RF y los atributos de calidad, con links a los ADR. |
| 3.4 | Vistas de asignación | Cómo se relaciona el software con su entorno. |
| 3.4.1 | Vista de despliegue | Nodos, conectores y componentes desplegados. Tablas **Nodo · Características (velocidad, memoria…) · Descripción** y **Conector · Características · Descripción**. Si se usa el estilo tiers, se muestra acá. |
| 3.4.2 | Vista de instalación | Estructura de los artefactos de instalación (imagen Docker, `dist/`, `.war`…). Representación primaria, catálogo y decisiones de diseño con links a los ADR. |

### 3.1 Cómo documentar cada vista [TS p.42–45; VIEW; CLASE RAT §3.6]

1. **Representación primaria**: el diagrama con sus elementos y relaciones, **con leyenda**. Por sí sola **no alcanza**.
2. **Catálogo de elementos**: nombre y descripción de cada elemento. Solo se incluyen los que tienen información que no es obvia en el diagrama.
3. **Guía de variabilidad**: los puntos configurables del sistema (instancias de un pool, componentes opcionales o plugins, implementaciones alternativas, parámetros de build, despliegue o ejecución).
4. **Contexto de la arquitectura (*background*)**: justificación con alternativas descartadas, resultados de análisis o prototipos, supuestos y restricciones.
5. **Vistas relacionadas**: la vista padre y las vistas hijas (refinamiento).
6. **Comportamiento**: diagramas de secuencia para los recorridos importantes o complejos y diagramas de estado para lo que tiene estados relevantes. Solo las trazas importantes. [TS p.54; VIEW]
7. **ADR relacionados**: links a los ADR que justifican las decisiones de la vista. [VIEW]
8. Para las secciones que no aplican se escribe **N/A**, y para las pendientes, **TO-DO/TBD**. No hace falta completar todas. [VIEW README]
9. Se documentan las **interfaces más allá de su sintaxis**: semántica, errores y restricciones. [TS p.54]

### 3.2 Documentación transversal a las vistas [TS p.47–51; CLASE RAT §3.7]

El SADP 2.0 es una versión resumida. Si el trabajo lo amerita, se agrega:
- **Guía de lectura de la documentación (*roadmap*)**: cómo está organizada, qué plantilla usa y escenarios de uso.
- **Correspondencia entre vistas**: tablas de qué elemento de una vista corresponde a cuál de otra. Solo las relevantes; en el SADP, §3.3.5 cumple esta función.
- **Análisis y justificación general**: decisiones que afectan a varias vistas, alternativas descartadas y resultados de evaluación (por ejemplo, ATAM).
- **Correspondencia requerimientos → arquitectura (trazabilidad)**: cómo cada requerimiento queda cubierto por elementos o enfoques de la arquitectura.
- **Glosario y acrónimos.**

### 3.3 Diferencias entre SADP 1.7 y 2.0 (usar la 2.0)

- La 2.0 agrega el **diagrama de contexto** (§3.1).
- La sección "Requerimientos no funcionales" pasa a llamarse **"Requerimientos de atributos de calidad"**.
- La "Vista de tiers" deja de ser una sección fija dentro de C&C; los tiers se muestran en la vista de despliegue.
- Se agrega la **vista de instalación**.
- En la vista de descomposición, las decisiones de diseño dejan de ser opcionales.

---

## 4. Vistas: cuál usar para qué

| Familia | Momento | Elementos | Relaciones | Atributos que permite analizar |
|---|---|---|---|---|
| **Módulos** | Diseño | Paquetes, clases, capas, interfaces | es parte de, depende de / usa, es un | Modificabilidad, testeabilidad, reuso, asignación de trabajo, análisis de impacto |
| **C&C** | Ejecución | Procesos, servicios, filtros, colas, almacenes de datos | Conectores: HTTP/REST, RPC, colas, sockets, pipes | Rendimiento, disponibilidad, seguridad, concurrencia |
| **Asignación** | Despliegue | Nodos, contenedores, archivos y directorios | desplegado en, contiene, asignado a | Disponibilidad, rendimiento, seguridad, costo, operación |
| **Modelo de datos** | — | Entidades persistidas | 1:1, 1:n, n:n, generalización, agregación | Consistencia, rendimiento, modificabilidad |

[TS p.14–39; CLASE RAT §1.4]

- En C&C hay que distinguir las **llamadas locales de las remotas** y las **síncronas de las asíncronas**. [TS p.20]
- **Rendimiento en ejecución** = vista C&C **más** vista de despliegue. Las vistas de módulos no sirven para esto, porque son de diseño. [CLASE RAT §3.4]
- Una **vista de atributo de calidad** (por ejemplo, de seguridad) combina elementos de varias vistas estructurales para tratar un tema transversal. [CLASE RAT §3.5]
- **Layers ≠ tiers.** Las layers son una separación **lógica** (código, llamadas en memoria, diagrama de paquetes) y se documentan en la vista de módulos. Los tiers son una separación **física** (nodos o contenedores comunicados por red, diagrama de despliegue) y se documentan en la vista de despliegue. [CLASE 01/09]
- **Vista vs. punto de vista (ISO 42010):** el punto de vista es el molde (tipos de elementos, notación, público) y la vista es su instancia concreta. [CLASE RAT §3.3]
- **Diagrama de contexto:** su valor principal es **marcar los límites del sistema** y sus interacciones con lo externo, tratando al sistema como una caja negra. [CLASE RAT §3.6; SADP §3.1]
- Una estructura es **arquitectónica** solo si permite razonar sobre propiedades relevantes para los interesados. Las decisiones locales son diseño de detalle. [CLASE RAT §1.3]

---

## 5. Las siete reglas para los diagramas [VIEW `seven-tips-design-diagrams.md`]

1. **Siempre llevan leyenda de notación**, incluidos los colores y las líneas, con una notación que el lector conozca.
2. **Cada tipo de elemento y de relación tiene su propio símbolo.** Antes de dibujar hay que preguntarse qué tipo de componente y de conector es cada uno.
3. **Los diagramas de un mismo tipo usan símbolos consistentes.** Se define una leyenda y se reutiliza.
4. **Si se usa un estilo o patrón, tiene que notarse** (por ejemplo, que las cajas se identifiquen como modelo, vista o controlador, o como filtro y pipe).
5. **No se usan flechas dobles en llamada-respuesta ni en envío-recepción**, porque no se sabe quién llama a quién. En llamada-respuesta ya se entiende que viajan datos de ida y de vuelta.
6. **Los diagramas se mantienen actualizados o se eliminan**, ya sea borrándolos o marcándolos visiblemente como desactualizados.
7. **Los diagramas grandes se dividen por refinamiento**: uno de alto nivel (subsistemas, capas) y otros que muestran el interior.

Errores típicos que señala Merson (Duke's Bank) [TS p.24]: diagrama sin leyenda, cajas sin significado, la misma flecha para interacciones distintas, elementos o relaciones faltantes, interacciones incorrectas y nombres inconsistentes.

---

## 6. Decisiones de diseño: tácticas, patrones y ADR

### 6.1 Tácticas y patrones [CLASE 08/09; CLASE RAT §2.5; CLASE 20/08]

- **Táctica:** decisión de diseño atómica que controla **un único atributo de calidad**. Ejemplos: heartbeat (disponibilidad), caché (rendimiento), encapsular (modificabilidad) y timeout/retry (disponibilidad).
- **Patrón:** estructura de mayor escala que **agrupa varias tácticas** y equilibra los trade-offs entre atributos. Ejemplos: capas, pipes & filters, broker y MVC.
- Se usan tácticas sueltas cuando el patrón deja riesgos sin cubrir, para ajustar un atributo sin cambiar la estructura general, o cuando ningún patrón alcanza.
- La cadena de trazabilidad es: **atributo de calidad → táctica → tecnología**. La tecnología se justifica como la forma de implementar una táctica, no por sí misma.

### 6.2 ADR: plantilla oficial (es-ES) [ADR]

```markdown
# ADR N: título (breve) de la decisión
Describa aquí las fuerzas que influyeron la decisión de diseño, incluyendo los aspectos tecnológicos, costos de proyecto.

## Decisión
Nuestra respuesta a estas fuerzas: la decisión tomada, en oraciones completas y en voz activa ("Nosotros haremos ...").

## Justificación
Por qué se tomó la decisión. Incluye la justificación de las alternativas significativas que se rechazaron. Puede indicar supuestos, restricciones, requisitos y resultados de evaluaciones o experimentos.

## Estado
[Propuesto | Aceptado | Obsoleto | Reemplazado]. Si está obsoleto, indicar por qué. Si fue reemplazado, enlazar el ADR nuevo.

## Consecuencias
El contexto que resulta después de aplicar la decisión. Se enumeran TODAS las consecuencias, las positivas y también las negativas.
```

Pautas de uso:
- Cada ADR es un **documento de texto plano de 1 a 2 páginas**.
- Los ADR van **numerados** (ADR001, ADR002…).
- Se guardan **dentro del repositorio del proyecto** (por ejemplo, `docs/adr/`). Los que afectan a varios proyectos van en un repositorio aparte.
- **Se escriben solo para decisiones significativas**; las de detalle no llevan ADR.
- Se incluyen en el backlog y se revisan.
- La **justificación** va en su propia sección y no se mezcla con las demás, porque se lee una vez y la decisión y las consecuencias se releen muchas.
- Cada vista del SADP enlaza sus ADR en "Decisiones de diseño". [SADP]

---

## 7. Reglas de diseño que se evalúan

**Producto** [CLASE RAT §1.6; CLASE 03/09; CLASE 08/09]
- Las **capas son unidireccionales**: la capa superior usa solo a la inmediata inferior y **nunca se saltan capas** (por ejemplo, una ruta no llama directamente al repositorio).
- Los módulos aplican **ocultamiento de información (Parnas)**: alta cohesión e interfaces mínimas y estables.
- **No depender de una versión específica de un producto o librería**: se usan adaptadores, como la capa anticorrupción para APIs de terceros.
- **Los productores y los consumidores de datos van en módulos separados.**
- El **modelo de concurrencia** y el uso de recursos se planifican antes de implementar.
- Cada atributo de calidad se resuelve con **tácticas conocidas**.

**Proceso** [CLASE RAT §1.6]
- La arquitectura la diseña **un arquitecto o un grupo chico con un líder**, no un comité.
- Se evoluciona de forma **incremental** (primero un esqueleto vertical que funcione de punta a punta), no en cascada.

**Implementación Node.js / TypeScript** [CLASE 27/08; CLASE 03/09]
- `src/` contiene el código TypeScript y `dist/` el JavaScript compilado; `rootDir` y `outDir` lo separan.
- `tsconfig` usa `strict: true`.
- `dependencies` son solo las que se usan en ejecución y `devDependencies` las de build y desarrollo. Los scripts estándar son `dev`, `build` y `start`.
- La configuración va en **variables de entorno**: `.env` está en `.gitignore` y `.env.example` se versiona. Nada queda escrito en el código. Al arrancar se valida la configuración y, si falta algo, la aplicación no levanta (*fail-fast*).
- Las entradas se validan en los tres puntos de contacto: el body HTTP, las variables de entorno y las respuestas de proveedores externos (Zod).
- Se testea con Jest y Supertest; los servicios externos se reemplazan por mocks (FIRST).
- Los logs son estructurados (Pino). Se recomienda ESLint.

---

## 8. Uso de IA (obligatorio) [IA; CLASE 18/08, 20/08]

1. El uso de IA generativa **está autorizado**, siguiendo las pautas de cada docente.
2. **Todo contenido generado por IA que forme parte de una entrega debe estar referenciado**: qué herramientas se usaron y **para qué** (generar ideas, redacción inicial, análisis, corrección de estilo, código…).
3. **Todo contenido de la IA se revisa y verifica.** Los errores son responsabilidad del estudiante, incluidas las alucinaciones, los problemas de privacidad o propiedad intelectual y los sesgos.
4. La IA **no reemplaza el razonamiento propio**: el trabajo tiene que reflejar la comprensión del estudiante.
5. **La defensa es obligatoria y eliminatoria**, y hay al menos una por materia.
6. La defensa es **presencial**; la remota sincrónica solo se permite en casos excepcionales.
7. Si hay dudas de autoría, plagio o uso de IA sin citar, el docente puede convocar a una **defensa individual específica**.

Práctica recomendada en clase: mantener en el repositorio la documentación en Markdown (`planning.md`, `memory.md`, `architecture.md`) como contexto compartido para el equipo y para cualquier modelo de IA.

**Sugerencia para cumplir la regla 2:** agregar al documento o al README una sección "Uso de IA" con una tabla **Herramienta · Uso · Partes afectadas · Cómo se verificó**.

---

## 9. Checklist antes de entregar

- [ ] La carátula tiene nombre del proyecto, fecha y autores, y el documento sigue la estructura del **SADP 2.0**.
- [ ] Los RF, AC y RS significativos están en tablas con IDs, y cada AC está vinculado a un RF o RS.
- [ ] Cada atributo de calidad importante tiene un **escenario de 6 partes** con medida numérica.
- [ ] Hay un **diagrama de contexto** con los tipos de conector.
- [ ] Hay vistas de **módulos** (descomposición, uso y layers), **C&C** y **asignación** (despliegue e instalación), o N/A justificado.
- [ ] **Cada diagrama tiene leyenda**, sin flechas dobles en llamada-respuesta, con símbolos consistentes y el patrón visible.
- [ ] Cada vista tiene catálogo de elementos, interfaces si aplican, comportamiento (secuencias de los casos de uso de arquitectura) y decisiones con links a los ADR.
- [ ] Los **ADR** están numerados, con Decisión, Justificación (incluidas las alternativas rechazadas), Estado y Consecuencias **positivas y negativas**.
- [ ] Están los trade-offs de cada patrón y táctica, y la cadena atributo → táctica → tecnología.
- [ ] Layers y tiers no están mezclados; no hay capas salteadas.
- [ ] Está la tabla componente → paquetes y, si aplica, la de requerimiento → elemento.
- [ ] Ningún diagrama quedó desactualizado.
- [ ] Está la sección **"Uso de IA"** con herramientas y contexto, y todo el contenido está verificado.
- [ ] Cada integrante puede **explicar el porqué** de cada decisión para la defensa.
