-- Job: client project details
ALTER TABLE "Job" ADD COLUMN "requirements" TEXT;
ALTER TABLE "Job" ADD COLUMN "paymentNotes" TEXT;
ALTER TABLE "Job" ADD COLUMN "milestones" JSONB;

-- One bid per freelancer per job
DELETE FROM "Bid" a
USING "Bid" b
WHERE a.id > b.id
  AND a."jobId" = b."jobId"
  AND a."freelancerId" = b."freelancerId";

CREATE UNIQUE INDEX "Bid_jobId_freelancerId_key" ON "Bid" ("jobId", "freelancerId");
