-- CreateTable
CREATE TABLE "SampleRequest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "shipLine1" TEXT NOT NULL,
    "shipLine2" TEXT,
    "shipCity" TEXT NOT NULL,
    "shipProvince" TEXT NOT NULL,
    "shipPostalCode" TEXT NOT NULL,
    "selectedSamples" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "trackingNumber" TEXT,
    "adminNotes" TEXT,
    "requestIp" TEXT,
    "requestUa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shippedAt" TIMESTAMP(3),

    CONSTRAINT "SampleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SampleRequest_email_createdAt_idx" ON "SampleRequest"("email", "createdAt");
CREATE INDEX "SampleRequest_status_createdAt_idx" ON "SampleRequest"("status", "createdAt");
