/**
 * Test MinIO Helper
 *
 * Provides utilities for interacting with the test MinIO instance:
 * - Bucket management (create, delete, list)
 * - Object operations (upload, download, delete)
 * - Tenant bucket provisioning
 * - Policy management
 */
import { Client as MinioClient } from 'minio';
export interface BucketInfo {
    name: string;
    creationDate: Date;
}
export interface ObjectInfo {
    name: string;
    size: number;
    etag: string;
    lastModified: Date;
}
export declare class TestMinioHelper {
    private static instance;
    private client;
    private constructor();
    /**
     * Get singleton instance
     */
    static getInstance(): TestMinioHelper;
    /**
     * Get MinIO client instance
     */
    getClient(): MinioClient;
    /**
     * Create a bucket for a tenant
     * Naming convention: tenant-{slug} (e.g., tenant-acme-corp)
     */
    createTenantBucket(tenantSlug: string, region?: string): Promise<string>;
    /**
     * Set bucket policy for a tenant bucket
     * Default policy: private (only authenticated users with tenant access)
     */
    setTenantBucketPolicy(bucketName: string): Promise<void>;
    /**
     * Delete a tenant bucket and all its contents
     */
    deleteTenantBucket(tenantSlug: string): Promise<void>;
    /**
     * Check if a tenant bucket exists
     */
    tenantBucketExists(tenantSlug: string): Promise<boolean>;
    /**
     * List all buckets
     */
    listBuckets(): Promise<BucketInfo[]>;
    /**
     * List all tenant buckets (buckets starting with "tenant-")
     */
    listTenantBuckets(): Promise<BucketInfo[]>;
    /**
     * Upload a file to a tenant bucket
     */
    uploadFile(tenantSlug: string, objectName: string, filePath: string, metadata?: Record<string, string>): Promise<void>;
    /**
     * Upload buffer to a tenant bucket
     */
    uploadBuffer(tenantSlug: string, objectName: string, buffer: Buffer, metadata?: Record<string, string>): Promise<void>;
    /**
     * Download a file from a tenant bucket
     */
    downloadFile(tenantSlug: string, objectName: string, filePath: string): Promise<void>;
    /**
     * Get object as buffer
     */
    getObject(tenantSlug: string, objectName: string): Promise<Buffer>;
    /**
     * Delete an object from a tenant bucket
     */
    deleteObject(tenantSlug: string, objectName: string): Promise<void>;
    /**
     * Delete multiple objects from a tenant bucket
     */
    deleteObjects(tenantSlug: string, objectNames: string[]): Promise<void>;
    /**
     * List objects in a tenant bucket
     */
    listObjects(tenantSlug: string, prefix?: string, recursive?: boolean): Promise<ObjectInfo[]>;
    /**
     * Check if an object exists in a tenant bucket
     */
    objectExists(tenantSlug: string, objectName: string): Promise<boolean>;
    /**
     * Get object metadata
     */
    getObjectMetadata(tenantSlug: string, objectName: string): Promise<any>;
    /**
     * Generate a presigned URL for an object (for temporary access)
     */
    getPresignedUrl(tenantSlug: string, objectName: string, expirySeconds?: number): Promise<string>;
    /**
     * Generate a presigned URL for uploading
     */
    getPresignedUploadUrl(tenantSlug: string, objectName: string, expirySeconds?: number): Promise<string>;
    /**
     * Create a plugin bucket (for plugin assets)
     * Naming convention: plexica-plugins
     */
    createPluginBucket(region?: string): Promise<string>;
    /**
     * Delete the plugin bucket and all its contents
     */
    deletePluginBucket(): Promise<void>;
    /**
     * Clean up all test buckets (tenant buckets and plugin bucket)
     */
    cleanupAllBuckets(): Promise<void>;
    /**
     * Get bucket size (total size of all objects)
     */
    getBucketSize(tenantSlug: string): Promise<number>;
    /**
     * Copy object from one location to another within the same tenant bucket
     */
    copyObject(tenantSlug: string, sourceObject: string, destObject: string): Promise<void>;
}
export declare const testMinio: TestMinioHelper;
