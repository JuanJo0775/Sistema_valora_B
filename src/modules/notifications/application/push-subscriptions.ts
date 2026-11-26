// Lo que se guarda de un dispositivo para enviarle avisos (ADR-045): nada más que la dirección del
// servicio de push, las dos claves del navegador, la cuenta y la fecha. Sin agente de usuario ni IP.
export interface NewPushSubscription {
  accountId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
}

// Puerto hacia la tabla propia del módulo (esquema notifications).
export interface PushSubscriptionRepository {
  // Una dirección tiene un solo dueño: si ya existía, pasa a esta cuenta y renueva claves y fecha.
  save(subscription: NewPushSubscription): Promise<void>;
  // Las direcciones de una cuenta, de la más antigua a la más nueva.
  endpointsOf(accountId: string): Promise<string[]>;
  // Borra solo las de esa cuenta.
  remove(accountId: string, endpoints: string[]): Promise<void>;
}
