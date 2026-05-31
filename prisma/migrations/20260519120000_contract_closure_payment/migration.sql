-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "clientMarkedComplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contract" ADD COLUMN "freelancerMarkedComplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contract" ADD COLUMN "clientPaymentSent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contract" ADD COLUMN "freelancerPaymentReceived" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CompletedProject" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DOUBLE PRECISION,
    "clientId" INTEGER NOT NULL,
    "freelancerId" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompletedProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompletedProject_contractId_key" ON "CompletedProject"("contractId");

-- AddForeignKey
ALTER TABLE "CompletedProject" ADD CONSTRAINT "CompletedProject_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompletedProject" ADD CONSTRAINT "CompletedProject_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompletedProject" ADD CONSTRAINT "CompletedProject_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
