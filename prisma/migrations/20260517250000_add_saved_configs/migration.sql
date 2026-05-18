-- CreateTable
CREATE TABLE "SavedConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "optionIds" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "timesUsed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SavedConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedConfig_userId_lastUsedAt_idx" ON "SavedConfig"("userId", "lastUsedAt");

-- CreateIndex
CREATE INDEX "SavedConfig_userId_createdAt_idx" ON "SavedConfig"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "SavedConfig" ADD CONSTRAINT "SavedConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
