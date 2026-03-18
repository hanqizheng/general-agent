CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"active_run_id" text,
	"next_sequence" integer DEFAULT 1 NOT NULL,
	"workspace_root" text NOT NULL,
	"last_message_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"request_message_id" text NOT NULL,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"system_prompt_hash" text NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"run_id" text,
	"sequence" integer NOT NULL,
	"turn_index" integer,
	"role" text NOT NULL,
	"visibility" text NOT NULL,
	"status" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "message_parts" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"part_index" integer NOT NULL,
	"kind" text NOT NULL,
	"state" text NOT NULL,
	"text_content" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transient_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"message_id" text,
	"run_id" text,
	"status" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"storage_driver" text NOT NULL,
	"storage_key" text NOT NULL,
	"retention_policy" text NOT NULL,
	"expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_parts" ADD CONSTRAINT "message_parts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transient_artifacts" ADD CONSTRAINT "transient_artifacts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transient_artifacts" ADD CONSTRAINT "transient_artifacts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transient_artifacts" ADD CONSTRAINT "transient_artifacts_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_deleted_last_message_idx" ON "sessions" USING btree ("deleted_at","last_message_at");--> statement-breakpoint
CREATE INDEX "agent_runs_session_status_idx" ON "agent_runs" USING btree ("session_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_session_sequence_unique" ON "messages" USING btree ("session_id","sequence");--> statement-breakpoint
CREATE INDEX "messages_session_sequence_idx" ON "messages" USING btree ("session_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "message_parts_message_part_index_unique" ON "message_parts" USING btree ("message_id","part_index");--> statement-breakpoint
CREATE INDEX "message_parts_message_part_index_idx" ON "message_parts" USING btree ("message_id","part_index");--> statement-breakpoint
CREATE INDEX "transient_artifacts_session_status_expires_idx" ON "transient_artifacts" USING btree ("session_id","status","expires_at");