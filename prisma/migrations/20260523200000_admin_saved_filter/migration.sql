-- Round 26 #5 — Filtres bookmarkés par admin (URL query string + nom).
-- Per-admin (Cascade au delete user). Scope = "orders" | "users" | etc.
-- pour permettre la même fonctionnalité sur d'autres surfaces plus tard.

CREATE TABLE "AdminSavedFilter" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "scope"       TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "queryString" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSavedFilter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminSavedFilter_userId_scope_createdAt_idx"
    ON "AdminSavedFilter"("userId", "scope", "createdAt");

ALTER TABLE "AdminSavedFilter"
    ADD CONSTRAINT "AdminSavedFilter_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
