-- Round 26 #3 — Track chaque manual replay d'un WebhookEvent.
-- L'aggregate WebhookEvent.replayCount + lastReplayAt restent pour query
-- rapide, mais le détail (qui, quand, outcome) vit ici.

CREATE TABLE "WebhookReplay" (
    "id"              TEXT NOT NULL,
    "webhookEventId"  TEXT NOT NULL,
    "replayedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replayedBy"      TEXT,
    "replayedByEmail" TEXT,
    "success"         BOOLEAN NOT NULL,
    "statusCode"      INTEGER,
    "errorMessage"    TEXT,
    "latencyMs"       INTEGER,

    CONSTRAINT "WebhookReplay_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookReplay_webhookEventId_replayedAt_idx"
    ON "WebhookReplay"("webhookEventId", "replayedAt");

ALTER TABLE "WebhookReplay"
    ADD CONSTRAINT "WebhookReplay_webhookEventId_fkey"
    FOREIGN KEY ("webhookEventId") REFERENCES "WebhookEvent"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
