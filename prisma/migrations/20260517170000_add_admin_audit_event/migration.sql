-- CreateTable
CREATE TABLE "AdminAuditEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "data" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditEvent_adminId_createdAt_idx" ON "AdminAuditEvent"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_kind_createdAt_idx" ON "AdminAuditEvent"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_targetType_targetId_idx" ON "AdminAuditEvent"("targetType", "targetId");
