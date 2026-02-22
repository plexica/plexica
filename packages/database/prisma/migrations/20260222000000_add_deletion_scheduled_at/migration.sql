-- Migration: Add deletion_scheduled_at column and indexes to tenants table
-- Spec: 001-multi-tenancy, Task T001-01

-- Add nullable deletion_scheduled_at column
ALTER TABLE "core"."tenants" ADD COLUMN "deletion_scheduled_at" TIMESTAMP(3);

-- Add B-TREE index on deletion_scheduled_at for DeletionScheduler queries
CREATE INDEX "idx_tenants_deletion_scheduled_at" ON "core"."tenants"("deletion_scheduled_at");

-- Add B-TREE index on status for efficient status filtering
CREATE INDEX "idx_tenants_status" ON "core"."tenants"("status");
