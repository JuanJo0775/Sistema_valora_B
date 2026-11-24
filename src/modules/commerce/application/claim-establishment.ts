import { randomUUID } from 'node:crypto';
import { claimPathFor, type StoreType } from '../../../domain/chain-store';
import { DomainError } from '../../../domain/domain-error';
import {
  isAtEstablishment,
  isValidNit,
  NotAtEstablishmentError,
} from '../../../domain/merchant-claim';
import { createEvent } from '../../../shared/events';
import {
  type MerchantClaim,
  type MerchantClaimRepository,
  PRE_APPROVED_UNLOCKS,
} from './merchant-claims';

export { NotAtEstablishmentError } from '../../../domain/merchant-claim';

type Point = { lat: number; lng: number };

// Versión vigente de las condiciones para comercios que acepta quien registra su tienda (D2).
export const MERCHANT_TERMS_VERSION = '2026-11';

export interface ClaimEstablishmentPorts {
  // La tienda del mapa, por la interfaz pública de establishments.
  // El nombre y el tipo deciden si se puede reclamar y cómo (H11).
  establishments: {
    find(establishmentId: string): Promise<(Point & { name: string; type: StoreType }) | null>;
  };
  // Clave seudónima de la cuenta, la que lleva el caso de reclamo (EC-08).
  reporters: { keyOf(accountId: string): Promise<string> };
  claims: Pick<MerchantClaimRepository, 'ownerOf' | 'establishmentOf' | 'wasRevokedFrom' | 'save'>;
  // Precisión de D3 (#208): quien está en una tienda con dueño abre una disputa para el moderador.
  disputes: { open(establishmentId: string, accountId: string): Promise<void> };
  clock: { now(): Date };
}

export interface ClaimRequest {
  accountId: string;
  establishmentId: string;
  responsibleName: string;
  nit?: string;
  phone: string;
  acceptedTermsVersion: string;
  // Ubicación del celular en el momento: solo para comprobar la presencia, nunca se guarda (EC-08).
  location: Point;
}

export type ClaimResult =
  | { status: 'verificado'; establishmentId: string }
  // H11: supermercado que no es de cadena; espera la revisión del moderador.
  | { status: 'pre_aprobado'; establishmentId: string; unlocks: typeof PRE_APPROVED_UNLOCKS };

// Dato de entrada inválido: la capa HTTP lo traduce a 400 VALIDATION_ERROR.
export class InvalidNitError extends Error {
  constructor() {
    super('El NIT no es válido: revisa los números y el dígito de verificación.');
    this.name = 'InvalidNitError';
  }
}

// No es una regla de negocio: la capa HTTP la traduce a 404 NOT_FOUND.
export class EstablishmentNotFoundError extends Error {
  constructor() {
    super('La tienda no existe.');
    this.name = 'EstablishmentNotFoundError';
  }
}

// D3: una tienda tiene un solo dueño. La capa HTTP la traduce a 409; la disputa llega con B8.
export class EstablishmentHasOwnerError extends Error {
  readonly code = 'ESTABLISHMENT_HAS_OWNER';

  constructor() {
    super('Esta tienda ya está registrada por otra cuenta.');
    this.name = 'EstablishmentHasOwnerError';
  }
}

// H11 y ADR-037: las tiendas de cadena (D1, Ara, Éxito…) no se reclaman. La capa HTTP la traduce a 422.
export class ChainStoreNotClaimableError extends DomainError {
  readonly code = 'CHAIN_STORE_NOT_CLAIMABLE';

  constructor() {
    super(
      'Las tiendas de cadena, como D1, Ara o Éxito, no se pueden registrar como comercio: los precios de una cadena no los publica quien está cerca de una sucursal.',
    );
  }
}

// Precisión de D3 (#208): una cuenta revocada no vuelve a registrar esa tienda (422).
export class RevokedFromEstablishmentError extends DomainError {
  readonly code = 'REVOKED_FROM_ESTABLISHMENT';

