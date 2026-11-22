import { DomainError } from './domain-error';

// D5 del grill comercial (precisiones del 22-nov-2026): el horario de una tienda, por día y sin texto
// libre. Cada día está cerrado (null) o abre y cierra el mismo día, en hora de Colombia.
export const WEEKDAYS = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export interface DayHours {
  // HH:MM, de 00:00 a 23:59.
  opens: string;
  closes: string;
}

export type OpeningHours = Record<Weekday, DayHours | null>;

// Regla incumplida (422) con código estable.
export class InvalidOpeningHoursError extends DomainError {
  readonly code = 'INVALID_OPENING_HOURS';
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// El horario llega de afuera, así que puede faltar un día: si todo está bien, queda completo.
export function assertValidOpeningHours(
  hours: Partial<OpeningHours>,
): asserts hours is OpeningHours {
  for (const weekday of WEEKDAYS) {
    const day = hours[weekday];
    if (day === undefined) {
      throw new InvalidOpeningHoursError(`Falta el horario del ${weekday}.`);
    }
    if (day === null) continue;
    if (!TIME.test(day.opens) || !TIME.test(day.closes)) {
      throw new InvalidOpeningHoursError('Las horas van en formato HH:MM, de 00:00 a 23:59.');
    }
    // Las horas HH:MM se comparan bien como texto.
    if (day.closes <= day.opens) {
      throw new InvalidOpeningHoursError(
        `El ${weekday} la hora de cierre debe ser después de la de apertura.`,
      );
    }
  }
}
