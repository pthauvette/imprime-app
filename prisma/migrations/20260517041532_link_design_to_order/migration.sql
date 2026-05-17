-- AlterTable
ALTER TABLE "DesignDraft" ADD COLUMN "orderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DesignDraft_orderId_key" ON "DesignDraft"("orderId");

-- AddForeignKey
ALTER TABLE "DesignDraft" ADD CONSTRAINT "DesignDraft_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
