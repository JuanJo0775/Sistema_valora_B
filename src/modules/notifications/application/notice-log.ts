// Cuándo se avisó por última vez a una cuenta por una cola (ADR-044): sostiene el límite de un
// aviso cada 5 minutos y evita duplicados si el outbox reintenta.
export interface NoticeLog {
  lastSent(accountId: string, queue: string): Promise<Date | null>;
  record(accountId: string, queue: string, at: Date): Promise<void>;
}
