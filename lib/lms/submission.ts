import * as cheerio from "cheerio";

import type { AssignmentStatus } from "./types";

const STATUS_TABLE_SELECTOR = ".submissionstatustable";

export function parseSubmissionStatus(html: string): AssignmentStatus {
  const $ = cheerio.load(html);
  const row = $(STATUS_TABLE_SELECTOR)
    .find("tr")
    .toArray()
    .find((element) => $(element).find("td").first().text().trim() === "제출 여부");

  if (!row) {
    return "UNKNOWN";
  }

  return ($(row).find("td").eq(1).text().trim() == "제출 완료") ? "SUBMITTED"
  : $(row).find("td").eq(1).text().trim() === "제출 안 함" ? "NOT_SUBMITTED"
  : "UNKNOWN";
}
