import { Passenger } from '../domain/types';

/**
 * Base de datos en memoria de pasajeros. Cubre los escenarios de prueba pedidos:
 * distintos tiers de lealtad, pasajeros inactivos, rangos de edad variados,
 * paises de origen diferentes y datos de contacto invalidos o incoherentes.
 */
export const mockPassengers: Passenger[] = [
  {
    id: 'P001',
    firstName: 'Ana',
    lastName: 'Gomez',
    email: 'ana.gomez@example.com',
    phone: '+54 11 4000-1001',
    age: 34,
    passengerType: 'adult',
    loyaltyTier: 'gold',
    countryCode: 'AR',
    isActive: true
  },
  {
    id: 'P002',
    firstName: 'Bruno',
    lastName: 'Silva',
    email: 'bruno.silva@example.com',
    phone: '+55 11 95000-2002',
    age: 41,
    passengerType: 'adult',
    loyaltyTier: 'silver',
    countryCode: 'BR',
    isActive: true
  },
  {
    id: 'P003',
    firstName: 'Clara',
    lastName: 'Ruiz',
    email: 'clara.ruiz@example.com',
    phone: '+34 600 300 303',
    age: 8,
    passengerType: 'child',
    loyaltyTier: 'silver',
    countryCode: 'ES',
    isActive: true
  },
  {
    id: 'P004',
    firstName: 'Diego',
    lastName: 'Martinez',
    email: 'diego.martinez@example.com',
    phone: '+1 305 400 4004',
    age: 71,
    passengerType: 'senior',
    loyaltyTier: 'gold',
    countryCode: 'US',
    isActive: true
  },
  {
    id: 'P005',
    firstName: 'Elena',
    lastName: 'Torres',
    email: 'elena.torres@example.com',
    phone: '+52 55 5000-5005',
    age: 29,
    passengerType: 'adult',
    loyaltyTier: 'bronze',
    countryCode: 'MX',
    isActive: true
  },
  {
    // Pasajero dado de baja: sirve para validar el control de estado.
    id: 'P006',
    firstName: 'Fabio',
    lastName: 'Rossi',
    email: 'fabio.rossi@example.com',
    phone: '+39 06 6000 6006',
    age: 50,
    passengerType: 'adult',
    loyaltyTier: 'silver',
    countryCode: 'IT',
    isActive: false
  },
  {
    id: 'P007',
    firstName: 'Gabriela',
    lastName: 'Lima',
    email: 'gabriela.lima@example.com',
    phone: '+55 21 97000-7007',
    age: 68,
    passengerType: 'senior',
    loyaltyTier: 'silver',
    countryCode: 'BR',
    isActive: true
  },
  {
    id: 'P008',
    firstName: 'Hugo',
    lastName: 'Perez',
    email: 'hugo.perez@example.com',
    phone: '+54 11 4000-8008',
    age: 10,
    passengerType: 'child',
    loyaltyTier: 'none',
    countryCode: 'AR',
    isActive: true
  },
  {
    // Incoherencia deliberada: menor de 12 anios declarado como adulto.
    id: 'P009',
    firstName: 'Ivan',
    lastName: 'Castro',
    email: 'ivan.castro@example.com',
    phone: '+56 2 2900-9009',
    age: 9,
    passengerType: 'adult',
    loyaltyTier: 'none',
    countryCode: 'CL',
    isActive: true
  },
  {
    // Incoherencia deliberada: mayor de 65 anios declarado como adulto.
    id: 'P010',
    firstName: 'Julia',
    lastName: 'Mendez',
    email: 'julia.mendez@example.com',
    phone: '+51 1 700-1010',
    age: 70,
    passengerType: 'adult',
    loyaltyTier: 'bronze',
    countryCode: 'PE',
    isActive: true
  },
  {
    // Datos de contacto invalidos: email mal formado y apellido vacio.
    id: 'P011',
    firstName: 'Karen',
    lastName: '',
    email: 'karen.diaz-at-example.com',
    phone: '',
    age: 37,
    passengerType: 'adult',
    loyaltyTier: 'none',
    countryCode: 'UY',
    isActive: true
  },
  {
    // Adulto sin programa de lealtad: caso base sin descuentos.
    id: 'P012',
    firstName: 'Luis',
    lastName: 'Fernandez',
    email: 'luis.fernandez@example.com',
    phone: '+1 212 500 1212',
    age: 45,
    passengerType: 'adult',
    loyaltyTier: 'none',
    countryCode: 'US',
    isActive: true
  }
];
