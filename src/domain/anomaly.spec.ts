import { ANOMALY_PARAMS, type AnomalyInput, assessAnomaly } from './anomaly';
import type { ScoredReport } from './report-window';

const now = new Date('2026-11-14T14:00:00Z');
const aYearAgo = new Date('2025-11-14T14:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

// Reporte de prueba: por defecto, precio normal recién visto.
const report = (
  reporterKey: string,
  priceCop: number,
  change: Partial<ScoredReport> = {},
): ScoredReport => ({ reporterKey, priceCop, priceType: 'normal', observedAt: now, ...change });

// Por defecto: TTL de 14 días y cuentas creadas hace un año.
const assess = (
  candidate: ScoredReport,
  others: ScoredReport[],
  change: Partial<AnomalyInput> = {},
) =>
  assessAnomaly({
    candidate,
    others,
    now,
    ttlDays: 14,
    accountCreatedAt: () => aYearAgo,
    ...change,
  });

describe('detección de precios anómalos', () => {
  it('con menos de 3 cuentas de referencia no marca: devuelve sin_datos y cuántas había', () => {
    const result = assess(report('ana', 2500), [report('beto', 5000), report('caro', 5100)]);

    expect(result).toEqual({ status: 'sin_datos', references: 2 });
  });

  // Tres cuentas de referencia alrededor de 5000.
  const usual = () => [report('beto', 4900), report('caro', 5000), report('dani', 5100)];

  it('un precio dentro del 40 % de la mediana es normal, con la mediana, la desviación y las referencias', () => {
    const result = assess(report('ana', 4500), usual());

    expect(result).toEqual({ status: 'normal', median: 5000, deviation: 0.1, references: 3 });
  });

  it.each([
    ['hacia abajo', 2500, 0.5],
    ['hacia arriba', 7500, 0.5],
  ])(
    'un precio que se aparta más del 40 %% %s es sospechoso por rango',
    (_case, priceCop, deviation) => {
      expect(assess(report('ana', priceCop), usual())).toEqual({
        status: 'sospechoso',
        reason: 'rango',
        median: 5000,
        deviation,
        references: 3,
      });
    },
  );

  it('un precio que se aparta justo el 40 % no se marca (RF-012 dice «más de»)', () => {
    expect(assess(report('ana', 3000), usual())).toMatchObject({
      status: 'normal',
      deviation: 0.4,
    });
  });

  it('con un número par de referencias, la mediana es el promedio de los dos del medio', () => {
    const four = [
      report('beto', 4000),
      report('caro', 4100),
      report('dani', 4200),
      report('eli', 9000),
    ];

    expect(assess(report('ana', 4150), four)).toMatchObject({ median: 4150, deviation: 0 });
  });

  it('solo cuentan como referencia los reportes de la ventana, del mismo tipo, de otras cuentas y uno por cuenta', () => {
    const result = assess(report('ana', 2500), [
      ...usual(),
      report('ana', 2500, { observedAt: daysAgo(1) }),
      report('eli', 2400, { priceType: 'oferta' }),
      report('fer', 2500, { observedAt: daysAgo(20) }),
      report('beto', 9000, { observedAt: daysAgo(3) }),
    ]);

    expect(result).toMatchObject({ status: 'sospechoso', median: 5000, references: 3 });
  });

  describe('grupos coordinados (RN3)', () => {
    const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000);
    // Cuentas «nueva-…» creadas hoy; las demás, hace un año.
    const accountCreatedAt = (key: string) => (key.startsWith('nueva') ? daysAgo(0.5) : aYearAgo);
    // Seis cuentas nuevas reportan 1500 en 10 minutos: dentro de la referencia, mueven la mediana.
    const group = () =>
      ['nueva-2', 'nueva-3', 'nueva-4', 'nueva-5', 'nueva-6'].map((key, minute) =>
        report(key, 1500, { observedAt: minutesAgo(minute * 2) }),
      );

    it('cuentas nuevas que reportan juntas un precio raro son sospechosas por coordinación', () => {
      const result = assess(report('nueva-1', 1500), [...usual(), ...group()], {
        accountCreatedAt,
      });

      expect(result).toEqual({
        status: 'sospechoso',
        reason: 'coordinacion',
        median: 5000,
        deviation: 0.7,
        references: 3,
      });
    });

    it('cuentas nuevas que coinciden con el precio habitual no son sospechosas', () => {
      const honestNewcomers = ['nueva-2', 'nueva-3'].map((key) => report(key, 5000));

      const result = assess(report('nueva-1', 5000), [...usual(), ...honestNewcomers], {
        accountCreatedAt,
      });

      expect(result).toMatchObject({ status: 'normal' });
    });

    it('cuentas antiguas, o reportes separados por más de 60 minutos, no forman grupo coordinado', () => {
      const oldAccounts = ['vieja-2', 'vieja-3', 'vieja-4'].map((key) => report(key, 1500));
      const spreadOut = ['nueva-2', 'nueva-3'].map((key, hour) =>
        report(key, 1500, { observedAt: minutesAgo((hour + 1) * 90) }),
      );

      const old = assess(report('vieja-1', 1500), [...usual(), ...oldAccounts], {
        accountCreatedAt,
      });
      const apart = assess(report('nueva-1', 1500), [...usual(), ...spreadOut], {
        accountCreatedAt,
      });

      expect(old).not.toMatchObject({ reason: 'coordinacion' });
      expect(apart).not.toMatchObject({ reason: 'coordinacion' });
    });

    it('si un reporte cumple rango y coordinación, gana coordinación', () => {
      // Con solo dos cuentas del grupo, la mediana no se mueve y el rango también lo marcaría.
      const smallGroup = ['nueva-2', 'nueva-3'].map((key) => report(key, 1500));

      const result = assess(report('nueva-1', 1500), [...usual(), ...smallGroup], {
        accountCreatedAt,
      });

      expect(result).toMatchObject({ status: 'sospechoso', reason: 'coordinacion' });
    });

    it('si sin el grupo quedan menos de 3 cuentas de referencia, no se puede evaluar: sin_datos', () => {
      const result = assess(report('nueva-1', 1500), [report('beto', 5000), ...group()], {
        accountCreatedAt,
      });

      expect(result).toEqual({ status: 'sin_datos', references: 1 });
    });
  });
});

