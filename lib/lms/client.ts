import axios, { type AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import * as cheerio from "cheerio";
import { CookieJar } from "tough-cookie";

import { parseCourses } from "./courses";
import { parseAssignments } from "./assignments";
import { parseSubmissionStatus } from "./submission";
import { LmsError } from "./types";
import type { LmsAssignment, LmsCourse } from "./types";

const DEFAULT_BASE_URL = "https://lms.gist.ac.kr";
const LOGIN_PAGE = "/login.php?lang=ko";
const LOGIN_ENDPOINT = "/login/index.php";
const AUTHENTICATED_PAGE = "/";

interface GistLmsClientOptions {
  baseUrl?: string;
}

export class GistLmsClient {
  private readonly http: AxiosInstance;
  private readonly baseUrl: URL;
  private readonly id: string;
  private readonly password: string;

  constructor(
    id: string,
    password: string,
    options: GistLmsClientOptions = {},
  ) {
    this.id = id;
    this.password = password;
    this.baseUrl = new URL(options.baseUrl ?? DEFAULT_BASE_URL);
    this.http = wrapper(
      axios.create({
        baseURL: this.baseUrl.toString(),
        jar: new CookieJar(),
        timeout: 15_000,
        headers: { "User-Agent": "gist-lms-reminder/0.1" },
      }),
    );
  }

  static fromEnv(options: GistLmsClientOptions = {}): GistLmsClient {
    const id = process.env.LMS_ID;
    const password = process.env.LMS_PASSWORD;

    if (!id || !password) {
      throw new LmsError("LOGIN_FAILED", "LMS_ID and LMS_PASSWORD are required");
    }

    return new GistLmsClient(id, password, options);
  }

  async login(): Promise<string> {
    try {
      await this.http.get(LOGIN_PAGE);

      const form = new URLSearchParams({
        username: this.id,
        password: this.password,
        loginbutton: "로그인",
      });

      await this.http.post(LOGIN_ENDPOINT, form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      return await this.fetchAuthenticatedHtml(AUTHENTICATED_PAGE);
    } catch (error: unknown) {
      if (error instanceof LmsError) {
        throw error;
      }

      throw new LmsError(this.isNetworkError(error) ? "NETWORK_ERROR" : "LOGIN_FAILED", "LMS login failed");
    }
  }

  async getCourses(): Promise<LmsCourse[]> {
    return parseCourses(await this.login(), this.baseUrl);
  }

  async getAssignments(courseId: string): Promise<LmsAssignment[]> {
    await this.login();
    const query = new URLSearchParams({ id: courseId });
    const html = await this.fetchAuthenticatedHtml(`/mod/assign/index.php?${query}`);
    const assignments = parseAssignments(html, courseId, this.baseUrl);

    for (const assignment of assignments) {
      const detail = await this.fetchAuthenticatedHtml(
        `/mod/assign/view.php?id=${encodeURIComponent(assignment.id)}`,
      );
      assignment.status = parseSubmissionStatus(detail);
    }

    return assignments;
  }

  async fetchAuthenticatedHtml(pathname: string): Promise<string> {
    const url = this.sameOriginPath(pathname);

    try {
      const response = await this.http.get<string>(url.pathname + url.search);
      if (this.isLoginPage(response.request?.res?.responseUrl, response.data)) {
        throw new LmsError("SESSION_EXPIRED", "LMS session is not authenticated");
      }

      return response.data;
    } catch (error: unknown) {
      if (error instanceof LmsError) {
        throw error;
      }

      throw new LmsError(this.isNetworkError(error) ? "NETWORK_ERROR" : "SESSION_EXPIRED", "LMS request failed");
    }
  }

  private sameOriginPath(pathname: string): URL {
    if (!pathname.startsWith("/") || pathname.startsWith("//")) {
      throw new LmsError("SESSION_EXPIRED", "LMS requests require a same-origin pathname");
    }

    return new URL(pathname, this.baseUrl);
  }

  private isLoginPage(responseUrl: string | undefined, html: string): boolean {
    const path = responseUrl ? new URL(responseUrl).pathname : "";
    return path.startsWith("/login") || cheerio.load(html)("input[name='password']").length > 0;
  }

  private isNetworkError(error: unknown): boolean {
    return axios.isAxiosError(error) && !error.response;
  }
}
