-- Round 39 #4 — EmailSuppression list for AWS SES bounces/complaints.
--
-- Sans ce table, on continue d'envoyer aux addresses hard-bounced ou
-- complained → SES degrade notre reputation Sender Score → futurs emails
-- (transactionnels inclus) tombent en spam ou sont throttled.
--
-- Source of truth: row dans EmailSuppression = ne plus JAMAIS envoyer
-- à cette address, peu importe le template. checkSuppressed() est appelé
-- au début de queueEmail(), avant le throttle check.

CREATE TABLE "EmailSuppression" (
  "id"            TEXT NOT NULL,
  "email"         TEXT NOT NULL,
  "reason"        TEXT NOT NULL,
  "source"        TEXT NOT NULL,
  "sesMessageId"  TEXT,
  "details"       TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- email est toujours lowercased par les helpers ; UNIQUE empêche les
-- doublons sur replay SNS (le webhook check createMany skipDuplicates).
CREATE UNIQUE INDEX "EmailSuppression_email_key" ON "EmailSuppression"("email");
CREATE INDEX "EmailSuppression_createdAt_idx" ON "EmailSuppression"("createdAt");
CREATE INDEX "EmailSuppression_reason_idx" ON "EmailSuppression"("reason");
