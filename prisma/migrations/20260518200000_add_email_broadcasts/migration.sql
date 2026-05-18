-- CreateTable
CREATE TABLE "EmailBroadcast" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "adminEmail" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailBroadcast_createdAt_idx" ON "EmailBroadcast"("createdAt");
CREATE INDEX "EmailBroadcast_status_createdAt_idx" ON "EmailBroadcast"("status", "createdAt");
