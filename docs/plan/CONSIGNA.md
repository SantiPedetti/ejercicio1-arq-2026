# 📄 Ejercicio de Aplicación 1
*Origen:* `Ejercicio de Aplicación 1.pdf`

---

# **Ejercicio - Sistema de Reservas de Vuelos** 

## **Objetivo** 

Implementar un sistema de procesamiento de reservas de vuelos utilizando el patrón arquitectónico Pipes & Filters con Node.js, TypeScript y Express.js. 

El objetivo es procesar solicitudes de reservas de vuelos en formato JSON utilizando una serie de filtros y transformaciones que validen, enriquezcan y calculen el costo final de las reservas. 

## **Concepto del Sistema** 

Estás desarrollando el backend de un sistema de reservas de vuelos que procesa solicitudes a través de un pipeline de filtros. Cada filtro tiene una responsabilidad específica y los datos fluyen de un filtro al siguiente hasta completar el procesamiento de la reserva. 

## **Input y Output del Procesamiento** 

### **Input** 

El sistema debe recibir: 

- Un array de reservas de vuelo a procesar 

- Parámetros de configuración para los filtros (opcional) 

### **Output** 

El resultado será: 

- Array de reservas procesadas con precios calculados y validaciones aplicadas 

- Reporte de errores y warnings por cada reserva 

- Tiempo total de procesamiento 

## **Filtros a Implementar** 

### **1. Filtro de Validación de Pasajero** 

- Verificar que el pasajero existe y está activo 

- Validar información de contacto 

- Confirmar edad vs tipo de pasajero 

### **2. Filtro de Validación de Vuelo** 

- Verificar que el vuelo existe 

- Confirmar disponibilidad de asientos 

- Validar origen y destino 

- Verificar fecha de vuelo 

### **3. Filtro de Enriquecimiento con API de Tipo de Cambio** 

- Obtener tasas de cambio actuales desde API externa 

- Convertir precios a moneda local del país de destino 

- Agregar información de conversión al metadata de la reserva 

### **4. Filtro de Cálculo de Precio Base** 

- Calcular precio según clase de asiento: 

   - Economy: precio base 

   - Business: precio base × 2.5 

   - First: precio base × 4 

### **5. Filtro de Descuentos por Lealtad** 

- Aplicar descuentos según tier de lealtad: 

   - Bronze: 5% 

   - Silver: 10% 

   - Gold: 15% 

### **6. Filtro de Ajustes por Tipo de Pasajero** 

- Child (< 12 años): 25% descuento 

- Senior (> 65 años): 15% descuento 

- Adult: sin descuento 

### **7. Filtro de Cálculo de Impuestos y Tasas** 

- Impuestos base: 12% del precio 

- Tasa de aeropuerto: $25 fijos 

- Sobrecargos por combustible: 8% del precio base 

## **Datos de Prueba** 

### **Configuración de Datos Mock** 

Para poder validar pasajeros y vuelos, el sistema debe incluir datos de prueba predefinidos en memoria que simulen una base de datos. Se recomienda crear: 

#### **Datos de Pasajeros Mock:** 

const mockPassengers = [ 

- _// Pasajeros activos de diferentes tiers de lealtad_ 

- _// Pasajeros inactivos para testing de validación_ 

- _// Rangos de edad variados (niños, adultos, seniors)_ 

- _// Diferentes países de origen_ 

]; 

#### **Datos de Vuelos Mock:** 

const mockFlights = [ 

- _// Diferentes rutas_ 

- _// Variedad de precios base_ 

- _// Algunos vuelos con asientos limitados_ 

- _// Vuelos con diferentes duraciones_ 

- _// Códigos de vuelo realistas (AA001, LA4567, etc.)_ 

]; 

### **Estrategia de Validación** 

#### **Para el Filtro de Validación de Pasajero:** 

- **Buscar por ID:** El sistema debe encontrar el pasajero en los datos mock 

- **Validar estado:** Verificar que isActive: true 

- **Verificar datos:** Email válido, nombre no vacío 

- **Validar coherencia:** Edad vs tipo de pasajero (child < 12, senior > 65) 

#### **Para el Filtro de Validación de Vuelo:** 

- **Buscar por código:** El vuelo debe existir en los datos mock 

- **Verificar disponibilidad:** availableSeats > 0 

- **Validar ruta:** Origen y destino deben coincidir con el vuelo 

- **Verificar fecha:** La fecha de salida debe ser futura 

### **Implementación Sugerida** 

Los datos mock deben estar: 

1. **En archivos separados** ( /data/mockPassengers.ts , /data/mockFlights.ts ) 

2. **Cargados al inicio** de la aplicación 

