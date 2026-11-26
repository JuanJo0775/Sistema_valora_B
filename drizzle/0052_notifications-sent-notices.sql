CREATE TABLE "notifications"."sent_notices" (
	"account_id" uuid NOT NULL,
	"queue" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sent_notices_account_id_queue_pk" PRIMARY KEY("account_id","queue")
);
