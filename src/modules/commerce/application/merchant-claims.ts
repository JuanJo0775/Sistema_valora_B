import type { DomainEvent } from '../../../shared/events';

// D2 y D3 del grill comercial: la solicitud con la que una cuenta se vuelve dueña de una tienda.
// No guarda la ubicación del celular: solo sirvió para comprobar la presencia (EC-08).
export interface MerchantClaim {
  accountId: string;
  establishmentId: string;
  responsibleName: string;
  nit: string | null;
  // Sin NIT, el comercio es informal (tienda de barrio sin RUT).
  informal: boolean;
  phone: string;
  acceptedTermsVersion: string;
  // pre_aprobado: la tienda era nueva y espera la aprobación de su propuesta (D2).
  status: 'pre_aprobado' | 'verificado';
  // null mientras está pre-aprobado.
  verifiedAt: Date | null;
}

// Puerto hacia el esquema commerce.
export interface MerchantClaimRepository {
  // La cuenta dueña de la tienda, o null si no tiene dueño.
  ownerOf(establishmentId: string): Promise<string | null>;
  // La tienda de la cuenta, o null si no tiene (una por cuenta, D3).
  establishmentOf(accountId: string): Promise<string | null>;
  // La solicitud de la cuenta, o null si no tiene tienda.
  findByAccount(accountId: string): Promise<MerchantClaim | null>;
  // La solicitud y sus eventos se confirman juntos o no se guarda ninguno (ADR-015).
  save(claim: MerchantClaim, events: DomainEvent[]): Promise<void>;
}

// Solicitud cerrada porque su tienda propuesta no se aprobó: sale de las activas, así la cuenta puede
// registrar otra tienda, y queda en el historial con el motivo.
export interface MerchantClaimRejection {
  accountId: string;
  establishmentId: string;
  reason: string;
  rejectedAt: Date;
}

// Puerto para resolver la solicitud pre-aprobada cuando se decide su tienda propuesta (D2).
export interface ProposedClaimResolutions extends Pick<MerchantClaimRepository, 'ownerOf'> {
  // La solicitud pre-aprobada de esa tienda propuesta, o null.
  pendingFor(establishmentId: string): Promise<MerchantClaim | null>;
  // La deja verificada en esa tienda, con sus eventos en la misma transacción (ADR-015).
  verify(
    accountId: string,
    establishmentId: string,
    verifiedAt: Date,
    events: DomainEvent[],
  ): Promise<void>;
  reject(rejection: MerchantClaimRejection): Promise<void>;
}
