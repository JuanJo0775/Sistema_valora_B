import { InvalidObservationDateError } from '../../../domain/freshness';
import type { DomainEvent } from '../../../shared/events';
import type { NewReport, RecentReport, ReportRepository, SavedReport } from './report-repository';
import {
  DuplicateReportError,
  TooManyReportsError,
  IdempotencyKeyReusedError,
  RegisterReport,
  UnknownEstablishmentError,
  UnknownPresentationError,
} from './register-report';

const presentationId = '11111111-1111-4111-8111-111111111111';
const establishmentId = '22222222-2222-4222-8222-222222222222';
const missing = '99999999-9999-4999-8999-999999999999';
const now = new Date('2026-11-12T14:00:00Z');

// Repositorio en memoria: doble del puerto, sin base de datos.
class InMemoryReportRepository implements ReportRepository {
  readonly reports: NewReport[] = [];
  readonly events: DomainEvent[] = [];

  findByIdempotencyKey(key: string): Promise<NewReport | null> {
    return Promise.resolve(this.reports.find((report) => report.idempotencyKey === key) ?? null);
  }

  save(report: NewReport, events: DomainEvent[]): Promise<SavedReport> {
    this.reports.push(report);
    this.events.push(...events);
    return Promise.resolve({ report, created: true });
  }

  recentOf(reporterId: string, since: Date): Promise<RecentReport[]> {
    return Promise.resolve(
      this.reports
        .filter((report) => report.reporterId === reporterId && report.receivedAt > since)
        .map(({ id, presentationId, establishmentId, observedAt, receivedAt }) => ({
          id,
          presentationId,
          establishmentId,
          observedAt,
          receivedAt,
        })),
    );
  }

  observedBetween(reporterId: string, from: Date, to: Date): Promise<RecentReport[]> {
    return Promise.resolve(
      this.reports
        .filter(
          (report) =>
            report.reporterId === reporterId &&
            report.observedAt >= from &&
            report.observedAt <= to,
        )
        .map(({ id, presentationId, establishmentId, observedAt, receivedAt }) => ({
          id,
          presentationId,
          establishmentId,
          observedAt,
          receivedAt,
        })),
    );
  }
}

function setup(clock = { now: () => now }) {
  const reports = new InMemoryReportRepository();
  const registerReport = new RegisterReport({
    reports,
    // Existe todo salvo `missing`: así una cuenta puede reportar en muchas tiendas.
    presentations: { exists: (id) => Promise.resolve(id !== missing) },
    establishments: { exists: (id) => Promise.resolve(id !== missing) },
    reporters: {
      of: () => Promise.resolve({ reporterKey: 'clave-seudonima', reporterSince: '2026-11-01' }),
    },
    clock,
  });
  return { reports, registerReport };
}

const reporterId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const report = {
  reporterId,
  presentationId,
  establishmentId,
  priceCop: 4500,
  priceType: 'normal' as const,
  observedAt: new Date('2026-11-12T13:30:00Z'),
};

