const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

// Grill de la #16, pregunta 3: valores provisionales, en un solo lugar para calibrarlos.
export const SESSION_INACTIVITY_DAYS = 7;
export const SESSION_MAX_DAYS = 30;

export interface SessionLifetimeInput {
  createdAt: Date;
  lastSeenAt: Date;
  // Fecha en que se cerró la sesión, si se cerró.
  revokedAt?: Date | null;
  now: Date;
}

const daysBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / DAY_IN_MILLISECONDS;

export function isSessionActive({
  createdAt,
  lastSeenAt,
  revokedAt,
  now,
}: SessionLifetimeInput): boolean {
  return (
    !revokedAt &&
    daysBetween(lastSeenAt, now) <= SESSION_INACTIVITY_DAYS &&
    daysBetween(createdAt, now) <= SESSION_MAX_DAYS
  );
}

// Grill de la #16, pregunta 3: last_seen_at se escribe como mucho una vez cada 5 minutos.
export const SESSION_TOUCH_MINUTES = 5;

export function needsTouch(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= SESSION_TOUCH_MINUTES * 60 * 1000;
}
