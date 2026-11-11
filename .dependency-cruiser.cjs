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
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\.ts$'],
      },
    },
    {
      name: 'fuera-de-modulos-solo-por-index',
      comment: 'El código fuera de src/modules solo importa el index.ts de cada módulo.',
      severity: 'error',
      from: { pathNot: '^src/modules/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: '^src/modules/[^/]+/index\.ts$',
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: { path: '\.(spec|e2e-spec)\.ts$' },
  },
};