3. **Fácilmente modificables** para diferentes escenarios de testing 

Esto permite que los filtros de validación funcionen inmediatamente, facilitando el testing y desarrollo. 

## **Integración con API de Tipo de Cambio** 

### **APIs Públicas Recomendadas** 

#### **ExchangeRate-API (Gratuita hasta 1,500 requests/mes)** 

- **Base URL:** https://api.exchangerate-api.com/v4/latest/ 

- **Endpoint principal:** GET /latest/{base_currency} 

- **Respuesta:** JSON con todas las tasas de cambio actuales 

- **Ventajas:** Simple, confiable, sin autenticación requerida 

#### **Fixer.io (Freemium - 100 requests/mes gratis)** 

- **Base URL:** http://data.fixer.io/api/ 

- **Endpoint:** GET 

- /latest?access_key={API_KEY}&base={base}&symbols={symbols} 

- ● **Autenticación:** API Key requerida 

- **Ventajas:** Datos históricos disponibles, alta precisión 

#### **CurrencyAPI (Freemium - 300 requests/mes gratis)** 

- **Base URL:** https://api.currencyapi.com/v3/ 

- **Endpoint:** GET /latest?apikey={API_KEY}&base_currency={base} 

- **Autenticación:** API Key requerida 

- **Ventajas:** Datos en tiempo real, múltiples endpoints especializados 

#### **Open Exchange Rates (Freemium - 1,000 requests/mes gratis)** 

- **Base URL:** https://openexchangerates.org/api/ 

- **Endpoint:** GET /latest.json?app_id={APP_ID}&base={base} 

- ● **Autenticación:** App ID requerida 

- **Ventajas:** Muy estable, usado por empresas grandes 

### **Funcionalidades del Filtro de Tipo de Cambio** 

1. **Detección de Moneda por País:** 

   - Mapear código de país del destino a moneda local 

   - Ejemplos: "AR" → "ARS", "BR" → "BRL", "US" → "USD", "EU" → "EUR" 

2. **Conversión de Precios:** 

   - Convertir precio base USD a moneda de destino 

   - Aplicar tasa de cambio actual del día 

   - Mantener precio original y convertido en metadata 

3. **Manejo de Errores:** 

   - Timeout en llamadas a API (máximo 5 segundos) 

   - Retry automático hasta 3 intentos 

   - Fallback a tasa de cambio por defecto si API falla 

   - Logging de errores de integración 

4. **Caching de Tasas:** 

   - Cache en memoria de tasas por 1 hora 

   - Evitar llamadas innecesarias a la API 

   - Invalidación manual de cache si es necesario 

## **Endpoints Requeridos** 

- POST /reservations/process - Procesar array de reservas a través del pipeline 

- GET /reservations/:id/status - Estado del procesamiento de una reserva específica 

- GET /pipeline/config - Ver configuración actual del pipeline 

- PUT /pipeline/config - Modificar configuración de filtros 

## **Casos de Prueba Requeridos** 

### **Flujo Básico de Reserva:** 

1. Reserva válida con pasajero existente y vuelo disponible 

2. Reserva con pasajero inexistente 

3. Reserva para vuelo sin asientos disponibles 

4. Reserva con datos malformados 

### **Flujo de Cálculo de Precios:** 

1. Reserva economy sin descuentos 

2. Pasajero Gold con descuento por lealtad 

3. Niño en clase business con descuentos combinados 

4. Senior en primera clase con múltiples ajustes 

### **Integración con API de Tipo de Cambio:** 

1. Reserva exitosa con conversión de moneda aplicada 

2. Reserva con destino en país con moneda diferente 

3. Manejo de errores cuando API de tipo de cambio falla 

4. Uso de cache de tasas de cambio 

### **Casos de Error:** 

1. Timeout en llamada a API externa 

2. Filtro que lanza excepción 

3. Pipeline interrumpido por falla de red 

4. Datos corruptos en mitad del pipeline 

## **Aclaraciones** 

- Cada filtro debe ser independiente y testeable por separado 

- Los filtros se aplicarán en el orden definido por el pipeline 

- Es posible configurar qué filtros están habilitados/deshabilitados 

- La API de tipo de cambio es externa - si falla, el procesamiento continúa con warnings y precios en USD 

- Se debe manejar timeout y retry para llamadas externas 

- El pipeline debe ser robusto ante fallos individuales de filtros 

- Para simplificar la implementación, asumimos que todos los precios base están en USD 

## **Entregables** 

1. Código fuente completo con TypeScript 

2. Tests unitarios para cada filtro y/o de integración para el flujo completo 

3. Colección de Postman con ejemplos de requests y responses 

4. README con documentación, instrucciones de instalación y ejecución 

