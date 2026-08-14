-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "jiraUsername" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "dailyCapacityMinutes" INTEGER NOT NULL DEFAULT 480,
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Prague',
    "jql" TEXT,
    "showWeekend" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "jiraId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusCategory" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "priority" TEXT,
    "assigneeUsername" TEXT,
    "assigneeName" TEXT,
    "originalEstimateMin" INTEGER,
    "remainingEstimateMin" INTEGER,
    "timeSpentMin" INTEGER,
    "storyPoints" DOUBLE PRECISION,
    "sprintId" INTEGER,
    "rank" TEXT,
    "dueDate" DATE,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "url" TEXT NOT NULL,
    "jiraUpdatedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isOrphaned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sprint" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "completeDate" TIMESTAMP(3),
    "originBoardId" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "issueKeySnapshot" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "plannedMinutes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ICS_URL',
    "name" TEXT NOT NULL,
    "url" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allDayPolicy" TEXT NOT NULL DEFAULT 'SMART',
    "countTentative" BOOLEAN NOT NULL DEFAULT true,
    "etag" TEXT,
    "lastModified" TEXT,
    "contentHash" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT,
    "uid" TEXT NOT NULL,
    "recurrenceId" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "localDate" DATE NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "busyStatus" TEXT NOT NULL DEFAULT 'BUSY',
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "countsToCapacity" BOOLEAN NOT NULL DEFAULT true,
    "overrideMinutes" INTEGER,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "capacityMinutes" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_jiraKey_key" ON "User"("jiraKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_jiraUsername_key" ON "User"("jiraUsername");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_jiraId_key" ON "Issue"("jiraId");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_key_key" ON "Issue"("key");

-- CreateIndex
CREATE INDEX "Issue_assigneeUsername_isResolved_idx" ON "Issue"("assigneeUsername", "isResolved");

-- CreateIndex
CREATE INDEX "Issue_sprintId_idx" ON "Issue"("sprintId");

-- CreateIndex
CREATE INDEX "Issue_projectKey_idx" ON "Issue"("projectKey");

-- CreateIndex
CREATE INDEX "Issue_rank_idx" ON "Issue"("rank");

-- CreateIndex
CREATE INDEX "Sprint_state_idx" ON "Sprint"("state");

-- CreateIndex
CREATE INDEX "Assignment_userId_date_idx" ON "Assignment"("userId", "date");

-- CreateIndex
CREATE INDEX "Assignment_issueId_idx" ON "Assignment"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_userId_issueId_date_key" ON "Assignment"("userId", "issueId", "date");

-- CreateIndex
CREATE INDEX "CalendarSource_userId_enabled_idx" ON "CalendarSource"("userId", "enabled");

-- CreateIndex
CREATE INDEX "CalendarEvent_userId_localDate_idx" ON "CalendarEvent"("userId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_sourceId_uid_recurrenceId_key" ON "CalendarEvent"("sourceId", "uid", "recurrenceId");

-- CreateIndex
CREATE UNIQUE INDEX "DayOverride_userId_date_key" ON "DayOverride"("userId", "date");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSource" ADD CONSTRAINT "CalendarSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CalendarSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOverride" ADD CONSTRAINT "DayOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
