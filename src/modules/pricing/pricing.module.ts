import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { OutboxPublisher } from '../../shared/events';
import {
  CatalogModule,
  PresentationExists,
  PresentationsForPricing,
  WholesaleReferenceOf,
} from '../catalog';
import { ComparisonModule, PeerPrices } from '../comparison';
import {
  EstablishmentDetails,
  EstablishmentExists,
  EstablishmentsModule,
  EstablishmentsWithinRadius,
} from '../establishments';
import { IdentityModule, ReporterIdentity } from '../identity';
import { GatherPlausibilityContext } from './application/gather-plausibility-context';
import { RegisterReport } from './application/register-report';
import { REPORT_REPOSITORY, type ReportRepository } from './application/report-repository';
import { ReportsController } from './http/reports.controller';
import { DrizzleReportRepository } from './infrastructure/drizzle-report-repository';

@Module({
  imports: [CatalogModule, ComparisonModule, EstablishmentsModule, IdentityModule],
  controllers: [ReportsController],
  providers: [
    {
      provide: REPORT_REPOSITORY,
      inject: [DATABASE, OutboxPublisher],
      useFactory: (db: Database, outbox: OutboxPublisher): ReportRepository =>
        new DrizzleReportRepository(db, outbox),
    },
    // ADR-030: la referencia de plausibilidad (otras tiendas del municipio y SIPSA).
    {
      provide: GatherPlausibilityContext,
      inject: [
        EstablishmentDetails,
        EstablishmentsWithinRadius,
        PeerPrices,
        PresentationsForPricing,
        WholesaleReferenceOf,
      ],
      useFactory: (
        stores: EstablishmentDetails,
        inMunicipality: EstablishmentsWithinRadius,
        peers: PeerPrices,
        presentations: PresentationsForPricing,
        references: WholesaleReferenceOf,
      ): GatherPlausibilityContext =>
        new GatherPlausibilityContext({
          stores,
          inMunicipality,
          peers,
          presentations,
          references,
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: RegisterReport,
      inject: [
        REPORT_REPOSITORY,
        PresentationExists,
        EstablishmentExists,
        ReporterIdentity,
        GatherPlausibilityContext,
      ],
      useFactory: (
        reports: ReportRepository,
        presentations: PresentationExists,
        establishments: EstablishmentExists,
        reporters: ReporterIdentity,
        plausibility: GatherPlausibilityContext,
      ): RegisterReport =>
        new RegisterReport({
          reports,
          presentations,
          establishments,
          reporters,
          plausibility,
          clock: { now: () => new Date() },
        }),
    },
  ],
})
export class PricingModule {}
