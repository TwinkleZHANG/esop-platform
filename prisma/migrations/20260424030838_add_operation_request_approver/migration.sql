-- AlterTable
ALTER TABLE "operation_requests" ADD COLUMN     "approverId" TEXT;

-- AddForeignKey
ALTER TABLE "operation_requests" ADD CONSTRAINT "operation_requests_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
