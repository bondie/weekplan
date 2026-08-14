-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ignoredProjects" TEXT[] DEFAULT ARRAY[]::TEXT[];
