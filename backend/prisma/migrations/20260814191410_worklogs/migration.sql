-- CreateTable
CREATE TABLE "Worklog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tempoId" INTEGER NOT NULL,
    "jiraWorklogId" INTEGER,
    "issueKey" TEXT NOT NULL,
    "issueSummary" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "comment" TEXT,
    "role" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Worklog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Worklog_tempoId_key" ON "Worklog"("tempoId");

-- CreateIndex
CREATE INDEX "Worklog_userId_date_idx" ON "Worklog"("userId", "date");

-- AddForeignKey
ALTER TABLE "Worklog" ADD CONSTRAINT "Worklog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
