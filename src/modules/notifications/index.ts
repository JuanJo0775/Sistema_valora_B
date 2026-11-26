// Interfaz pública del módulo notifications (ADR-044). Ningún otro módulo lo importa: solo
// AppModule lo registra, y las pruebas, la clave pública para reemplazarla.
export { NotificationsModule } from './notifications.module';
export { VAPID_PUBLIC_KEY } from './http/notifications.controller';
