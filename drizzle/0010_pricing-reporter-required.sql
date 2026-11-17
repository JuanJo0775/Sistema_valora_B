-- Grill de la issue #16, pregunta 8: desde la #62 todo reporte nuevo lleva reportante. NOT VALID (agregado
-- a mano a lo que generó drizzle-kit) aplica la regla a los reportes nuevos sin revisar los anteriores,
-- que son de solo inserción y pueden no tenerlo.
ALTER TABLE "pricing"."reports" ADD CONSTRAINT "reports_reporter_required" CHECK ("pricing"."reports"."reporter_id" is not null) NOT VALID;
