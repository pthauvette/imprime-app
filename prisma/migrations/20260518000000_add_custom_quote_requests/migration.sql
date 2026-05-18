-- CreateTable
CREATE TABLE "CustomQuoteRequest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "companyName" TEXT,
    "projectType" TEXT NOT NULL,
    "estimatedQuantity" TEXT,
    "deadline" TEXT,
    "budgetCents" INTEGER,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminResponse" TEXT,
    "adminNotes" TEXT,
    "requestIp" TEXT,
    "requestUa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quotedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "CustomQuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomQuoteRequest_status_createdAt_idx" ON "CustomQuoteRequest"("status", "createdAt");
CREATE INDEX "CustomQuoteRequest_email_createdAt_idx" ON "CustomQuoteRequest"("email", "createdAt");
