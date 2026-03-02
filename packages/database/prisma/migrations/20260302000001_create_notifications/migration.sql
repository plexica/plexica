-- Migration: 20260302000001_create_notifications
-- Spec 007 T007-03: notifications table for NotificationService
-- FR-004: Send in-app and email notifications
-- FR-005: Bulk notification delivery
-- FR-006: Template-based notification content

-- Create NotificationChannel enum
CREATE TYPE "core"."NotificationChannel" AS ENUM (
  'EMAIL',
  'PUSH',
  'IN_APP'
);

-- Create NotificationStatus enum
CREATE TYPE "core"."NotificationStatus" AS ENUM (
  'PENDING',
  'SENT',
  'FAILED',
  'READ'
);

-- Create notifications table
CREATE TABLE "core"."notifications" (
  "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  UUID        NOT NULL,
  "user_id"    VARCHAR(255) NOT NULL,  -- Keycloak user ID
  "channel"    "core"."NotificationChannel" NOT NULL,
  "status"     "core"."NotificationStatus"  NOT NULL DEFAULT 'PENDING',
  "title"      VARCHAR(255) NOT NULL,
  "body"       TEXT         NOT NULL,
  -- metadata: source resource link, plugin_id, etc. (not indexed for FTS)
  "metadata"   JSONB,
  "read_at"    TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "core"."tenants" ("id") ON DELETE CASCADE
);

-- Composite index for unread count queries and notification bell dropdown
-- (tenant_id, user_id, status) covers: WHERE tenant_id = $1 AND user_id = $2 AND status != 'READ'
CREATE INDEX "idx_notifications_tenant_user_status"
  ON "core"."notifications" ("tenant_id", "user_id", "status");

-- Index for listing recent notifications for a user
CREATE INDEX "idx_notifications_tenant_user_created"
  ON "core"."notifications" ("tenant_id", "user_id", "created_at" DESC);
