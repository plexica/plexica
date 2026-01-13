-- Create Keycloak database
CREATE DATABASE keycloak WITH OWNER = plexica;

-- Create core schema for Plexica core data
CREATE SCHEMA IF NOT EXISTS core;

GRANT ALL PRIVILEGES ON SCHEMA core TO plexica;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA core TO plexica;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA core TO plexica;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Plexica database initialized successfully';
END $$;
