const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

// Grill de la #16, pregunta 3: valores provisionales, en un solo lugar para calibrarlos.
export const SESSION_INACTIVITY_DAYS = 7;

export interface SessionLifetimeInput {
  createdAt: Date;
  lastSeenAt: Date;
  now: Date;
}

export function isSessionActive({ lastSeenAt, now }: SessionLifetimeInput): boolean {
  return now.getTime() - lastSeenAt.getTime() <= SESSION_INACTIVITY_DAYS * DAY_IN_MILLISECONDS;
}
