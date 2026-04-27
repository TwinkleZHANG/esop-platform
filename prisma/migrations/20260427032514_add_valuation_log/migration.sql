-- CreateEnum
CREATE TYPE "ValuationLogAction" AS ENUM ('CREATED', 'DELETED');

-- CreateTable
CREATE TABLE "valuation_logs" (
    "id" TEXT NOT NULL,
    "valuationId" TEXT,
    "action" "ValuationLogAction" NOT NULL,
    "fmv" DECIMAL(65,30) NOT NULL,
    "valuationDate" TIMESTAMP(3) NOT NULL,
    "operatorId" TEXT NOT NULL,
    "operatorName" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valuation_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "valuation_logs" ADD CONSTRAINT "valuation_logs_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "valuations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
