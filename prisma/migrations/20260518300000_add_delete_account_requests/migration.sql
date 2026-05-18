-- CreateTable
CREATE TABLE "DeleteAccountRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailSnapshot" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "DeleteAccountRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeleteAccountRequest_status_createdAt_idx" ON "DeleteAccountRequest"("status", "createdAt");
CREATE INDEX "DeleteAccountRequest_userId_idx" ON "DeleteAccountRequest"("userId");

-- AddForeignKey
ALTER TABLE "DeleteAccountRequest" ADD CONSTRAINT "DeleteAccountRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
