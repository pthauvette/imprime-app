-- Round 16 #4 : UNIQUE (email, productId) sur AbandonedCart pour fix
-- la race condition (2 POSTs concurrents créaient 2 rows). L'API utilise
-- maintenant upsert sur ce composite key.
--
-- Edge case : si la table contient déjà des doublons (carts dupliqués
-- pendant la fenêtre racy), le ADD UNIQUE va fail. On dédup d'abord
-- en gardant la row la plus récente par (email, productId).

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY email, "productId"
           ORDER BY "updatedAt" DESC, id DESC
         ) AS rn
  FROM "AbandonedCart"
)
DELETE FROM "AbandonedCart"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX "AbandonedCart_email_productId_key"
  ON "AbandonedCart"("email", "productId");
