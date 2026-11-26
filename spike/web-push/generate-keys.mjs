// Genera claves VAPID de PRUEBA para el spike. Nunca se suben al repositorio (.env.spike está ignorado).
import { writeFile } from 'node:fs/promises';
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
await writeFile(
  '.env.spike',
  `VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n# Para iPhone, cambia esto por un correo de contacto del equipo:\nVAPID_SUBJECT=mailto:equipo@valora.example\n`,
);
console.log('Claves de prueba guardadas en .env.spike');
