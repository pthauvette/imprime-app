-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN     "error" TEXT,
ADD COLUMN     "latencyMs" INTEGER,
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "statusCode" INTEGER,
ADD COLUMN     "success" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "WebhookEvent_success_processedAt_idx" ON "WebhookEvent"("success", "processedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_orderId_idx" ON "WebhookEvent"("orderId");
