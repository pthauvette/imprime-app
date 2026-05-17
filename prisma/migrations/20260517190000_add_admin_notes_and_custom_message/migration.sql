-- AlterTable Order : add adminNotes (free-text, admin-only)
ALTER TABLE "Order" ADD COLUMN "adminNotes" TEXT;
