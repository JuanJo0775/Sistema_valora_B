import { distanceMeters, type Point } from './distance';
import { DomainError } from './domain-error';

// D2 del grill comercial: quien registra un comercio debe estar a 50 m o menos de la tienda.
export const PRESENCE_RADIUS_METERS = 50;

// Regla de negocio incumplida: la capa HTTP la traduce a 422 NOT_AT_ESTABLISHMENT.
export class NotAtEstablishmentError extends DomainError {
  readonly code = 'NOT_AT_ESTABLISHMENT';

  constructor() {
    super('Para registrar la tienda tienes que estar en ella: tu ubicación está a más de 50 m.');
  }
}

// La ubicación de la persona solo se usa aquí, para esta comparación: nunca se guarda (EC-08).
export function isAtEstablishment(person: Point, establishment: Point): boolean {
  return distanceMeters(person, establishment) <= PRESENCE_RADIUS_METERS;
}

// Pesos de la DIAN para el dígito de verificación, del dígito de la derecha hacia la izquierda.
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

function checkDigit(digits: string): number {
  let sum = 0;
  // De derecha a izquierda: el último dígito lleva el primer peso.
  for (let index = 0; index < digits.length; index += 1) {
    sum += Number(digits.at(-1 - index)) * (NIT_WEIGHTS[index] ?? 0);
  }
  const remainder = sum % 11;
  return remainder < 2 ? remainder : 11 - remainder;
}

// «800.197.268-4» o «800197268-4». Solo detecta errores al escribir: no consulta a la DIAN, así que
// no dice si el NIT existe ni de quién es (eso lo cubren la presencia y las denuncias).
export function isValidNit(nit: string): boolean {
  const [, number, digit] = /^(\d{1,15})-(\d)$/.exec(nit.replaceAll('.', '')) ?? [];
  if (number === undefined || digit === undefined) return false;
  return checkDigit(number) === Number(digit);
}
