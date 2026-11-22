import type { DomainEvent } from '../../../shared/events';

// D2 y D3 del grill comercial (#208): los casos que decide el moderador sobre un comercio.
// denuncia: «este comercio no es de quien dice». disputa: otra cuenta, estando en la tienda, intentó
// registrarla y ya tenía dueño. Solo la clave seudónima de quien lo abre (EC-08).
export interface MerchantCase {
  id: string;
  establishmentId: string;
  kind: 'denuncia' | 'disputa';
  reporterKey: string;
  reason: string;
  createdAt: Date;
}

// Puerto hacia el esquema commerce.
export interface MerchantCaseRepository {
  // Si esa clave ya tiene un caso abierto sobre esa tienda.
  hasOpen(establishmentId: string, reporterKey: string): Promise<boolean>;
  open(merchantCase: MerchantCase): Promise<void>;
  findPending(caseId: string): Promise<MerchantCase | null>;
  close(record: MerchantCaseDecisionRecord): Promise<void>;
}

// D3: lo que queda anotado al decidir un caso (quién, cuándo y por qué).
export interface MerchantCaseDecisionRecord {
  caseId: string;
  status: 'revocado' | 'descartado';
  note: string;
  moderatorKey: string;
  decidedAt: Date;
}

// D3: revocar retira el comercio de la tienda; los casos abiertos de esa tienda se cierran con él.
export interface MerchantRevocation {
  accountId: string;
  establishmentId: string;
  reason: string;
  moderatorKey: string;
  revokedAt: Date;
}

export interface MerchantRevocations {
  // En una transacción: la solicitud pasa al historial como revocada, se borran sus precios
  // oficiales y sus promociones, se cierran los casos de la tienda y se guardan los eventos.
  revoke(revocation: MerchantRevocation, events: DomainEvent[]): Promise<void>;
}
