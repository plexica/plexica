-- CreateEnum
CREATE TYPE "core"."TenantStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'PENDING_DELETION', 'DELETED');

-- CreateEnum
CREATE TYPE "core"."PluginStatus" AS ENUM ('AVAILABLE', 'INSTALLED', 'DEPRECATED');

-- CreateTable
CREATE TABLE "core"."tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "core"."TenantStatus" NOT NULL DEFAULT 'PROVISIONING',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "theme" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."plugins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "status" "core"."PluginStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plugins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."tenant_plugins" (
    "tenantId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_plugins_pkey" PRIMARY KEY ("tenantId","pluginId")
);

-- CreateTable
CREATE TABLE "core"."super_admins" (
    "id" TEXT NOT NULL,
    "keycloak_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "core"."tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_keycloak_id_key" ON "core"."super_admins"("keycloak_id");

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_email_key" ON "core"."super_admins"("email");

-- AddForeignKey
ALTER TABLE "core"."tenant_plugins" ADD CONSTRAINT "tenant_plugins_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."tenant_plugins" ADD CONSTRAINT "tenant_plugins_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "core"."plugins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
