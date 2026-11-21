import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { isValidDisplayName, normalizeDisplayName } from '../../../domain/display-name';
import type { AccountDeletionRepository } from './account-deletion-repository';
import type { Account, AccountRepository } from './account-repository';
import { type AttemptLimiter, TooManyAttemptsError } from './attempt-limiter';
import type { Clock } from './clock';
import type { ExternalIdentityRepository } from './external-identity-repository';
import type { GoogleIdentity, OidcProvider } from './google-oidc';
import { CURRENT_POLICY_VERSION } from './policy';
import { normalizeEmail } from './register-account';
import { sanitizeReturnTo } from './return-to';
import type { SessionRepository } from './session-repository';
import { startSession } from './start-session';

// Lo que el inicio guarda en la cookie firmada y de corta vida, y el retorno recupera (ADR-033).
export interface OidcFlow {
  state: string;
  nonce: string;
  codeVerifier: string;
  // Solo si coincidía con la versión vigente de la política; null si no vino o era otra.
  acceptPolicy: string | null;
  returnTo: string;
  // Origen de la PWA (esquema y host) por el que la persona empezó: donde se le devuelve.
  origin: string;
  // Dirección de retorno que se le dijo a Google; el intercambio debe repetirla exacta.
  redirectUri: string;
  createdAt: number;
}

// Vigencia del flujo: la persona tiene 10 minutos para elegir su cuenta en Google.
export const OIDC_FLOW_MINUTES = 10;

// Límites por IP (provisionales): navegar a «continuar con Google» no es un intento de contraseña, pero
// cada vuelta cuesta una llamada a Google y una escritura.
export const GOOGLE_START_PER_IP = { limit: 30, windowMinutes: 15 };
export const GOOGLE_CALLBACK_PER_IP = { limit: 30, windowMinutes: 15 };

// Códigos que el frontend recibe en `?google=`. Nunca llevan detalles internos.
export type GoogleFailure = 'cancelado' | 'fallo' | 'consentimiento' | 'suspendida';

export type GoogleSignInOutcome =
  | { status: 'signed-in'; token: string; expiresAt: Date; returnTo: string; origin: string }
  // `detail`: motivo interno, solo para el registro del servidor; nunca viaja al navegador.
  | { status: 'failed'; failure: GoogleFailure; detail: string; origin: string | null };

const base64Url = (bytes: Buffer): string => bytes.toString('base64url');

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isSuspended(account: Account, now: Date): boolean {
  return account.suspendedUntil !== null && account.suspendedUntil > now;
}

export interface StartGoogleSignInPorts {
  oidc: OidcProvider;
  limiter: AttemptLimiter;
  clock: Clock;
}

export interface StartGoogleSignInInput {
  acceptPolicy?: string;
  returnTo?: string;
  origin: string;
  redirectUri: string;
  ip: string;
}

// Paso 1: prepara el flujo (state, nonce y PKCE aleatorios) y la dirección de Google.
export class StartGoogleSignIn {
  constructor(private readonly ports: StartGoogleSignInPorts) {}

  execute(input: StartGoogleSignInInput): { redirectUrl: string; flow: OidcFlow } {
    const { limiter, clock, oidc } = this.ports;
    const ipKey = `google-inicio-ip:${input.ip}`;
    const wait = limiter.retryAfterSeconds(ipKey, GOOGLE_START_PER_IP);
    if (wait !== null) throw new TooManyAttemptsError(wait);
    limiter.record(ipKey, GOOGLE_START_PER_IP);

    const codeVerifier = base64Url(randomBytes(32));
    const flow: OidcFlow = {
      state: base64Url(randomBytes(32)),
      nonce: base64Url(randomBytes(32)),
      codeVerifier,
      acceptPolicy: input.acceptPolicy === CURRENT_POLICY_VERSION ? input.acceptPolicy : null,
      returnTo: sanitizeReturnTo(input.returnTo),
      origin: input.origin,
      redirectUri: input.redirectUri,
      createdAt: clock.now().getTime(),
    };
    const redirectUrl = oidc.authorizationUrl({
      state: flow.state,
      nonce: flow.nonce,
      codeChallenge: base64Url(createHash('sha256').update(codeVerifier).digest()),
      redirectUri: flow.redirectUri,
    });
    return { redirectUrl, flow };
  }
}

export interface CompleteGoogleSignInPorts {
  oidc: OidcProvider;
  accounts: AccountRepository;
  identities: ExternalIdentityRepository;
  deletion: AccountDeletionRepository;
  sessions: SessionRepository;
  limiter: AttemptLimiter;
  clock: Clock;
}

export interface CompleteGoogleSignInInput {
  code?: string;
  state?: string;
  // `error` de Google (p. ej. access_denied) cuando la persona cancela.
  error?: string;
  // El flujo de la cookie firmada, o null si no vino, no es nuestra o venció.
  flow: OidcFlow | null;
  ip: string;
}

// Nombre visible de una cuenta nueva: el de Google si cabe en la regla de #133; si no, la parte local del
// correo si cabe; si no, ninguno (la cuenta existe igual, sin nombre).
export function displayNameFrom(name: string | null, email: string): string | null {
  for (const candidate of [name ?? '', email.split('@')[0] ?? '']) {
    const normalized = normalizeDisplayName(candidate);
    if (isValidDisplayName(normalized)) return normalized;
  }
  return null;
}

