import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { SessionGuard } from '../../src/modules/identity';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];
// Clave con la que @Roles guarda los roles (identity/http/session.guard.ts).
const ROLES_KEY = 'identity.roles';

export interface RouteInfo {
  // «MÉTODO /ruta/:param», sin el prefijo /v1.
  route: string;
  guarded: boolean;
  roles: unknown;
}

const joinPath = (...parts: string[]) =>
  `/${parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/')}`;

// Las rutas que declaran los controladores de la aplicación (guardián de rutas #33 y contrato #25).
export function routesOf(app: INestApplication): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: never[]) => object) | null;
      if (!controller) continue;
      const base = (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? '';
      const classGuards =
        (Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[] | undefined) ?? [];
      const prototype = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (method === undefined || path === undefined) continue;
        const guards = [
          ...classGuards,
          ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined) ?? []),
        ];
        routes.push({
          route: `${HTTP_METHODS[method] ?? String(method)} ${joinPath(base, path)}`,
          guarded: guards.includes(SessionGuard),
          roles: Reflect.getMetadata(ROLES_KEY, handler),
        });
      }
    }
  }
  return routes;
}
