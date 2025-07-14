-- Add createdAt column to the "Connection" table
-- This script is equivalent to a Prisma migration for adding this column.
ALTER TABLE "Connection" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
