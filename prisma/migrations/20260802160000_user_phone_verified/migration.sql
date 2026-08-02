-- Téléphone VÉRIFIÉ par code SMS — identité de connexion, distinct du
-- téléphone de livraison (`phone`, saisi librement au checkout, non vérifié).
ALTER TABLE "User" ADD COLUMN "phoneVerified" TEXT;
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- Unicité : deux comptes ne peuvent pas revendiquer le même numéro, sinon
-- « ce numéro → ce compte » serait ambigu. Index UNIQUE Postgres : les NULL
-- ne s'y comparent pas, donc tous les comptes existants (phoneVerified NULL)
-- coexistent sans conflit.
CREATE UNIQUE INDEX "User_phoneVerified_key" ON "User"("phoneVerified");
