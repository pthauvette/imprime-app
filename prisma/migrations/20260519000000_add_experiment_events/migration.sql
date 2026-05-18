-- A/B tracking : assignments (qui a vu quelle variant) + conversions
-- (qui a fait l'action de succès). Dédup assignments par
-- (experimentId, visitorId) via UNIQUE pour pas surcompter les refresh.

CREATE TABLE "ExperimentAssignment" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExperimentAssignment_experimentId_visitorId_key" ON "ExperimentAssignment"("experimentId", "visitorId");
CREATE INDEX "ExperimentAssignment_experimentId_variantId_createdAt_idx" ON "ExperimentAssignment"("experimentId", "variantId", "createdAt");
CREATE INDEX "ExperimentAssignment_userId_idx" ON "ExperimentAssignment"("userId");

CREATE TABLE "ExperimentConversion" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "userId" TEXT,
    "goal" TEXT NOT NULL,
    "value" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentConversion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExperimentConversion_experimentId_variantId_goal_createdAt_idx" ON "ExperimentConversion"("experimentId", "variantId", "goal", "createdAt");
CREATE INDEX "ExperimentConversion_visitorId_createdAt_idx" ON "ExperimentConversion"("visitorId", "createdAt");
