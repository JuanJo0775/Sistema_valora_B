import { isAtEstablishment, isValidNit } from '../../../domain/merchant-claim';
import type { MerchantClaimRepository } from './merchant-claims';

type Point = { lat: number; lng: number };

export interface ClaimEstablishmentPorts {
  // La tienda del mapa, por la interfaz pública de establishments.
  establishments: { find(establishmentId: string): Promise<Point | null> };
  claims: MerchantClaimRepository;
  // Cambio de rol reportante → comercio, por la interfaz pública de identity (D3).
  roles: { grantMerchant(accountId: string): Promise<void> };
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

// Regla de negocio incumplida: la capa HTTP la traduce a 422.
export class NotAtEstablishmentError extends Error {
  readonly code = 'NOT_AT_ESTABLISHMENT';

  constructor() {
    super('Para registrar la tienda tienes que estar en ella: tu ubicación está a más de 50 m.');
    this.name = 'NotAtEstablishmentError';
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

// RF-015 con la D2 del grill comercial: una cuenta registra como suya una tienda del mapa.
export class ClaimEstablishment {
  constructor(private readonly ports: ClaimEstablishmentPorts) {}

  async execute(request: ClaimRequest): Promise<ClaimResult> {
    if (request.nit !== undefined && !isValidNit(request.nit)) throw new InvalidNitError();
    const { establishments, claims, roles, clock } = this.ports;
    const establishment = await establishments.find(request.establishmentId);
    if (!establishment) throw new EstablishmentNotFoundError();
    if (!isAtEstablishment(request.location, establishment)) {
      throw new NotAtEstablishmentError();
    }
    if ((await claims.establishmentOf(request.accountId)) !== null) {
      throw new AccountHasEstablishmentError();
    }
    if ((await claims.ownerOf(request.establishmentId)) !== null) {
      throw new EstablishmentHasOwnerError();
    }
    await claims.save({
      accountId: request.accountId,
      establishmentId: request.establishmentId,
      responsibleName: request.responsibleName.trim(),
      nit: request.nit ?? null,
      informal: request.nit === undefined,
      phone: request.phone,
      acceptedTermsVersion: request.acceptedTermsVersion,
      status: 'verificado',
      verifiedAt: clock.now(),
    });
    await roles.grantMerchant(request.accountId);
    return { status: 'verificado', establishmentId: request.establishmentId };
  }
}
