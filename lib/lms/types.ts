export type LmsErrorCode =
  | "NETWORK_ERROR"
  | "LOGIN_FAILED"
  | "SESSION_EXPIRED"
  | "PARSE_ERROR";

export interface LmsCourse {
  id: string;
  name: string;
  professor?: string;
  url: string;
}

export interface LmsAssignment {
  id: string;
  courseId: string;
  title: string;
  url: string;
  dueAt?: Date;
  status: AssignmentStatus;
}

export type AssignmentStatus =
  | "SUBMITTED"
  | "NOT_SUBMITTED"
  | "UNKNOWN";

export class LmsError extends Error {
  readonly code: LmsErrorCode;

  constructor(code: LmsErrorCode, message: string) {
    super(message);
    this.name = "LmsError";
    this.code = code;
  }
}
