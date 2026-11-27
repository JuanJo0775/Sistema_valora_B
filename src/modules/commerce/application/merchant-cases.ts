import { createEvent, type DomainEvent } from '../../../shared/events';

// D2 y D3 del grill comercial (#208): los casos que decide el moderador sobre un comercio.
// denuncia: «este comercio no es de quien dice». disputa: otra cuenta, estando en la tienda, intentó
// registrarla y ya tenía dueño. reclamo (H11, ADR-037): una cuenta reclamó un supermercado que no es
// de cadena y espera que un moderador lo apruebe. Solo la clave seudónima de quien lo abre (EC-08).
// H18: los datos del responsable que puso quien disputa, para compararlos con los del dueño.
export interface DisputeChallenger {
  responsibleName: string;
  nit: string | null;
  phone: string;
}

// La cuenta solo se guarda para borrar los datos si se elimina (ADR-032); nunca se lee de vuelta.
export type NewDisputeChallenger = DisputeChallenger & { accountId: string };

export interface MerchantCase {
  id: string;
  establishmentId: string;
  kind: 'denuncia' | 'disputa' | 'reclamo';
  reporterKey: string;
  reason: string;
  createdAt: Date;
  // Solo en las disputas pendientes; no está en las anteriores a guardar estos datos.
  challenger?: DisputeChallenger;
}

// #260: moderación se entera por el outbox de que hay un caso nuevo. Solo lleva el id y el tipo del
// caso: nunca la clave de quien lo abre ni los datos del responsable (EC-08).
export const MERCHANT_CASE_OPENED = 'MerchantCaseOpened';

export function caseOpenedEvent(merchantCase: Pick<MerchantCase, 'id' | 'kind'>): DomainEvent {
  return createEvent(MERCHANT_CASE_OPENED, 1, { caseId: merchantCase.id, kind: merchantCase.kind });
}

// Puerto hacia el esquema commerce.
export interface MerchantCaseRepository {
  // Si esa clave ya tiene un caso abierto sobre esa tienda.
  hasOpen(establishmentId: string, reporterKey: string): Promise<boolean>;
  // El caso, en una disputa quien disputa, y los eventos se guardan juntos (ADR-015).
  open(
    merchantCase: MerchantCase,
    challenger: NewDisputeChallenger | undefined,
    events: DomainEvent[],
  ): Promise<void>;
  findPending(caseId: string): Promise<MerchantCase | null>;
  // H17: la disputa pendiente que abrió esta cuenta, si tiene una (solo las que guardan sus datos).
  openDisputeOf(accountId: string): Promise<{ establishmentId: string; openedAt: Date } | null>;
  close(record: MerchantCaseDecisionRecord): Promise<void>;
}

// D3: lo que queda anotado al decidir un caso (quién, cuándo y por qué).
export interface MerchantCaseDecisionRecord {
  caseId: string;
  status: 'revocado' | 'descartado' | 'aprobado' | 'rechazado';
  note: string;
  moderatorKey: string;
  decidedAt: Date;
}

// H11: la decisión del moderador sobre un reclamo pre-aprobado.
export interface MerchantClaimReview {
  caseId: string;
  accountId: string;
  establishmentId: string;
  note: string;
  moderatorKey: string;
  decidedAt: Date;
}

export interface MerchantClaimReviews {
  // En una transacción: la solicitud queda verificada, el caso se cierra como aprobado y se guardan
  // los eventos (ADR-015).
  approve(review: MerchantClaimReview, events: DomainEvent[]): Promise<void>;
  // En una transacción: la solicitud sale de las activas con el motivo y el caso se cierra como
  // rechazado.
  reject(review: MerchantClaimReview): Promise<void>;
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
