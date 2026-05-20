-- Round 19 #4 — Email broadcast scheduling
ALTER TABLE "EmailBroadcast" ADD COLUMN "scheduledAt" TIMESTAMP(3);
CREATE INDEX "EmailBroadcast_status_scheduledAt_idx"
  ON "EmailBroadcast"("status", "scheduledAt");
