-- Round 18 #2 — SavedConfig folders + tags
ALTER TABLE "SavedConfig" ADD COLUMN "folder" TEXT;
ALTER TABLE "SavedConfig" ADD COLUMN "tags" TEXT;
CREATE INDEX "SavedConfig_userId_folder_idx" ON "SavedConfig"("userId", "folder");
