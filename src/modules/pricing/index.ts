// Interfaz pública del módulo pricing. Otros módulos y AppModule importan solo desde aquí.
export { PricingModule } from './pricing.module';
// ADR-037: la referencia de plausibilidad (ADR-030) que commerce usa para sus precios oficiales.
export { GatherPlausibilityContext } from './application/gather-plausibility-context';
