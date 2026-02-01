"use strict";
/**
 * Test MinIO Helper
 *
 * Provides utilities for interacting with the test MinIO instance:
 * - Bucket management (create, delete, list)
 * - Object operations (upload, download, delete)
 * - Tenant bucket provisioning
 * - Policy management
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testMinio = exports.TestMinioHelper = void 0;
const minio_1 = require("minio");
class TestMinioHelper {
    static instance;
    client;
    constructor() {
        const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
        const port = parseInt(process.env.MINIO_PORT || '9010', 10);
        const accessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin_test';
        const secretKey = process.env.MINIO_SECRET_KEY || 'minioadmin_test';
        const useSSL = process.env.MINIO_USE_SSL === 'true';
        this.client = new minio_1.Client({
            endPoint: endpoint,
            port: port,
            useSSL: useSSL,
            accessKey: accessKey,
            secretKey: secretKey,
        });
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!TestMinioHelper.instance) {
            TestMinioHelper.instance = new TestMinioHelper();
        }
        return TestMinioHelper.instance;
    }
    /**
     * Get MinIO client instance
     */
    getClient() {
        return this.client;
    }
    /**
     * Create a bucket for a tenant
     * Naming convention: tenant-{slug} (e.g., tenant-acme-corp)
     */
    async createTenantBucket(tenantSlug, region = 'us-east-1') {
        const bucketName = `tenant-${tenantSlug}`;
        const exists = await this.client.bucketExists(bucketName);
        if (!exists) {
            await this.client.makeBucket(bucketName, region);
            // Set bucket policy for tenant (private by default)
            await this.setTenantBucketPolicy(bucketName);
        }
        return bucketName;
    }
    /**
     * Set bucket policy for a tenant bucket
     * Default policy: private (only authenticated users with tenant access)
     */
    async setTenantBucketPolicy(bucketName) {
        const policy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Principal: { AWS: ['*'] },
                    Action: ['s3:GetObject'],
                    Resource: [`arn:aws:s3:::${bucketName}/*`],
                    Condition: {
                        StringEquals: {
                            's3:ExistingObjectTag/public': 'true',
                        },
                    },
                },
            ],
        };
        await this.client.setBucketPolicy(bucketName, JSON.stringify(policy));
    }
    /**
     * Delete a tenant bucket and all its contents
     */
    async deleteTenantBucket(tenantSlug) {
        const bucketName = `tenant-${tenantSlug}`;
        const exists = await this.client.bucketExists(bucketName);
        if (!exists) {
            return;
        }
        // Delete all objects in the bucket
        const objectsList = [];
        const stream = this.client.listObjects(bucketName, '', true);
        for await (const obj of stream) {
            if (obj.name) {
                objectsList.push(obj.name);
            }
        }
        if (objectsList.length > 0) {
            await this.client.removeObjects(bucketName, objectsList);
        }
        // Delete the bucket
        await this.client.removeBucket(bucketName);
    }
    /**
     * Check if a tenant bucket exists
     */
    async tenantBucketExists(tenantSlug) {
        const bucketName = `tenant-${tenantSlug}`;
        return await this.client.bucketExists(bucketName);
    }
    /**
     * List all buckets
     */
    async listBuckets() {
        const buckets = await this.client.listBuckets();
        return buckets.map((b) => ({
            name: b.name,
            creationDate: b.creationDate,
        }));
    }
    /**
     * List all tenant buckets (buckets starting with "tenant-")
     */
    async listTenantBuckets() {
        const allBuckets = await this.listBuckets();
        return allBuckets.filter((b) => b.name.startsWith('tenant-'));
    }
    /**
     * Upload a file to a tenant bucket
     */
    async uploadFile(tenantSlug, objectName, filePath, metadata) {
        const bucketName = `tenant-${tenantSlug}`;
        await this.client.fPutObject(bucketName, objectName, filePath, metadata);
    }
    /**
     * Upload buffer to a tenant bucket
     */
    async uploadBuffer(tenantSlug, objectName, buffer, metadata) {
        const bucketName = `tenant-${tenantSlug}`;
        await this.client.putObject(bucketName, objectName, buffer, buffer.length, metadata);
    }
    /**
     * Download a file from a tenant bucket
     */
    async downloadFile(tenantSlug, objectName, filePath) {
        const bucketName = `tenant-${tenantSlug}`;
        await this.client.fGetObject(bucketName, objectName, filePath);
    }
    /**
     * Get object as buffer
     */
    async getObject(tenantSlug, objectName) {
        const bucketName = `tenant-${tenantSlug}`;
        const stream = await this.client.getObject(bucketName, objectName);
        return new Promise((resolve, reject) => {
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
        });
    }
    /**
     * Delete an object from a tenant bucket
     */
    async deleteObject(tenantSlug, objectName) {
        const bucketName = `tenant-${tenantSlug}`;
        await this.client.removeObject(bucketName, objectName);
    }
    /**
     * Delete multiple objects from a tenant bucket
     */
    async deleteObjects(tenantSlug, objectNames) {
        const bucketName = `tenant-${tenantSlug}`;
        await this.client.removeObjects(bucketName, objectNames);
    }
    /**
     * List objects in a tenant bucket
     */
    async listObjects(tenantSlug, prefix = '', recursive = false) {
        const bucketName = `tenant-${tenantSlug}`;
        const objects = [];
        const stream = this.client.listObjects(bucketName, prefix, recursive);
        for await (const obj of stream) {
            objects.push({
                name: obj.name,
                size: obj.size,
                etag: obj.etag,
                lastModified: obj.lastModified,
            });
        }
        return objects;
    }
    /**
     * Check if an object exists in a tenant bucket
     */
    async objectExists(tenantSlug, objectName) {
        const bucketName = `tenant-${tenantSlug}`;
        try {
            await this.client.statObject(bucketName, objectName);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get object metadata
     */
    async getObjectMetadata(tenantSlug, objectName) {
        const bucketName = `tenant-${tenantSlug}`;
        return await this.client.statObject(bucketName, objectName);
    }
    /**
     * Generate a presigned URL for an object (for temporary access)
     */
    async getPresignedUrl(tenantSlug, objectName, expirySeconds = 3600) {
        const bucketName = `tenant-${tenantSlug}`;
        return await this.client.presignedGetObject(bucketName, objectName, expirySeconds);
    }
    /**
     * Generate a presigned URL for uploading
     */
    async getPresignedUploadUrl(tenantSlug, objectName, expirySeconds = 3600) {
        const bucketName = `tenant-${tenantSlug}`;
        return await this.client.presignedPutObject(bucketName, objectName, expirySeconds);
    }
    /**
     * Create a plugin bucket (for plugin assets)
     * Naming convention: plexica-plugins
     */
    async createPluginBucket(region = 'us-east-1') {
        const bucketName = 'plexica-plugins';
        const exists = await this.client.bucketExists(bucketName);
        if (!exists) {
            await this.client.makeBucket(bucketName, region);
            // Set public read policy for plugin assets
            const policy = {
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: { AWS: ['*'] },
                        Action: ['s3:GetObject'],
                        Resource: [`arn:aws:s3:::${bucketName}/*`],
                    },
                ],
            };
            await this.client.setBucketPolicy(bucketName, JSON.stringify(policy));
        }
        return bucketName;
    }
    /**
     * Delete the plugin bucket and all its contents
     */
    async deletePluginBucket() {
        const bucketName = 'plexica-plugins';
        const exists = await this.client.bucketExists(bucketName);
        if (!exists) {
            return;
        }
        // Delete all objects
        const objectsList = [];
        const stream = this.client.listObjects(bucketName, '', true);
        for await (const obj of stream) {
            if (obj.name) {
                objectsList.push(obj.name);
            }
        }
        if (objectsList.length > 0) {
            await this.client.removeObjects(bucketName, objectsList);
        }
        await this.client.removeBucket(bucketName);
    }
    /**
     * Clean up all test buckets (tenant buckets and plugin bucket)
     */
    async cleanupAllBuckets() {
        const buckets = await this.listBuckets();
        for (const bucket of buckets) {
            if (bucket.name.startsWith('tenant-') || bucket.name === 'plexica-plugins') {
                // Delete all objects in the bucket
                const objectsList = [];
                const stream = this.client.listObjects(bucket.name, '', true);
                for await (const obj of stream) {
                    if (obj.name) {
                        objectsList.push(obj.name);
                    }
                }
                if (objectsList.length > 0) {
                    await this.client.removeObjects(bucket.name, objectsList);
                }
                // Delete the bucket
                await this.client.removeBucket(bucket.name);
            }
        }
    }
    /**
     * Get bucket size (total size of all objects)
     */
    async getBucketSize(tenantSlug) {
        const objects = await this.listObjects(tenantSlug, '', true);
        return objects.reduce((total, obj) => total + obj.size, 0);
    }
    /**
     * Copy object from one location to another within the same tenant bucket
     */
    async copyObject(tenantSlug, sourceObject, destObject) {
        const bucketName = `tenant-${tenantSlug}`;
        await this.client.copyObject(bucketName, destObject, `/${bucketName}/${sourceObject}`);
    }
}
exports.TestMinioHelper = TestMinioHelper;
// Export singleton instance
exports.testMinio = TestMinioHelper.getInstance();
