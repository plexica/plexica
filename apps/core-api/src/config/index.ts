import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Configuration schema
const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(3000),
  host: z.string().default('0.0.0.0'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  
  // Database
  databaseUrl: z.string(),
  
  // Redis
  redisHost: z.string().default('localhost'),
  redisPort: z.coerce.number().default(6379),
  redisPassword: z.string().optional(),
  
  // Keycloak
  keycloakUrl: z.string(),
  keycloakRealm: z.string().default('master'),
  keycloakClientId: z.string(),
  keycloakClientSecret: z.string().optional(),
  keycloakAdminUsername: z.string(),
  keycloakAdminPassword: z.string(),
  
  // Kafka/Redpanda
  kafkaBrokers: z.string().default('localhost:9092'),
  
  // Storage
  storageEndpoint: z.string().default('localhost:9000'),
  storageAccessKey: z.string(),
  storageSecretKey: z.string(),
  storageUseSsl: z.coerce.boolean().default(false),
  
  // JWT
  jwtSecret: z.string(),
  jwtExpiration: z.string().default('15m'),
  
  // CORS
  corsOrigin: z.string().default('http://localhost:3001'),
});

// Parse and validate configuration
export const config = configSchema.parse({
  nodeEnv: process.env.NODE_ENV,
  port: process.env.API_PORT,
  host: process.env.API_HOST,
  logLevel: process.env.LOG_LEVEL,
  
  databaseUrl: process.env.DATABASE_URL,
  
  redisHost: process.env.REDIS_HOST,
  redisPort: process.env.REDIS_PORT,
  redisPassword: process.env.REDIS_PASSWORD,
  
  keycloakUrl: process.env.KEYCLOAK_URL,
  keycloakRealm: process.env.KEYCLOAK_REALM,
  keycloakClientId: process.env.KEYCLOAK_CLIENT_ID,
  keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
  keycloakAdminUsername: process.env.KEYCLOAK_ADMIN_USERNAME,
  keycloakAdminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD,
  
  kafkaBrokers: process.env.KAFKA_BROKERS,
  
  storageEndpoint: process.env.STORAGE_ENDPOINT,
  storageAccessKey: process.env.STORAGE_ACCESS_KEY,
  storageSecretKey: process.env.STORAGE_SECRET_KEY,
  storageUseSsl: process.env.STORAGE_USE_SSL,
  
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiration: process.env.JWT_EXPIRATION,
  
  corsOrigin: process.env.CORS_ORIGIN,
});

export type Config = z.infer<typeof configSchema>;
