# AC-005: Reutilizacion de tasas desde la cache en memoria

- **Atributo de calidad:** Rendimiento y eficiencia de la integracion (QA-05)
- **RF relacionado:** RF-05 (enriquecimiento con tipo de cambio)
- **Prioridad:** Media
- **Estado de evidencia:** Confirmada

## Escenario

- **Fuente:** Sistema cliente que envia lotes sucesivos de reservas.
- **Estimulo:** Varias reservas requieren cotizaciones sobre la misma moneda base dentro del periodo de validez de la cache.
- **Entorno:** Operacion normal, con la API externa disponible y una entrada de cache vigente (TTL de 1 hora).
- **Artefacto:** `RatesCache` y `ExchangeRateApiClient`.
- **Respuesta:** La primera solicitud consulta la API y cachea el mapa completo de tasas de la moneda base; las siguientes se resuelven desde memoria con `rateSource: "cache"`, sin trafico de red, incluso para monedas destino distintas. Al vencer el TTL, o tras una invalidacion manual (`POST /pipeline/config/reset` o un `PUT` que modifique `exchangeRate`), la siguiente solicitud vuelve a consultar la API.
- **Medida de respuesta:** 1 llamada HTTP por moneda base por hora, con independencia de la cantidad de reservas y de monedas destino. Verificacion manual contra el proveedor real: primera reserva con `rateSource: "api"` en 1042 ms totales de pipeline (1040 ms atribuidos al filtro de tipo de cambio); segunda reserva con `rateSource: "cache"` en 0,41 ms totales. Objetivo formal de latencia y de consumo mensual de cuota: `Pendiente de validacion`.

## Impacto arquitectonico

- La cache debe ser propiedad del servicio de procesamiento y no del cliente construido por request, para sobrevivir entre requests y entre cambios de configuracion.
- Requiere que la respuesta de la API se cachee completa (mapa de todas las monedas) y no por par de monedas, para amortizar una llamada entre destinos distintos.
- Obliga a exponer una operacion de invalidacion en el puerto de integracion, porque la consigna la pide como requerimiento funcional.

## Tacticas relacionadas

- Cache-aside con TTL: reduce latencia y consumo de cuota del proveedor gratuito.
- Cacheo por moneda base en lugar de por par: maximiza la tasa de acierto.
- Invalidacion explicita: mantiene coherencia cuando cambia la configuracion de la integracion.
- Atajo de identidad (destino igual a la moneda base): evita red cuando no hay conversion que hacer.

## Evidencia

- Consigna: "Cache en memoria de tasas por 1 hora", "Evitar llamadas innecesarias a la API", "Invalidacion manual de cache si es necesario".
- `src/services/exchangeRate/ratesCache.ts`, `src/services/exchangeRate/exchangeRateApiClient.ts`, `src/services/reservationProcessingService.ts` (la cache vive en el servicio).
- `tests/services/exchangeRateApiClient.test.ts`: "no vuelve a llamar a la API mientras la cache esta vigente", "descarta la entrada cacheada cuando vence el TTL", "vuelve a consultar la API luego de invalidar la cache manualmente", "no consulta la API cuando la moneda destino es la moneda base".

## Preguntas pendientes

- Volumen real de reservas por hora y distribucion por destino, para dimensionar si la cuota gratuita del proveedor alcanza.
- Si el TTL de 1 hora es aceptable para el negocio en monedas volatiles.
- En un despliegue con varias instancias, la cache en memoria se duplica por proceso; una cache compartida queda como **Propuesta**.
