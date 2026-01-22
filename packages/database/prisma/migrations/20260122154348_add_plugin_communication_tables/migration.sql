-- CreateEnum
CREATE TYPE "core"."ServiceStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "core"."plugin_services" (
    "id" TEXT NOT NULL,
    "plugin_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "base_url" TEXT,
    "status" "core"."ServiceStatus" NOT NULL DEFAULT 'HEALTHY',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plugin_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."plugin_service_endpoints" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plugin_service_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."plugin_dependencies" (
    "id" TEXT NOT NULL,
    "plugin_id" TEXT NOT NULL,
    "depends_on_plugin_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plugin_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."shared_plugin_data" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "owner_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shared_plugin_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plugin_services_tenant_id_status_idx" ON "core"."plugin_services"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "plugin_services_plugin_id_idx" ON "core"."plugin_services"("plugin_id");

-- CreateIndex
CREATE UNIQUE INDEX "plugin_services_tenant_id_plugin_id_service_name_key" ON "core"."plugin_services"("tenant_id", "plugin_id", "service_name");

-- CreateIndex
CREATE INDEX "plugin_service_endpoints_service_id_idx" ON "core"."plugin_service_endpoints"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "plugin_service_endpoints_service_id_method_path_key" ON "core"."plugin_service_endpoints"("service_id", "method", "path");

-- CreateIndex
CREATE INDEX "plugin_dependencies_plugin_id_idx" ON "core"."plugin_dependencies"("plugin_id");

-- CreateIndex
CREATE INDEX "plugin_dependencies_depends_on_plugin_id_idx" ON "core"."plugin_dependencies"("depends_on_plugin_id");

-- CreateIndex
CREATE UNIQUE INDEX "plugin_dependencies_plugin_id_depends_on_plugin_id_key" ON "core"."plugin_dependencies"("plugin_id", "depends_on_plugin_id");

-- CreateIndex
CREATE INDEX "shared_plugin_data_tenant_id_namespace_idx" ON "core"."shared_plugin_data"("tenant_id", "namespace");

-- CreateIndex
CREATE INDEX "shared_plugin_data_owner_id_idx" ON "core"."shared_plugin_data"("owner_id");

-- CreateIndex
CREATE INDEX "shared_plugin_data_expires_at_idx" ON "core"."shared_plugin_data"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "shared_plugin_data_tenant_id_namespace_key_key" ON "core"."shared_plugin_data"("tenant_id", "namespace", "key");

-- AddForeignKey
ALTER TABLE "core"."plugin_service_endpoints" ADD CONSTRAINT "plugin_service_endpoints_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "core"."plugin_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
