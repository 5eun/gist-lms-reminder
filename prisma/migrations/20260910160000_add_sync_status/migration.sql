CREATE TABLE "SyncStatus" (
    "id" TEXT NOT NULL,
    "lastSyncTime" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SyncStatus_pkey" PRIMARY KEY ("id")
);
