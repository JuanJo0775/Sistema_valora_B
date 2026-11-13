// Tope de intentos por clave (correo o IP) en una ventana fija (grill de la #16, pregunta 10).
export interface AttemptRule {
  limit: number;
  windowMinutes: number;
}

// Puerto: hoy en memoria (un solo despliegue, ADR-001); se cambia por uno en base si hay varias
// instancias.
export interface AttemptLimiter {
  // Segundos que faltan para poder intentar de nuevo, o null si se permite.
  retryAfterSeconds(key: string, rule: AttemptRule): number | null;
  record(key: string, rule: AttemptRule): void;
  reset(key: string): void;
}
