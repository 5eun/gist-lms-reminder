import * as cheerio from "cheerio";

import { LmsError, type LmsCourse } from "./types";

const COURSE_LIST_SELECTOR = ".progress_courses .course_lists .my-course-lists";
const COURSE_LINK_SELECTOR = ".course_box > a.course_link";

export function parseCourses(html: string, baseUrl: string | URL): LmsCourse[] {
  const $ = cheerio.load(html);
  const list = $(COURSE_LIST_SELECTOR);

  if (list.length === 0) {
    throw new LmsError("PARSE_ERROR", "Course list structure was not found");
  }

  const origin = new URL(baseUrl).origin;
  return list.find(COURSE_LINK_SELECTOR).toArray().map((element) => {
    const link = $(element);
    const href = link.attr("href");
    const name = $(link).find("h3").first().text().trim().replace("NEW", "").replace("[", " [");

    if (!href || !name) {
      throw new LmsError("PARSE_ERROR", "Course link is missing required data");
    }

    const url = new URL(href, baseUrl);
    const id = url.searchParams.get("id");
    if (url.origin !== origin || url.pathname !== "/course/view.php" || !id) {
      throw new LmsError("PARSE_ERROR", "Course link has an invalid URL");
    }

    return { id, name, url: url.toString() };
  });
}
