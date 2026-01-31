-- AlterEnum - Recreate PluginStatus enum with new values
-- Step 1: Create new enum type with all values
CREATE TYPE "core"."PluginStatus_new" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'DEPRECATED');

-- Step 2: Add temp column with new type
ALTER TABLE "core"."plugins" ADD COLUMN "status_new" "core"."PluginStatus_new";

-- Step 3: Migrate data (map AVAILABLE -> PUBLISHED, INSTALLED -> PUBLISHED for existing data)
UPDATE "core"."plugins" SET "status_new" = 
  CASE 
    WHEN "status"::text = 'AVAILABLE' THEN 'PUBLISHED'::"core"."PluginStatus_new"
    WHEN "status"::text = 'INSTALLED' THEN 'PUBLISHED'::"core"."PluginStatus_new"
    WHEN "status"::text = 'DEPRECATED' THEN 'DEPRECATED'::"core"."PluginStatus_new"
    ELSE 'DRAFT'::"core"."PluginStatus_new"
  END;

-- Step 4: Drop old column
ALTER TABLE "core"."plugins" DROP COLUMN "status";

-- Step 5: Rename new column to status
ALTER TABLE "core"."plugins" RENAME COLUMN "status_new" TO "status";

-- Step 6: Set NOT NULL and default
ALTER TABLE "core"."plugins" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "core"."plugins" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- Step 7: Drop old enum type
DROP TYPE "core"."PluginStatus";

-- Step 8: Rename new enum type to original name
ALTER TYPE "core"."PluginStatus_new" RENAME TO "PluginStatus";

-- AlterTable - Add marketplace fields to plugins table
ALTER TABLE "core"."plugins" ADD COLUMN "description" TEXT;
ALTER TABLE "core"."plugins" ADD COLUMN "long_description" TEXT;
ALTER TABLE "core"."plugins" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'other';
ALTER TABLE "core"."plugins" ADD COLUMN "author" TEXT;
ALTER TABLE "core"."plugins" ADD COLUMN "author_email" TEXT;
ALTER TABLE "core"."plugins" ADD COLUMN "homepage" TEXT;
ALTER TABLE "core"."plugins" ADD COLUMN "repository" TEXT;
ALTER TABLE "core"."plugins" ADD COLUMN "license" TEXT;
ALTER TABLE "core"."plugins" ADD COLUMN "icon" TEXT;
ALTER TABLE "core"."plugins" ADD COLUMN "screenshots" TEXT[];
ALTER TABLE "core"."plugins" ADD COLUMN "demo_url" TEXT;
ALTER TABLE "core"."plugins" ADD COLUMN "average_rating" DECIMAL(3,2);
ALTER TABLE "core"."plugins" ADD COLUMN "rating_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "core"."plugins" ADD COLUMN "download_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "core"."plugins" ADD COLUMN "install_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "core"."plugins" ADD COLUMN "published_at" TIMESTAMP(3);
ALTER TABLE "core"."plugins" ADD COLUMN "rejected_at" TIMESTAMP(3);
ALTER TABLE "core"."plugins" ADD COLUMN "rejection_reason" TEXT;

-- CreateTable - plugin_versions
CREATE TABLE "core"."plugin_versions" (
    "id" TEXT NOT NULL,
    "plugin_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "changelog" TEXT,
    "manifest" JSONB NOT NULL,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "is_latest" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plugin_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable - plugin_ratings
CREATE TABLE "core"."plugin_ratings" (
    "id" TEXT NOT NULL,
    "plugin_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "review" TEXT,
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "not_helpful_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plugin_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable - plugin_installations
CREATE TABLE "core"."plugin_installations" (
    "id" TEXT NOT NULL,
    "plugin_id" TEXT NOT NULL,
    "plugin_version" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "installed_by" TEXT NOT NULL,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalled_at" TIMESTAMP(3),

    CONSTRAINT "plugin_installations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plugins_status_idx" ON "core"."plugins"("status");

-- CreateIndex
CREATE INDEX "plugins_category_idx" ON "core"."plugins"("category");

-- CreateIndex
CREATE INDEX "plugins_average_rating_idx" ON "core"."plugins"("average_rating");

-- CreateIndex
CREATE INDEX "plugin_versions_plugin_id_idx" ON "core"."plugin_versions"("plugin_id");

-- CreateIndex
CREATE INDEX "plugin_versions_is_latest_idx" ON "core"."plugin_versions"("is_latest");

-- CreateIndex
CREATE UNIQUE INDEX "plugin_versions_plugin_id_version_key" ON "core"."plugin_versions"("plugin_id", "version");

-- CreateIndex
CREATE INDEX "plugin_ratings_plugin_id_idx" ON "core"."plugin_ratings"("plugin_id");

-- CreateIndex
CREATE INDEX "plugin_ratings_tenant_id_idx" ON "core"."plugin_ratings"("tenant_id");

-- CreateIndex
CREATE INDEX "plugin_ratings_rating_idx" ON "core"."plugin_ratings"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "plugin_ratings_plugin_id_tenant_id_user_id_key" ON "core"."plugin_ratings"("plugin_id", "tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "plugin_installations_plugin_id_idx" ON "core"."plugin_installations"("plugin_id");

-- CreateIndex
CREATE INDEX "plugin_installations_tenant_id_idx" ON "core"."plugin_installations"("tenant_id");

-- CreateIndex
CREATE INDEX "plugin_installations_installed_at_idx" ON "core"."plugin_installations"("installed_at");

-- AddForeignKey
ALTER TABLE "core"."plugin_versions" ADD CONSTRAINT "plugin_versions_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "core"."plugins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."plugin_ratings" ADD CONSTRAINT "plugin_ratings_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "core"."plugins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."plugin_ratings" ADD CONSTRAINT "plugin_ratings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."plugin_installations" ADD CONSTRAINT "plugin_installations_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "core"."plugins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."plugin_installations" ADD CONSTRAINT "plugin_installations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
