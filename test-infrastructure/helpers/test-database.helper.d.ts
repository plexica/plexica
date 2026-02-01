/**
 * Test Database Helper
 *
 * Provides utilities for managing the test database, including:
 * - Connection management
 * - Schema creation/deletion
 * - Data cleanup
 * - Factory methods for creating test data
 */
import { PrismaClient, TenantStatus } from '@prisma/client';
import { Pool } from 'pg';
export declare class TestDatabaseHelper {
    private static instance;
    private prisma;
    private pool;
    private constructor();
    /**
     * Get singleton instance
     */
    static getInstance(): TestDatabaseHelper;
    /**
     * Get Prisma client instance
     */
    getPrisma(): PrismaClient;
    /**
     * Get PostgreSQL pool instance
     */
    getPool(): Pool;
    /**
     * Truncate all tables in core schema
     */
    truncateCore(): Promise<void>;
    /**
     * Drop all tenant schemas
     */
    dropTenantSchemas(): Promise<void>;
    /**
     * Create a tenant schema with all tables
     */
    createTenantSchema(tenantSlug: string): Promise<string>;
    /**
     * Factory: Create a test tenant
     */
    createTenant(data: {
        slug: string;
        name: string;
        status?: TenantStatus;
        withSchema?: boolean;
        withMinioBucket?: boolean;
    }): Promise<{
        name: string;
        id: string;
        slug: string;
        status: import(".prisma/client").$Enums.TenantStatus;
        settings: import("@prisma/client/runtime/client").JsonValue;
        theme: import("@prisma/client/runtime/client").JsonValue;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * Factory: Create a test user in a tenant schema
     */
    createUser(tenantSlug: string, data: {
        id?: string;
        keycloakId: string;
        email: string;
        firstName?: string;
        lastName?: string;
    }): Promise<{
        id: string;
        keycloakId: string;
        email: string;
        firstName?: string;
        lastName?: string;
    }>;
    /**
     * Factory: Create a test workspace in a tenant schema
     */
    createWorkspace(tenantSlug: string, tenantId: string, data: {
        slug: string;
        name: string;
        description?: string;
        ownerId: string;
    }): Promise<{
        tenantId: string;
        slug: string;
        name: string;
        description?: string;
        ownerId: string;
        id: string;
    }>;
    /**
     * Clean up and disconnect
     */
    disconnect(): Promise<void>;
    /**
     * Reset the entire test database
     */
    reset(): Promise<void>;
}
export declare const testDb: TestDatabaseHelper;
