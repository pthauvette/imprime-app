-- Permet à l'admin de toggle on/off une expérience A/B sans redeploy.
-- La structure (variants, weights) reste code-defined; seul `active` +
-- optionnel weight override sont en DB.
CREATE TABLE "ExperimentOverride" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "weightsJson" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperimentOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExperimentOverride_experimentId_key" ON "ExperimentOverride"("experimentId");
