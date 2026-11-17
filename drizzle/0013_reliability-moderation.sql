CREATE TABLE "reliability"."flags" (
	"report_id" uuid NOT NULL,
	"flagger_key" text NOT NULL,
	"reason" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "flags_report_id_flagger_key_pk" PRIMARY KEY("report_id","flagger_key"),
	CONSTRAINT "flags_reason_valid" CHECK ("reliability"."flags"."reason" in ('precio_falso', 'producto_equivocado', 'establecimiento_equivocado', 'otro'))
);
--> statement-breakpoint
CREATE TABLE "reliability"."moderation_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"note" text NOT NULL,
	"moderator_key" text NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	CONSTRAINT "moderation_log_decision_valid" CHECK ("reliability"."moderation_log"."decision" in ('aprobar', 'descartar', 'observar_cuentas'))
);
--> statement-breakpoint
ALTER TABLE "reliability"."observations" ADD COLUMN "moderation" text;--> statement-breakpoint
-- Grill de la #32, pregunta 5 (agregado a mano antes de aplicarla): la bitácora es inmutable; ningún
-- UPDATE ni DELETE se acepta, ni siquiera desde el código de la aplicación.
CREATE FUNCTION "reliability"."moderation_log_is_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora de moderación no se puede modificar ni borrar.';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "moderation_log_append_only" BEFORE UPDATE OR DELETE ON "reliability"."moderation_log" FOR EACH ROW EXECUTE FUNCTION "reliability"."moderation_log_is_append_only"();
