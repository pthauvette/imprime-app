-- finding [17] — ETA honnête sur toutes les surfaces (docs/experience-client-2026-07.md).
--
-- computeOrderEta (src/lib/orders/timeline.ts) utilisait jusqu'ici une
-- heuristique forfaitaire (7j production+transit, ou 3j transit seul après
-- expédition) IDENTIQUE peu importe le produit ou le transporteur réel — la
-- promesse la plus vérifiable du produit était fausse par construction.
--
-- Ces 2 colonnes captent les jours RÉELS résolus au moment de la commande
-- (Turnaround Sinalite sélectionné + devis transporteur signé, cf.
-- /api/shipping/estimate). NULL pour les commandes déjà en base (avant ce
-- fix) ou créées via MCP headless (create_order Mode B ne les capte pas
-- encore) : computeOrderEta retombe alors sur l'heuristique forfaitaire —
-- aucune régression, juste moins précis.
ALTER TABLE "Order" ADD COLUMN "productionDays" INTEGER;
ALTER TABLE "Order" ADD COLUMN "transitDays" INTEGER;
