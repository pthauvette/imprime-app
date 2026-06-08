-- CreateTable
CREATE TABLE "McpOrderIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempKey" TEXT NOT NULL,
    "orderId" TEXT,
    "checkoutUrl" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpOrderIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "McpOrderIntent_success_createdAt_idx" ON "McpOrderIntent"("success", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpOrderIntent_userId_idempKey_key" ON "McpOrderIntent"("userId", "idempKey");

-- AddForeignKey
ALTER TABLE "McpOrderIntent" ADD CONSTRAINT "McpOrderIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
