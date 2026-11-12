import { createHash } from 'node:crypto';

// Espacio de nombres fijo de la semilla de Valora. No cambiarlo: los ids ya sembrados dependen de él.
const VALORA_SEED_NAMESPACE = '6f3c1b2a-8d4e-4f5a-9b6c-7d8e9f0a1b2c';

// UUID versión 5 (RFC 9562): los mismos datos dan siempre el mismo id (grill de la #51, pregunta 2).
export function stableId(...parts: string[]): string {
  const namespace = Buffer.from(VALORA_SEED_NAMESPACE.replaceAll('-', ''), 'hex');
  const hash = createHash('sha1').update(namespace).update(parts.join('|')).digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50; // versión 5
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variante RFC
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
