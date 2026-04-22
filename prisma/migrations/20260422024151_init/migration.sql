-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'GRANT_ADMIN', 'APPROVAL_ADMIN', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "Jurisdiction" AS ENUM ('MAINLAND', 'HONGKONG', 'OVERSEAS');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('RSU', 'OPTION');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED');

-- CreateEnum
CREATE TYPE "HoldingEntityType" AS ENUM ('LIMITED_PARTNERSHIP', 'DOMESTIC_SUBSIDIARY', 'OFFSHORE_SPV', 'OTHER');

-- CreateEnum
CREATE TYPE "HoldingEntityStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "GrantStatus" AS ENUM ('DRAFT', 'GRANTED', 'VESTING', 'FULLY_VESTED', 'STILL_EXERCISABLE', 'ALL_SETTLED', 'CLOSING', 'CLOSED');

-- CreateEnum
CREATE TYPE "VestingFrequency" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "VestingRecordStatus" AS ENUM ('PENDING', 'VESTED', 'PARTIALLY_SETTLED', 'SETTLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TaxEventType" AS ENUM ('VESTING_TAX', 'EXERCISE_TAX', 'POST_SETTLEMENT_TAX');

-- CreateEnum
CREATE TYPE "TaxEventStatus" AS ENUM ('PENDING_PAYMENT', 'RECEIPT_UPLOADED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "OperationTarget" AS ENUM ('SHARES', 'OPTIONS');

-- CreateEnum
CREATE TYPE "OperationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OperationRequestType" AS ENUM ('EXERCISE', 'TRANSFER', 'SELL', 'BUYBACK', 'REDEEM');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "department" TEXT,
    "legalIdentity" "Jurisdiction" NOT NULL,
    "taxResidence" "Jurisdiction" NOT NULL,
    "employmentStatus" TEXT NOT NULL DEFAULT '在职',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employer_entities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employer_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "PlanType" NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "deliveryMethod" JSONB NOT NULL,
    "poolSize" DECIMAL(65,30) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "boardResolutionId" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holding_entities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityCode" TEXT NOT NULL,
    "type" "HoldingEntityType" NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "address" TEXT,
    "establishedAt" TIMESTAMP(3),
    "legalRep" TEXT,
    "lpAccount" TEXT,
    "taxJurisdiction" TEXT NOT NULL,
    "status" "HoldingEntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holding_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valuations" (
    "id" TEXT NOT NULL,
    "valuationDate" TIMESTAMP(3) NOT NULL,
    "fmv" DECIMAL(65,30) NOT NULL,
    "source" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valuations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grants" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "holdingEntityId" TEXT,
    "grantDate" TIMESTAMP(3) NOT NULL,
    "vestingStartDate" TIMESTAMP(3),
    "totalQuantity" DECIMAL(65,30) NOT NULL,
    "strikePrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "agreementId" TEXT,
    "vestingYears" INTEGER NOT NULL,
    "cliffMonths" INTEGER NOT NULL,
    "vestingFrequency" "VestingFrequency" NOT NULL,
    "status" "GrantStatus" NOT NULL DEFAULT 'DRAFT',
    "operableShares" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "operableOptions" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "closedReason" TEXT,
    "exerciseWindowDeadline" TIMESTAMP(3),
    "exerciseWindowDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vesting_records" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "vestingDate" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "exercisableOptions" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "VestingRecordStatus" NOT NULL DEFAULT 'PENDING',
    "actualVestDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vesting_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_events" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" "TaxEventType" NOT NULL,
    "operationType" TEXT NOT NULL,
    "operationTarget" "OperationTarget",
    "quantity" DECIMAL(65,30) NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "fmvAtEvent" DECIMAL(65,30) NOT NULL,
    "strikePrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "TaxEventStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "receiptFiles" TEXT[],
    "employeeNotes" TEXT,
    "operationRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_requests" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestType" "OperationRequestType" NOT NULL,
    "requestTarget" "OperationTarget",
    "quantity" DECIMAL(65,30) NOT NULL,
    "status" "OperationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "submitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approveDate" TIMESTAMP(3),
    "approverNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_change_logs" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "operatorName" TEXT NOT NULL,
    "legalDocument" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_EmployerEntityToUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EmployerEntityToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employer_entities_name_key" ON "employer_entities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "holding_entities_entityCode_key" ON "holding_entities"("entityCode");

-- CreateIndex
CREATE UNIQUE INDEX "tax_events_operationRequestId_key" ON "tax_events"("operationRequestId");

-- CreateIndex
CREATE INDEX "status_change_logs_grantId_timestamp_idx" ON "status_change_logs"("grantId", "timestamp");

-- CreateIndex
CREATE INDEX "_EmployerEntityToUser_B_index" ON "_EmployerEntityToUser"("B");

-- AddForeignKey
ALTER TABLE "grants" ADD CONSTRAINT "grants_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grants" ADD CONSTRAINT "grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grants" ADD CONSTRAINT "grants_holdingEntityId_fkey" FOREIGN KEY ("holdingEntityId") REFERENCES "holding_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vesting_records" ADD CONSTRAINT "vesting_records_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_operationRequestId_fkey" FOREIGN KEY ("operationRequestId") REFERENCES "operation_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_requests" ADD CONSTRAINT "operation_requests_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_requests" ADD CONSTRAINT "operation_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_change_logs" ADD CONSTRAINT "status_change_logs_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmployerEntityToUser" ADD CONSTRAINT "_EmployerEntityToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "employer_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmployerEntityToUser" ADD CONSTRAINT "_EmployerEntityToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
