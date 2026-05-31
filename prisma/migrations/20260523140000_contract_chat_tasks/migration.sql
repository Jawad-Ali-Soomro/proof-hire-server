-- Contract-scoped chat + workspace tasks
CREATE TYPE "ContractTaskStatus" AS ENUM ('OPEN', 'DONE');

ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'TASK';

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "contractId" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_contractId_key" ON "Conversation"("contractId");

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "taskId" INTEGER;

CREATE TABLE "ContractTask" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ContractTaskStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContractTask_contractId_status_idx" ON "ContractTask"("contractId", "status");

ALTER TABLE "ContractTask" ADD CONSTRAINT "ContractTask_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractTask" ADD CONSTRAINT "ContractTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
