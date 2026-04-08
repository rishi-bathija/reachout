-- AlterTable
ALTER TABLE "connections" ADD COLUMN     "last_contacted_at" TIMESTAMP(3),
ADD COLUMN     "next_follow_up_at" TIMESTAMP(3);