describe('registrar un reporte de precio', () => {
  it('lo recibe con estado recibido y la hora del servidor como hora de llegada', async () => {
    const { reports, registerReport } = setup();

    const result = await registerReport.execute({
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      report,
    });

    expect(result).toEqual({
      created: true,
      receipt: { id: expect.any(String) as string, status: 'recibido', receivedAt: now },
    });
    expect(reports.reports[0]).toMatchObject({ ...report, receivedAt: now });
  });

  it('rechaza una presentación o una tienda que no existen, sin guardar nada', async () => {
    const { reports, registerReport } = setup();

    await expect(
      registerReport.execute({
        idempotencyKey: '44444444-4444-4444-8444-444444444444',
        report: { ...report, presentationId: missing },
      }),
    ).rejects.toThrow(UnknownPresentationError);
    await expect(
      registerReport.execute({
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
        report: { ...report, establishmentId: missing },
      }),
    ).rejects.toThrow(UnknownEstablishmentError);
    expect(reports.reports).toHaveLength(0);
  });

  it('rechaza un precio visto en el futuro, sin guardar nada', async () => {
    const { reports, registerReport } = setup();

    await expect(
      registerReport.execute({
        idempotencyKey: '66666666-6666-4666-8666-666666666666',
        report: { ...report, observedAt: new Date('2026-11-12T14:10:00Z') },
      }),
    ).rejects.toThrow(InvalidObservationDateError);
    expect(reports.reports).toHaveLength(0);
  });

  it('un reintento con la misma clave y el mismo reporte devuelve el recibo original sin duplicar', async () => {
    const { reports, registerReport } = setup();
    const command = { idempotencyKey: '77777777-7777-4777-8777-777777777777', report };

    const first = await registerReport.execute(command);
    const retry = await registerReport.execute(command);

    expect(retry).toEqual({ receipt: first.receipt, created: false });
    expect(reports.reports).toHaveLength(1);
    expect(reports.events).toHaveLength(1);
  });

  it('la misma clave con otro reporte se rechaza como clave reutilizada', async () => {
    const { reports, registerReport } = setup();
    const idempotencyKey = '88888888-8888-4888-8888-888888888888';

    await registerReport.execute({ idempotencyKey, report });

    await expect(
      registerReport.execute({ idempotencyKey, report: { ...report, priceCop: 5000 } }),
    ).rejects.toThrow(IdempotencyKeyReusedError);
    expect(reports.reports).toHaveLength(1);
  });

  it('guarda la cuenta que lo reportó; la misma clave usada por otra cuenta es un conflicto', async () => {
    const { reports, registerReport } = setup();
    const idempotencyKey = '99999999-9999-4999-8999-111111111111';

    await registerReport.execute({ idempotencyKey, report });

    expect(reports.reports[0]?.reporterId).toBe(reporterId);
    await expect(
      registerReport.execute({
        idempotencyKey,
        report: { ...report, reporterId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      }),
    ).rejects.toThrow(IdempotencyKeyReusedError);
  });

  // Grill de la #29, pregunta 2: una cuenta no infla sus propias confirmaciones.
  describe('duplicados', () => {
    const minutesLater = (minutes: number) => new Date(now.getTime() + minutes * 60 * 1000);

    it('la misma cuenta, presentación y tienda en 60 minutos con otra clave es un duplicado', async () => {
      let current = now;
      const { reports, registerReport } = setup({ now: () => current });
      await registerReport.execute({ idempotencyKey: 'clave-1', report });

      current = minutesLater(59);
      await expect(
        registerReport.execute({
          idempotencyKey: 'clave-2',
          report: { ...report, priceCop: 4600 },
        }),
      ).rejects.toThrow(DuplicateReportError);
      expect(reports.reports).toHaveLength(1);
    });

    // Grill de la #30, pregunta 2: el duplicado compara horas de observación, no de llegada.
    it('observaciones a más de 60 minutos, o de otra cuenta, no son duplicado aunque lleguen juntas', async () => {
      const { reports, registerReport } = setup();
      const seenAt = (minutesBefore: number) => new Date(now.getTime() - minutesBefore * 60 * 1000);

      await registerReport.execute({
        idempotencyKey: 'clave-1',
        report: { ...report, observedAt: seenAt(180) },
      });
      await registerReport.execute({
        idempotencyKey: 'clave-2',
        report: { ...report, observedAt: seenAt(110) },
      });
      await registerReport.execute({
        idempotencyKey: 'clave-3',
        report: {
          ...report,
          observedAt: seenAt(110),
          reporterId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        },
      });

      expect(reports.reports).toHaveLength(3);
    });

    it('una observación a menos de 60 minutos de otra es duplicado, aunque llegue mucho después', async () => {
      let current = now;
      const { reports, registerReport } = setup({ now: () => current });
      await registerReport.execute({ idempotencyKey: 'clave-1', report });

      current = minutesLater(300);
      await expect(
        registerReport.execute({
          idempotencyKey: 'clave-2',
          report: { ...report, observedAt: new Date(report.observedAt.getTime() + 50 * 60 * 1000) },
        }),
      ).rejects.toThrow(DuplicateReportError);
      expect(reports.reports).toHaveLength(1);
    });

    it('el reintento con la misma clave sigue devolviendo su recibo', async () => {
      const { registerReport } = setup();
      const first = await registerReport.execute({ idempotencyKey: 'clave-1', report });

      await expect(registerReport.execute({ idempotencyKey: 'clave-1', report })).resolves.toEqual({
        receipt: first.receipt,
        created: false,
      });
    });
  });

  // RF-012 RN2 y grill de la #29, pregunta 3.
  describe('ráfagas', () => {
    // n reportes de la misma cuenta, uno por minuto y cada uno en una tienda distinta.
    const reportMany = async (registerReport: RegisterReport, n: number, advance: () => void) => {
      for (let index = 0; index < n; index += 1) {
        await registerReport.execute({
          idempotencyKey: `clave-${String(index)}`,
          report: { ...report, establishmentId: `tienda-${String(index)}` },
        });
        advance();
      }
    };

    it('el reporte 21 de la hora se rechaza con los segundos de espera y no se guarda', async () => {
      let current = now;
      const { reports, registerReport } = setup({ now: () => current });
      await reportMany(registerReport, 20, () => {
        current = new Date(current.getTime() + 60 * 1000);
      });

      const attempt = registerReport.execute({
        idempotencyKey: 'clave-21',
        report: { ...report, establishmentId: 'tienda-21' },
      });

      await expect(attempt).rejects.toThrow(TooManyReportsError);
      // Grill de la #30: cuenta por la hora de observación. Los 20 y el nuevo se vieron a las 13:30:
      // la próxima observación puede entrar desde las 14:30.
      await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: 60 * 60 });
      expect(reports.reports).toHaveLength(20);
    });

    it('al aceptar el reporte 20 avisa a moderación con la clave seudónima y los reportes de esa hora', async () => {
      let current = now;
      const { reports, registerReport } = setup({ now: () => current });
      const advance = () => {
        current = new Date(current.getTime() + 60 * 1000);
      };
      const bursts = () => reports.events.filter((event) => event.type === 'ReportBurstDetected');

      await reportMany(registerReport, 19, advance);
      expect(bursts()).toEqual([]);
      await registerReport.execute({
        idempotencyKey: 'clave-20',
        report: { ...report, establishmentId: 'tienda-20' },
      });

      expect(bursts()).toEqual([
        expect.objectContaining({
          version: 1,
          payload: {
            reporterKey: 'clave-seudonima',
            reportIds: reports.reports.map((saved) => saved.id),
          },
        }),
      ]);
      expect(JSON.stringify(bursts())).not.toContain(reporterId);
    });
  });
});
