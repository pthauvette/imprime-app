-- Round 26 #2 — instructions de livraison customer-fournies.
-- Optional, max 200 chars enforced côté API Zod (pas en DB pour permettre
-- update via admin sans contrainte). Existing rows = NULL.
ALTER TABLE "Order" ADD COLUMN "shippingNote" TEXT;
