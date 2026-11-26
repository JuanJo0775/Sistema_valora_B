import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { ModerationSummaryModule } from './moderation/moderation-summary.module';
import { CatalogModule } from './modules/catalog';
import { CommerceModule } from './modules/commerce';
import { ComparisonModule } from './modules/comparison';
import { EstablishmentsModule } from './modules/establishments';
import { IdentityModule } from './modules/identity';
import { NotificationsModule } from './modules/notifications';
import { ImportsModule } from './modules/imports';
import { PricingModule } from './modules/pricing';
import { ReliabilityModule } from './modules/reliability';
import { validateEnv } from './shared/config/env.validation';
import { DatabaseModule } from './shared/database/database.module';
import { EventsModule } from './shared/events';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    EventsModule,
    IdentityModule,
    CatalogModule,
    EstablishmentsModule,
    PricingModule,
    ReliabilityModule,
    ComparisonModule,
    // Corte 3 (EPIC-B08): nadie del núcleo lo importa (EC-05).
    CommerceModule,
    ImportsModule,
    // ADR-044: avisos push; nadie lo importa.
    NotificationsModule,
    // #257: el resumen de pendientes de moderación junta cuatro módulos.
    ModerationSummaryModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