  constructor() {
    super('Un moderador revocó tu registro de esta tienda: no puedes registrarla de nuevo.');
  }
}

// D3: una tienda por cuenta. La capa HTTP la traduce a 409.
export class AccountHasEstablishmentError extends Error {
  readonly code = 'ACCOUNT_HAS_ESTABLISHMENT';

  constructor() {
    super('Tu cuenta ya tiene una tienda registrada.');
    this.name = 'AccountHasEstablishmentError';
  }
}

// D3: identity lo recibe y cambia el rol a comercio. Va por el outbox para que el cambio no se pierda
// si falla una vez (ADR-015); identity no importa commerce, solo conoce el nombre del evento.
export const MERCHANT_VERIFIED = 'MerchantVerified';

const REVIEW_REASON =
  'Reclamo de un supermercado que no es de cadena: pendiente de revisión del moderador.';

// RF-015 con la D2 del grill comercial: una cuenta registra como suya una tienda del mapa.
export class ClaimEstablishment {
  constructor(private readonly ports: ClaimEstablishmentPorts) {}

  async execute(request: ClaimRequest): Promise<ClaimResult> {
    if (request.nit !== undefined && !isValidNit(request.nit)) throw new InvalidNitError();
    // H11: la cadena se rechaza antes de pedir la cercanía, para no dar una pista falsa.
    const path = await this.ensureClaimable(request);
    await this.ensureNoOwnership(request);
    const { claims, clock } = this.ports;
    const { accountId, establishmentId } = request;
    const claim: MerchantClaim = {
      accountId,
      establishmentId,
      responsibleName: request.responsibleName.trim(),
      nit: request.nit ?? null,
      informal: request.nit === undefined,
      phone: request.phone,
      acceptedTermsVersion: request.acceptedTermsVersion,
      status: 'verificado',
      verifiedAt: clock.now(),
    };
    if (path === 'revision') {
      // H11: queda pre-aprobado hasta que un moderador lo apruebe; el rol cambia entonces, no ahora.
      await claims.save({ ...claim, status: 'pre_aprobado', verifiedAt: null }, [], {
        id: randomUUID(),
        establishmentId,
        kind: 'reclamo',
        reporterKey: await this.ports.reporters.keyOf(accountId),
        reason: REVIEW_REASON,
        createdAt: clock.now(),
      });
      return { status: 'pre_aprobado', establishmentId, unlocks: PRE_APPROVED_UNLOCKS };
    }
    await claims.save(claim, [createEvent(MERCHANT_VERIFIED, 1, { accountId, establishmentId })]);
    return { status: 'verificado', establishmentId };
  }

  // D2 y H11: la tienda existe, no es de cadena y la persona está en ella. Devuelve el camino.
  private async ensureClaimable({
    establishmentId,
    location,
  }: ClaimRequest): Promise<'revision' | 'inmediata'> {
    const establishment = await this.ports.establishments.find(establishmentId);
    if (!establishment) throw new EstablishmentNotFoundError();
    const path = claimPathFor(establishment.name, establishment.type);
    if (path === 'cadena') throw new ChainStoreNotClaimableError();
    if (!isAtEstablishment(location, establishment)) throw new NotAtEstablishmentError();
    return path;
  }

  // D3: una tienda por cuenta y un dueño por tienda.
  private async ensureNoOwnership({ accountId, establishmentId }: ClaimRequest): Promise<void> {
    const { claims } = this.ports;
    if (await claims.wasRevokedFrom(accountId, establishmentId)) {
      throw new RevokedFromEstablishmentError();
    }
    if ((await claims.establishmentOf(accountId)) !== null) {
      throw new AccountHasEstablishmentError();
    }
    if ((await claims.ownerOf(establishmentId)) !== null) {
      await this.ports.disputes.open(establishmentId, accountId);
      throw new EstablishmentHasOwnerError();
    }
  }
}
