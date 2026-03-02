-- Migration: 20260302000000_create_jobs
-- Spec 007 T007-02: jobs table for JobQueueService
-- FR-007: Enqueue background jobs
-- FR-008: Process jobs with retries
-- FR-009: Schedule recurring cron jobs
-- FR-010: Every job payload includes tenantId (enforced at app layer)

-- Create JobStatus enum
CREATE TYPE "core"."JobStatus" AS ENUM (
  'PENDING',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'SCHEDULED'
);

-- Create jobs table
CREATE TABLE "core"."jobs" (
  "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"        UUID        NOT NULL,
  "name"             VARCHAR(255) NOT NULL,
  "plugin_id"        VARCHAR(255),
  "status"           "core"."JobStatus" NOT NULL DEFAULT 'PENDING',
  "payload"          JSONB       NOT NULL DEFAULT '{}',
  "result"           JSONB,
  "error"            TEXT,
  "retries"          INTEGER     NOT NULL DEFAULT 0,
  "max_retries"      INTEGER     NOT NULL DEFAULT 3,
  "cron_expression"  VARCHAR(255),
  "scheduled_at"     TIMESTAMPTZ,
  "started_at"       TIMESTAMPTZ,
  "completed_at"     TIMESTAMPTZ,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "core"."tenants" ("id") ON DELETE CASCADE
);

-- Composite index for dashboard queries: filter by tenant + status (FR-009, NFR-003)
CREATE INDEX "idx_jobs_tenant_status" ON "core"."jobs" ("tenant_id", "status");
-- Index for name-based queries
CREATE INDEX "idx_jobs_tenant_name" ON "core"."jobs" ("tenant_id", "name");
-- Index for scheduled job polling
CREATE INDEX "idx_jobs_scheduled_at" ON "core"."jobs" ("scheduled_at") WHERE "scheduled_at" IS NOT NULL;
