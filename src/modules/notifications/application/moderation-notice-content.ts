import type { ModerationQueue } from './moderation-notice-rules';

// Lo que viaja en la notificación, cifrado de extremo a extremo (ADR-044). Solo texto genérico y la
// dirección a abrir: nunca nombres de tiendas ni de productos ni nada de quien reportó (EC-08).
export interface NoticeContent {
  title: string;
  body: string;
  url: string;
  // Una por cola: el navegador reemplaza el aviso anterior en vez de apilarlos.
  tag: string;
}

// El nombre de cada pestaña del panel de moderación.
const QUEUE_LABEL: Record<ModerationQueue, string> = {
  precios: 'Precios',
  tiendas: 'Tiendas',
  productos: 'Productos',
  comercios: 'Comercios',
};

export function contentOf(queue: ModerationQueue): NoticeContent {
  return {
    title: 'Valora',
    body: `Hay casos nuevos para revisar en ${QUEUE_LABEL[queue]}`,
    url: `/moderacion?vista=${queue}`,
    tag: `moderacion-${queue}`,
  };
}
