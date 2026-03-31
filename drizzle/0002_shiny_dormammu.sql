CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"kind" text NOT NULL,
	"mime_type" text NOT NULL,
	"original_name" text,
	"size_bytes" bigint,
	"checksum_sha256" text,
	"source_kind" text NOT NULL,
	"source_url" text,
	"storage_key" text,
	"status" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attachment_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"attachment_id" text NOT NULL,
	"provider" text NOT NULL,
	"model_family" text,
	"binding_method" text NOT NULL,
	"remote_ref" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_bindings" ADD CONSTRAINT "attachment_bindings_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_session_created_idx" ON "attachments" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "attachments_session_status_idx" ON "attachments" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "attachment_bindings_attachment_provider_idx" ON "attachment_bindings" USING btree ("attachment_id","provider","status");--> statement-breakpoint
CREATE INDEX "attachment_bindings_expires_idx" ON "attachment_bindings" USING btree ("expires_at","status");