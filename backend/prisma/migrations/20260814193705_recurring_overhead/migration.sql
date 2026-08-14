-- CreateTable
CREATE TABLE "RecurringOverhead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "weekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringOverhead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringOverhead_userId_idx" ON "RecurringOverhead"("userId");

-- AddForeignKey
ALTER TABLE "RecurringOverhead" ADD CONSTRAINT "RecurringOverhead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
