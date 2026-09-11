CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "AssignmentStatus" AS ENUM ('SUBMITTED', 'NOT_SUBMITTED', 'UNKNOWN');

CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "professor" TEXT,
    "url" TEXT NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "dueAt" TIMESTAMPTZ(3),
    "status" "AssignmentStatus" NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
