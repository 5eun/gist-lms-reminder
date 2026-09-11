"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PushNotificationButton } from "./push-notification-button";

const ASSIGNMENTS_POLL_INTERVAL_MS = 180_000;
const VISIBILITY_STORAGE_KEY = "gist-lms-reminder:visibility";

type Course = {
  id: string;
  name: string;
  url: string;
};

type Assignment = {
  id: string;
  courseId: string;
  title: string;
  url: string;
  dueAt?: string;
  status: "SUBMITTED" | "NOT_SUBMITTED" | "UNKNOWN";
};

type SyncResult = {
  courses: Course[];
  assignments: Assignment[];
};

type SyncStatus = {
  lastSyncTime: string | null;
};

type VisibilityPreferences = {
  readonly hiddenCourseIds: readonly string[];
  readonly hiddenAssignmentIds: readonly string[];
};

function remainingTime(dueAt?: string, currentTime: number = Date.now()): string {
  if (!dueAt) return "마감 시간 없음";

  const remaining = new Date(dueAt).getTime() - currentTime;
  if (remaining <= 0) return "마감됨";

  const seconds = Math.floor(remaining / 1_000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const restMinutes = Math.floor((seconds % 3_600) / 60);
  const restSeconds = seconds % 60;
  if (days > 0) return `마감까지 ${days}일 ${hours}시간 ${restMinutes}분`;
  if (hours > 0) return `마감까지 ${hours}시간 ${restMinutes}분 ${restSeconds}초`;
  if (restMinutes > 0) return `마감까지 ${restMinutes}분 ${restSeconds}초`;
  return `마감까지 ${restSeconds}초`;
}

function deadlineLabel(dueAt?: string): string {
  if (!dueAt) return "마감 시간 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dueAt));
}

function lastSyncLabel(syncedAt: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(syncedAt);
}

function statusLabel(status: Assignment["status"]): string {
  if (status === "SUBMITTED") return "제출 완료";
  if (status === "NOT_SUBMITTED") return "미제출";
  return "상태 확인 필요";
}

function courseNameParts(name: string): { title: string; suffix: string | null } {
  const match = name.match(/^(.*?)(\s\[\d+\])$/);
  return match ? { title: match[1], suffix: match[2] } : { title: name, suffix: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function normalizeVisibilityPreferences(preferences: VisibilityPreferences): VisibilityPreferences {
  return {
    hiddenCourseIds: [...new Set(preferences.hiddenCourseIds)],
    hiddenAssignmentIds: [...new Set(preferences.hiddenAssignmentIds)],
  };
}

function parseVisibilityPreferences(storedPreferences: string): VisibilityPreferences | null {
  try {
    const value: unknown = JSON.parse(storedPreferences);
    if (!isRecord(value) || !isStringArray(value["hiddenCourseIds"]) || !isStringArray(value["hiddenAssignmentIds"])) {
      return null;
    }

    return normalizeVisibilityPreferences({
      hiddenCourseIds: value["hiddenCourseIds"],
      hiddenAssignmentIds: value["hiddenAssignmentIds"],
    });
  } catch {
    return null;
  }
}

export default function Home() {
  const [result, setResult] = useState<SyncResult | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [visibilityPreferences, setVisibilityPreferences] = useState<VisibilityPreferences>({
    hiddenCourseIds: [],
    hiddenAssignmentIds: [],
  });
  const [visibilityHydrated, setVisibilityHydrated] = useState(false);
  const latestRequest = useRef(0);

  const loadSyncStatus = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const response = await fetch("/api/sync-status", { cache: "no-store", signal });
      if (!response.ok) return;

      const nextStatus: unknown = await response.json();
      if (!isSyncStatus(nextStatus)) return;
      setLastSyncTime(nextStatus.lastSyncTime ? new Date(nextStatus.lastSyncTime) : null);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAssignments(): Promise<void> {
      const requestId = ++latestRequest.current;
      setLoading(true);
      setError(false);
      try {
        const response = await fetch("/api/assignments", { signal: controller.signal });
        if (!response.ok) throw new Error("Assignments load failed");
        const nextResult: unknown = await response.json();
        if (!isSyncResult(nextResult)) throw new Error("Invalid assignments response");
        if (requestId === latestRequest.current) setResult(nextResult);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!controller.signal.aborted && requestId === latestRequest.current) setError(true);
      } finally {
        if (!controller.signal.aborted && requestId === latestRequest.current) setLoading(false);
      }
    }

    void loadAssignments();
    const interval = window.setInterval(() => void loadAssignments(), ASSIGNMENTS_POLL_INTERVAL_MS);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = window.setTimeout(() => void loadSyncStatus(controller.signal), 0);
    const interval = window.setInterval(() => void loadSyncStatus(controller.signal), 60_000);

    return () => {
      controller.abort();
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadSyncStatus]);

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    function closeMenus(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      document.querySelectorAll<HTMLDetailsElement>("main details[open]").forEach((menu) => {
        if (!menu.contains(target)) menu.open = false;
      });
    }

    document.addEventListener("click", closeMenus);
    return () => document.removeEventListener("click", closeMenus);
  }, []);

  useEffect(() => {
    const hydration = window.setTimeout(() => {
      let storedPreferences: string | null = null;
      try {
        storedPreferences = window.localStorage.getItem(VISIBILITY_STORAGE_KEY);
      } catch {
        storedPreferences = null;
      }

      if (storedPreferences) {
        const parsedPreferences = parseVisibilityPreferences(storedPreferences);
        if (parsedPreferences) setVisibilityPreferences(parsedPreferences);
      }
      setVisibilityHydrated(true);
    }, 0);

    return () => window.clearTimeout(hydration);
  }, []);

  useEffect(() => {
    if (!visibilityHydrated) return;

    try {
      window.localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(visibilityPreferences));
    } catch {
      return;
    }
  }, [visibilityHydrated, visibilityPreferences]);

  function setCourseVisibility(courseId: string, visible: boolean): void {
    setVisibilityPreferences((currentPreferences) => ({
      ...currentPreferences,
      hiddenCourseIds: visible
        ? currentPreferences.hiddenCourseIds.filter((id) => id !== courseId)
        : currentPreferences.hiddenCourseIds.includes(courseId)
          ? currentPreferences.hiddenCourseIds
          : [...currentPreferences.hiddenCourseIds, courseId],
    }));
  }

  function setAssignmentVisibility(assignmentId: string, visible: boolean): void {
    setVisibilityPreferences((currentPreferences) => ({
      ...currentPreferences,
      hiddenAssignmentIds: visible
        ? currentPreferences.hiddenAssignmentIds.filter((id) => id !== assignmentId)
        : currentPreferences.hiddenAssignmentIds.includes(assignmentId)
          ? currentPreferences.hiddenAssignmentIds
          : [...currentPreferences.hiddenAssignmentIds, assignmentId],
    }));
  }

  async function syncAssignments(): Promise<void> {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      if (!response.ok) throw new Error("Sync failed");
      const nextResult: unknown = await response.json();
      if (!isSyncResult(nextResult)) throw new Error("Invalid sync result");
      if (requestId === latestRequest.current) setResult(nextResult);
      await loadSyncStatus();
    } catch {
      if (requestId === latestRequest.current) setError(true);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-zinc-50 px-5 py-10 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50 sm:px-8 sm:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-10 flex flex-col gap-8 border-b border-zinc-200 pb-8 dark:border-zinc-800 sm:mb-12 sm:pb-10">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">GIST LMS</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">과제 리마인더</h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
              강좌별 과제와 마감 시간을 확인하세요.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:self-end">
            <PushNotificationButton />
            <button
              type="button"
              onClick={syncAssignments}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 disabled:cursor-wait disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 dark:focus-visible:outline-white"
            >
              {loading ? "불러오는 중..." : "과제 동기화"}
            </button>
          </div>
        </header>

        <div aria-atomic="true" aria-live="polite" className="mb-6 min-h-6 text-sm">
          {loading && <p className="text-zinc-500 dark:text-zinc-400">최신 과제를 불러오는 중입니다.</p>}
          {!loading && !error && lastSyncTime && (
            <p className="text-zinc-500 dark:text-zinc-400">
              마지막 동기화: <time dateTime={lastSyncTime.toISOString()}>{lastSyncLabel(lastSyncTime)}</time>
            </p>
          )}
        </div>

        <div aria-busy={loading}>
        {!result && loading && (
          <section aria-hidden="true" className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="h-5 w-2/5 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-4 w-3/5 rounded bg-zinc-100 dark:bg-zinc-800/70" />
          </section>
        )}

        {error && (
          <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-950 dark:bg-red-950/30" role="alert">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">동기화 오류</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-red-950 dark:text-red-50">과제 정보를 불러오지 못했습니다</h2>
            <p className="mt-2 text-sm leading-6 text-red-800 dark:text-red-200">과제 동기화 버튼을 눌러 다시 시도해 주세요.</p>
          </section>
        )}

        {!result && !loading && !error && (
          <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 dark:border-zinc-700 dark:bg-zinc-900 sm:p-10">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">시작하기</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">아직 동기화하지 않았습니다</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">과제 동기화 버튼을 눌러 LMS의 최신 과제를 불러오세요.</p>
          </section>
        )}

        {result && result.courses.length === 0 && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900 sm:p-10">
            <h2 className="text-xl font-semibold tracking-tight">수강 중인 강좌가 없습니다</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">LMS에 등록된 강좌가 확인되면 이곳에 표시됩니다.</p>
          </section>
        )}

        {result && result.courses.length > 0 && (
          <div className="space-y-8">
            {[...result.courses]
              .sort((left, right) => {
                const leftHidden = visibilityPreferences.hiddenCourseIds.includes(left.id);
                const rightHidden = visibilityPreferences.hiddenCourseIds.includes(right.id);
                return Number(leftHidden) - Number(rightHidden);
              })
              .map((course) => {
              const assignments = result.assignments.filter((assignment) => assignment.courseId === course.id);
              const courseIsVisible = !visibilityPreferences.hiddenCourseIds.includes(course.id);
              const visibleAssignments = assignments.filter((assignment) => !visibilityPreferences.hiddenAssignmentIds.includes(assignment.id));
              const nameParts = courseNameParts(course.name);
              return (
                <section key={course.id} aria-labelledby={`course-${course.id}`}>
                  <div className="mb-3 flex flex-col gap-3 border-b border-zinc-200 pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 dark:border-zinc-800">
                    <h2 id={`course-${course.id}`} className="text-xl font-semibold tracking-tight">
                      {nameParts.title}
                      {nameParts.suffix && <span className="whitespace-nowrap">{nameParts.suffix}</span>}
                    </h2>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">{assignments.length}개 과제</span>
                      <details className="relative">
                        <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full text-lg text-zinc-500 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:focus-visible:outline-white [&::-webkit-details-marker]:hidden" aria-label={`${course.name} 표시 설정`}>
                          <span aria-hidden="true">⋯</span>
                        </summary>
                        <div className="absolute right-0 top-12 z-20 w-52 max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={courseIsVisible}
                            aria-label={`${course.name} 강좌 표시`}
                            onClick={() => setCourseVisibility(course.id, !courseIsVisible)}
                            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 text-sm font-medium text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:text-zinc-50 dark:focus-visible:outline-white"
                          >
                            강좌 표시
                            <span className={`relative inline-flex h-7 w-11 shrink-0 items-center rounded-full p-0.5 ${courseIsVisible ? "bg-zinc-950 dark:bg-white" : "bg-zinc-300 dark:bg-zinc-700"}`}>
                              <span className={`block size-6 rounded-full bg-white shadow-sm transition-transform dark:bg-zinc-950 ${courseIsVisible ? "translate-x-4" : "translate-x-0"}`} />
                            </span>
                          </button>
                        </div>
                      </details>
                    </div>
                  </div>
                  {!courseIsVisible ? (
                    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                      이 강좌는 숨김 상태입니다.
                    </div>
                  ) : assignments.length === 0 ? (
                    <p className="rounded-xl border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                      등록된 과제가 없습니다.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {visibleAssignments.length === 0 && (
                        <p className="rounded-xl border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                          모든 과제가 숨김 상태입니다. 아래에서 다시 표시할 수 있습니다.
                        </p>
                      )}
                      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
                        {assignments.map((assignment) => {
                          const assignmentIsVisible = !visibilityPreferences.hiddenAssignmentIds.includes(assignment.id);
                          return (
                            <li key={assignment.id} className="relative flex min-w-0 flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <a className="-mx-1 inline-flex min-h-11 min-w-11 items-center break-words px-1 font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-950 dark:focus-visible:outline-white" href={assignment.url} target="_blank" rel="noreferrer">
                                  {assignment.title}
                                  <span className="sr-only"> (새 탭에서 열기)</span>
                                </a>
                                {assignmentIsVisible ? (
                                  <time className="mt-2 block text-sm text-zinc-500 dark:text-zinc-400" dateTime={assignment.dueAt}>
                                    마감: {deadlineLabel(assignment.dueAt)}
                                  </time>
                                ) : (
                                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">숨김 상태</p>
                                )}
                              </div>
                              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-sm">
                                {assignmentIsVisible && (
                                  <>
                                    <span aria-live="off" className="tabular-nums text-zinc-600 dark:text-zinc-300">{remainingTime(assignment.dueAt, currentTime)}</span>
                                    <span className={assignment.status === "SUBMITTED" ? "rounded-full bg-emerald-100 px-3 py-1 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "rounded-full bg-zinc-100 px-3 py-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}>
                                      {statusLabel(assignment.status)}
                                    </span>
                                  </>
                                )}
                                <details className="relative">
                                  <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full text-lg text-zinc-500 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:focus-visible:outline-white [&::-webkit-details-marker]:hidden" aria-label={`${assignment.title} 표시 설정`}>
                                    <span aria-hidden="true">⋯</span>
                                  </summary>
                                  <div className="absolute right-0 top-12 z-20 w-52 max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={assignmentIsVisible}
                                      aria-label={`${assignment.title} 과제 표시`}
                                      onClick={() => setAssignmentVisibility(assignment.id, !assignmentIsVisible)}
                                      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 text-sm font-medium text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:text-zinc-50 dark:focus-visible:outline-white"
                                    >
                                      과제 표시
                                      <span className={`relative inline-flex h-7 w-11 shrink-0 items-center rounded-full p-0.5 ${assignmentIsVisible ? "bg-zinc-950 dark:bg-white" : "bg-zinc-300 dark:bg-zinc-700"}`}>
                                        <span className={`block size-6 rounded-full bg-white shadow-sm transition-transform dark:bg-zinc-950 ${assignmentIsVisible ? "translate-x-4" : "translate-x-0"}`} />
                                      </span>
                                    </button>
                                  </div>
                                </details>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </section>
              );
              })}
          </div>
        )}
        </div>
      </div>
    </main>
  );
}

function isSyncResult(value: unknown): value is SyncResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { courses?: unknown; assignments?: unknown };
  return Array.isArray(candidate.courses) && Array.isArray(candidate.assignments);
}

function isSyncStatus(value: unknown): value is SyncStatus {
  if (typeof value !== "object" || value === null || !("lastSyncTime" in value)) return false;
  return value.lastSyncTime === null || typeof value.lastSyncTime === "string";
}
