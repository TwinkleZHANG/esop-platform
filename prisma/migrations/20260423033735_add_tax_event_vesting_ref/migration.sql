-- AlterTable
ALTER TABLE "tax_events" ADD COLUMN     "vestingRecordId" TEXT;

-- AddForeignKey
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_vestingRecordId_fkey" FOREIGN KEY ("vestingRecordId") REFERENCES "vesting_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
