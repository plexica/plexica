-- Add user profile fields to the users table for enhanced user management
-- This migration adds:
-- 1. display_name (VARCHAR): User-editable display name (optional)
-- 2. preferences (JSONB): Application settings and user preferences
-- 3. status (user_status ENUM): Account status (ACTIVE, SUSPENDED, DELETED)
-- 4. Renames avatar -> avatar_url for clarity
-- All columns have safe defaults for backward compatibility (Art. 9.1)

-- Create UserStatus enum type
DO $$ BEGIN
  CREATE TYPE "core"."UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add display_name column (nullable, user-editable)
ALTER TABLE "core"."users" ADD COLUMN IF NOT EXISTS "display_name" VARCHAR(255);

-- Add preferences column (JSONB with empty object default)
ALTER TABLE "core"."users" ADD COLUMN IF NOT EXISTS "preferences" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Add status column (UserStatus enum with ACTIVE default)
ALTER TABLE "core"."users" ADD COLUMN IF NOT EXISTS "status" "core"."UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- Rename avatar column to avatar_url (if exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'core' 
    AND table_name = 'users' 
    AND column_name = 'avatar'
  ) THEN
    ALTER TABLE "core"."users" RENAME COLUMN "avatar" TO "avatar_url";
  END IF;
END $$;

-- Create index on status for efficient filtering (active vs suspended users)
CREATE INDEX IF NOT EXISTS "idx_users_status" ON "core"."users"("status");

-- Verify: Existing users now have default values (no data loss, backward compatible)
-- SELECT id, keycloak_id, display_name, preferences, status FROM "core"."users" LIMIT 5;
