-- AlterTable
ALTER TABLE "user_profiles"
DROP COLUMN "headline",
ADD COLUMN "onboarding_completed" BOOLEAN NOT NULL DEFAULT false;
