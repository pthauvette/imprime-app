-- Trace les runs des cron jobs pour /admin/crons.
-- Permet last run + success rate + latence + error sans dépendre de
-- Healthchecks.io (qui sert juste d'alerting timeout externe).

CREATE TABLE "CronRun" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "data" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CronRun_name_createdAt_idx" ON "CronRun"("name", "createdAt");
CREATE INDEX "CronRun_status_createdAt_idx" ON "CronRun"("status", "createdAt");
CREATE INDEX "CronRun_createdAt_idx" ON "CronRun"("createdAt");
