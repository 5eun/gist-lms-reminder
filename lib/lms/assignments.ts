import * as cheerio from "cheerio";

import { LmsError, type LmsAssignment } from "./types";

const ASSIGNMENT_TABLE_SELECTOR = "table.generaltable";
const NO_ASSIGNMENT_SELECTOR = ".alert.alert-danger";

export function parseAssignments(
  html: string,
  courseId: string,
  baseUrl: string | URL,
): LmsAssignment[] {
  const $ = cheerio.load(html);
  const table = $(ASSIGNMENT_TABLE_SELECTOR).first();

  if (table.length === 0) {
    const noAssignments = $(NO_ASSIGNMENT_SELECTOR).toArray().some((element) =>
      $(element).text().includes("과제가 없습니다"),
    );
    if (noAssignments) {
      return [];
    }
    throw new LmsError("PARSE_ERROR", "Assignment table structure was not found");
  }

  const headers = table.find("tr:first-child th").toArray().map((element) => $(element).text().trim());
  const titleIndex = headers.indexOf("과제");
  const dueIndex = headers.indexOf("종료 일시");
  if (titleIndex < 0 || dueIndex < 0) {
    throw new LmsError("PARSE_ERROR", "Assignment table headers were not found");
  }
  
  const origin = new URL(baseUrl).origin;
  return table.find("tbody tr").filter((_, row) => $(row).find("td[colspan]").length === 0).toArray().map((row) => {
    const cells = $(row).find("td").toArray();
    const titleCell = cells[titleIndex];
    const dueCell = cells[dueIndex];
    const link = titleCell ? $(titleCell).find("a[href]").first() : $([]);
    const href = link.attr("href");
    const title = link.text().trim();

    if (!href || !title || !dueCell) {
      throw new LmsError("PARSE_ERROR", "Assignment row is missing required data");
    }

    const url = new URL(href, baseUrl);
    const id = url.searchParams.get("id");
    if (url.origin !== origin || url.pathname !== "/mod/assign/view.php" || !id) {
      throw new LmsError("PARSE_ERROR", "Assignment link has an invalid URL");
    }

    const dueText = $(dueCell).text().trim();
    const dueAt = dueText ? parseDueDate(dueText) : undefined;
    return {
      id,
      courseId,
      title,
      url: url.toString(),
      status: "UNKNOWN",
      ...(dueAt ? { dueAt } : {}),
    };
  });
}

function parseDueDate(value: string): Date {
  const timestamp = Date.parse(`${value.replace(" ", "T")}+09:00`);
  if (Number.isNaN(timestamp)) {
    throw new LmsError("PARSE_ERROR", "Assignment deadline has an invalid format");
  }
  return new Date(timestamp);
}
