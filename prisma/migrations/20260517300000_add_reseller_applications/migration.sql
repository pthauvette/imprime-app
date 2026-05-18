-- CreateTable
CREATE TABLE "ResellerApplication" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "estimatedMonthlyCents" INTEGER,
    "currentSolution" TEXT,
    "projectTypes" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "requestIp" TEXT,
    "requestUa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ResellerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResellerApplication_email_createdAt_idx" ON "ResellerApplication"("email", "createdAt");
CREATE INDEX "ResellerApplication_status_createdAt_idx" ON "ResellerApplication"("status", "createdAt");
