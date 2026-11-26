/** Reglas de dependencia del monolito modular (ver .claude/rules/arquitectura-monolito-modular.md). */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'sin-ciclos',
      comment: 'Las dependencias circulares entre archivos o módulos están prohibidas.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-sin-dependencias',
      comment:
        'src/domain contiene reglas puras: no importa NestJS, Drizzle, pg, Express, módulos ni shared.',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { pathNot: '^src/domain/' },
    },
    {
      name: 'modulos-solo-por-index',
      comment: 'Un módulo solo importa de otro módulo a través de su index.ts.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'soporte-no-conoce-nucleo',
      comment:
        'Los módulos de soporte (identity, catalog, establishments, imports) no importan el núcleo (pricing, reliability, comparison) ni commerce.',
      severity: 'error',
      from: { path: '^src/modules/(identity|catalog|establishments|imports)/' },
      to: { path: '^src/modules/(pricing|reliability|comparison|commerce)/' },
    },
    {
      name: 'nucleo-no-conoce-commerce',
      comment: 'EC-05: el núcleo nunca depende del módulo comercial.',
      severity: 'error',
      from: { path: '^src/modules/(pricing|reliability|comparison)/' },
      to: { path: '^src/modules/commerce/' },
    },
    {
      name: 'nadie-conoce-notifications',
      comment:
        'ADR-044: ningún módulo importa notifications. Se alimenta del outbox y solo AppModule lo registra.',
      severity: 'error',
      from: {
        path: '^src/modules/(identity|catalog|establishments|imports|pricing|reliability|comparison|commerce)/',
      },
      to: { path: '^src/modules/notifications/' },
    },
    {
      name: 'fuera-de-modulos-solo-por-index',
      comment: 'El código fuera de src/modules solo importa el index.ts de cada módulo.',
      severity: 'error',
      from: { pathNot: '^src/modules/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: '^src/modules/[^/]+/index\\.ts$',
      },
    },
    {
      name: 'base-de-datos-solo-en-infraestructura',
      comment:
        'ADR-021: solo src/shared/database y las carpetas infrastructure/ (de shared y de cada módulo) importan drizzle-orm o pg.',
      severity: 'error',
      from: {
        pathNot: [
          '^src/shared/database/',
          '^src/shared/[^/]+/infrastructure/',
          '^src/modules/[^/]+/infrastructure/',
        ],
      },
      to: { path: '(^|/)node_modules/(drizzle-orm|pg)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
