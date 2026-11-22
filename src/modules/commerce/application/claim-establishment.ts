import {
  isAtEstablishment,
  isValidNit,
  NotAtEstablishmentError,
} from '../../../domain/merchant-claim';
import { createEvent } from '../../../shared/events';
import type { MerchantClaimRepository } from './merchant-claims';

export { NotAtEstablishmentError } from '../../../domain/merchant-claim';

type Point = { lat: number; lng: number };

// Versión vigente de las condiciones para comercios que acepta quien registra su tienda (D2).
export const MERCHANT_TERMS_VERSION = '2026-11';

export interface ClaimEstablishmentPorts {
  // La tienda del mapa, por la interfaz pública de establishments.
  establishments: { find(establishmentId: string): Promise<Point | null> };
  claims: Pick<MerchantClaimRepository, 'ownerOf' | 'establishmentOf' | 'save'>;
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

export interface ClaimResult {
  status: 'verificado';
  establishmentId: string;
}

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

// RF-015 con la D2 del grill comercial: una cuenta registra como suya una tienda del mapa.
export class ClaimEstablishment {
  constructor(private readonly ports: ClaimEstablishmentPorts) {}

  async execute(request: ClaimRequest): Promise<ClaimResult> {
    if (request.nit !== undefined && !isValidNit(request.nit)) throw new InvalidNitError();
    await this.ensurePresence(request);
    await this.ensureNoOwnership(request);
    const { claims, clock } = this.ports;
    const { accountId, establishmentId } = request;
    await claims.save(
      {
        accountId: request.accountId,
        establishmentId: request.establishmentId,
        responsibleName: request.responsibleName.trim(),
        nit: request.nit ?? null,
        informal: request.nit === undefined,
        phone: request.phone,
        acceptedTermsVersion: request.acceptedTermsVersion,
        status: 'verificado',
        verifiedAt: clock.now(),
      },
      [createEvent(MERCHANT_VERIFIED, 1, { accountId, establishmentId })],
    );
    return { status: 'verificado', establishmentId: request.establishmentId };
  }

  // D2: la tienda existe en el mapa y la persona está en ella.
  private async ensurePresence({ establishmentId, location }: ClaimRequest): Promise<void> {
    const establishment = await this.ports.establishments.find(establishmentId);
    if (!establishment) throw new EstablishmentNotFoundError();
    if (!isAtEstablishment(location, establishment)) throw new NotAtEstablishmentError();
  }

  // D3: una tienda por cuenta y un dueño por tienda.
  private async ensureNoOwnership({ accountId, establishmentId }: ClaimRequest): Promise<void> {
    const { claims } = this.ports;
    if ((await claims.establishmentOf(accountId)) !== null) {
      throw new AccountHasEstablishmentError();
    }
    if ((await claims.ownerOf(establishmentId)) !== null) throw new EstablishmentHasOwnerError();
  }
}