type Fail = (failure: GoogleFailure, detail: string) => GoogleSignInOutcome;

// Paso 2: el retorno de Google. Nunca lanza por un dato malo: devuelve el resultado y el controlador
// redirige siempre al frontend.
export class CompleteGoogleSignIn {
  constructor(private readonly ports: CompleteGoogleSignInPorts) {}

  async execute(input: CompleteGoogleSignInInput): Promise<GoogleSignInOutcome> {
    const { limiter, clock } = this.ports;
    const origin = input.flow?.origin ?? null;
    const fail: Fail = (failure, detail) => ({ status: 'failed', failure, detail, origin });

    const ipKey = `google-retorno-ip:${input.ip}`;
    if (limiter.retryAfterSeconds(ipKey, GOOGLE_CALLBACK_PER_IP) !== null) {
      return fail('fallo', 'límite por IP');
    }
    limiter.record(ipKey, GOOGLE_CALLBACK_PER_IP);

    if (input.error !== undefined) {
      return input.error === 'access_denied'
        ? fail('cancelado', 'la persona canceló en Google')
        : fail('fallo', 'Google devolvió un error');
    }
    const { flow } = input;
    if (!flow) return fail('fallo', 'sin cookie del flujo');
    const ageMs = clock.now().getTime() - flow.createdAt;
    if (ageMs < 0 || ageMs > OIDC_FLOW_MINUTES * 60 * 1000) return fail('fallo', 'flujo vencido');
    if (typeof input.state !== 'string' || !sameText(input.state, flow.state)) {
      return fail('fallo', 'state distinto');
    }
    if (typeof input.code !== 'string' || input.code.length === 0) return fail('fallo', 'sin code');

    let identity: GoogleIdentity;
    try {
      identity = await this.ports.oidc.exchangeCode({
        code: input.code,
        codeVerifier: flow.codeVerifier,
        redirectUri: flow.redirectUri,
      });
    } catch (error) {
      return fail('fallo', error instanceof Error ? error.message : 'intercambio fallido');
    }
    if (identity.nonce === null || !sameText(identity.nonce, flow.nonce)) {
      return fail('fallo', 'nonce distinto');
    }
    if (identity.emailVerified !== true) return fail('fallo', 'correo sin verificar en Google');
    if (!identity.subject || !identity.email) return fail('fallo', 'faltan sub o correo');

    try {
      return await this.signIn(identity, flow, fail);
    } catch (error) {
      return fail('fallo', error instanceof Error ? error.message : 'error al iniciar la sesión');
    }
  }

  private async signIn(
    identity: GoogleIdentity,
    flow: OidcFlow,
    fail: Fail,
  ): Promise<GoogleSignInOutcome> {
    const { accounts, identities, deletion, clock } = this.ports;
    const now = clock.now();
    const email = normalizeEmail(identity.email);

    // 1. Ya enlazada por `sub`: manda el `sub`, aunque el correo de Google haya cambiado.
    let account = await identities.findAccountBySubject('google', identity.subject);

    if (!account) {
      account = await accounts.findByEmail(email);
      if (account) {
        // 2. Hay una cuenta con ese correo: se enlaza.
        if (isSuspended(account, now)) return fail('suspendida', 'cuenta suspendida');
        // Un correo reciclado en Google tendría otro `sub`: no se enlaza una segunda identidad.
        if (await identities.hasIdentity(account.id, 'google')) {
          return fail('fallo', 'la cuenta ya tiene otra identidad de Google');
        }
        // Anti pre-secuestro: si el correo nunca se verificó, quien lo registró pudo no ser su dueño.
        await identities.link({
          accountId: account.id,
          provider: 'google',
          subject: identity.subject,
          now,
          claimUnverified: account.emailVerifiedAt === null,
        });
      } else {
        // 3. Cuenta nueva: exige el consentimiento de la política (RF-001, Ley 1581).
        if (flow.acceptPolicy === null) return fail('consentimiento', 'falta aceptar la política');
        account = {
          id: randomUUID(),
          email,
          passwordHash: null,
          role: 'reportante',
          suspendedUntil: null,
          deletionScheduledFor: null,
          emailVerifiedAt: now,
        };
        await identities.createWithIdentity({
          account: {
            id: account.id,
            email,
            displayName: displayNameFrom(identity.name, email),
            passwordHash: null,
            role: 'reportante',
            policyVersion: flow.acceptPolicy,
            policyAcceptedAt: now,
            emailVerifiedAt: now,
          },
          provider: 'google',
          subject: identity.subject,
          now,
        });
      }
    }

    if (isSuspended(account, now)) return fail('suspendida', 'cuenta suspendida');

    // ADR-032: completar Google demuestra la identidad; la eliminación pendiente se cancela.
    if (account.deletionScheduledFor && !(await deletion.cancel(account.id))) {
      return fail('fallo', 'la cuenta ya se purgó');
    }

    const { token, expiresAt } = await startSession(this.ports, account.id);
    return { status: 'signed-in', token, expiresAt, returnTo: flow.returnTo, origin: flow.origin };
  }
}
