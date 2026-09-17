import { PassengerType } from './types';

export function calculateAge(birthDateIso: string, departureDateIso: string): number {
  const birth = new Date(birthDateIso);
  const target = new Date(departureDateIso);
  let age = target.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = target.getUTCMonth() - birth.getUTCMonth();
  const dayDiff = target.getUTCDate() - birth.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

export function expectedPassengerType(age: number): PassengerType {
  if (age < 12) return 'child';
  if (age > 65) return 'senior';
  return 'adult';
}
