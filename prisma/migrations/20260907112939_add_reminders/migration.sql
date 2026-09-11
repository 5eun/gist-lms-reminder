-- CreateEnum
CREATE TYPE "ReminderThreshold" AS ENUM ('H24', 'H6', 'H1');

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "threshold" "ReminderThreshold" NOT NULL,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_assignmentId_threshold_key" ON "Reminder"("assignmentId", "threshold");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
