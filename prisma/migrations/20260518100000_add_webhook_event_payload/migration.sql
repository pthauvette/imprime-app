-- Add payload + replay tracking to WebhookEvent
ALTER TABLE "WebhookEvent"
  ADD COLUMN "payload" TEXT,
  ADD COLUMN "replayCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastReplayAt" TIMESTAMP(3);
