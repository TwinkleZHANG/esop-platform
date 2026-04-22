-- AlterTable
ALTER TABLE "tax_events" ADD COLUMN     "valuationId" TEXT;

-- AddForeignKey
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "valuations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
