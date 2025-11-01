-- AlterTable
ALTER TABLE "admins" ALTER COLUMN "contactNumber" DROP NOT NULL;

-- AlterTable
ALTER TABLE "doctors" ALTER COLUMN "contactNumber" DROP NOT NULL,
ALTER COLUMN "address" DROP NOT NULL;
