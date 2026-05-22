-- Round 25 #4 — Admin reply to customer reviews.
-- Trustpilot-style: une réponse publique de Plio sous chaque review.
-- Tous les rows existants restent NULL (pas de réponse encore).
ALTER TABLE "Review" ADD COLUMN "adminReply" TEXT;
ALTER TABLE "Review" ADD COLUMN "adminReplyAt" TIMESTAMP(3);
