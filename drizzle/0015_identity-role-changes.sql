CREATE TABLE "identity"."role_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"from_role" text NOT NULL,
	"to_role" text NOT NULL,
	"changed_by" uuid,
	"note" text NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "role_changes_roles_valid" CHECK ("identity"."role_changes"."from_role" in ('reportante', 'comercio', 'moderador') and "identity"."role_changes"."to_role" in ('reportante', 'comercio', 'moderador'))
);
--> statement-breakpoint
CREATE FUNCTION "identity"."role_changes_is_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora de cambios de rol no se puede modificar ni borrar.';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "role_changes_append_only" BEFORE UPDATE OR DELETE ON "identity"."role_changes" FOR EACH ROW EXECUTE FUNCTION "identity"."role_changes_is_append_only"();