describe('referencias de la zona (grill de la #31, pregunta 7)', () => {
  it('con menos de 3 cuentas en la tienda, completa la referencia con las tiendas de la zona', () => {
    const store = [report('beto', 5000)];
    const zone = [report('caro', 4900), report('dani', 5100)];

    expect(assess(report('ana', 2500), store, { zone })).toEqual({
      status: 'sospechoso',
      reason: 'rango',
      median: 5000,
      deviation: 0.5,
      references: 3,
    });
  });

  it('si la tienda ya tiene 3 cuentas, la zona no cuenta', () => {
    const store = [report('beto', 2400), report('caro', 2500), report('dani', 2600)];
    const zone = [report('eli', 5000), report('fer', 5000), report('gabi', 5000)];

    expect(assess(report('ana', 2500), store, { zone })).toMatchObject({
      status: 'normal',
      median: 2500,
      references: 3,
    });
  });

  it('la coordinación solo mira la misma tienda: cuentas nuevas de otras tiendas no forman grupo (RF-012)', () => {
    const createdToday = (key: string) => (key.startsWith('nueva') ? daysAgo(0.2) : aYearAgo);
    const store = [report('beto', 1500)];
    // Dos cuentas nuevas reportan el mismo precio, pero en otras tiendas de la zona.
    const zone = [
      report('nueva-2', 1500),
      report('nueva-3', 1500),
      report('caro', 5000),
      report('dani', 5100),
      report('eli', 4900),
    ];

    const result = assess(report('nueva-1', 1500), store, {
      zone,
      accountCreatedAt: createdToday,
    });

    expect(result).not.toMatchObject({ reason: 'coordinacion' });
  });
});

describe('reportes en revisión (calibración de la #67)', () => {
  it('los reportes ya en revisión ayudan a formar un grupo pero no mueven la mediana', () => {
    const createdToday = (key: string) => (key.startsWith('nueva') ? daysAgo(0.2) : aYearAgo);
    const usual = [report('beto', 9700), report('caro', 9750), report('dani', 9800)];
    // Un ataque anterior en la tienda: 4 cuentas nuevas a 2500, ya en revisión.
    const flagged = ['nueva-2', 'nueva-3', 'nueva-4', 'nueva-5'].map((key) => report(key, 2500));

    const honestLater = assess(report('eli', 9800), usual, {
      flagged,
      accountCreatedAt: createdToday,
    });
    const nextAttacker = assess(report('nueva-1', 2500), usual, {
      flagged,
      accountCreatedAt: createdToday,
    });

    expect(honestLater).toMatchObject({ status: 'normal', median: 9750, references: 3 });
    expect(nextAttacker).toMatchObject({ status: 'sospechoso', reason: 'coordinacion' });
  });
});

describe('garantías de la detección', () => {
  const usual = () => [report('beto', 4900), report('caro', 5000), report('dani', 5100)];

  it('no modifica la lista que recibe: la detección nunca borra reportes (RN4)', () => {
    const others = usual();
    const before = structuredClone(others);

    assess(report('ana', 2500), others);

    expect(others).toEqual(before);
  });

  it('la salida no contiene ninguna clave de reportante (EC-08)', () => {
    const result = assess(report('cuenta-secreta-ana', 2500), [
      report('cuenta-secreta-beto', 4900),
      report('cuenta-secreta-caro', 5000),
      report('cuenta-secreta-dani', 5100),
    ]);

    expect(JSON.stringify(result)).not.toContain('cuenta-secreta');
  });

  it('con otros parámetros el resultado cambia: nada está fijo en el código (RN6)', () => {
    const strict = { ...ANOMALY_PARAMS, maxDeviation: 0.05 };

    expect(
      assessAnomaly(
        {
          candidate: report('ana', 4500),
          others: usual(),
          now,
          ttlDays: 14,
          accountCreatedAt: () => aYearAgo,
        },
        strict,
      ),
    ).toMatchObject({ status: 'sospechoso', reason: 'rango' });
  });

  describe('escenarios de RF-012 (Notion)', () => {
    it('precio fuera de rango: con mediana de 5000, un reporte de 2500 queda en revisión', () => {
      expect(assess(report('ana', 2500), usual())).toMatchObject({ status: 'sospechoso' });
    });

    it('grupo coordinado: 4 cuentas creadas hoy que reportan 1500 en 10 minutos quedan en revisión', () => {
      const createdToday = (key: string) => (key.startsWith('hoy') ? daysAgo(0.2) : aYearAgo);
      const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000);
      const four = ['hoy-1', 'hoy-2', 'hoy-3', 'hoy-4'].map((key, index) =>
        report(key, 1500, { observedAt: minutesAgo(index * 3) }),
      );

      for (const candidate of four) {
        const others = [...usual(), ...four.filter((other) => other !== candidate)];
        expect(assess(candidate, others, { accountCreatedAt: createdToday })).toMatchObject({
          status: 'sospechoso',
          reason: 'coordinacion',
        });
      }
    });
  });
});
