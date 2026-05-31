-- Contract workflow: pending start, milestone progress, bid snapshot
ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'PENDING_START';

ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "acceptedBidId" INTEGER;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "acceptedBidAmount" DOUBLE PRECISION;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "milestoneProgress" JSONB;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- New contracts default to PENDING_START (existing rows keep ACTIVE)
ALTER TABLE "Contract" ALTER COLUMN "status" SET DEFAULT 'PENDING_START';
