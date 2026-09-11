import assert from "node:assert/strict";

import { parseAssignments } from "../lib/lms/assignments";

const html = `
  <table class="generaltable">
    <thead><tr><th>주</th><th>과제</th><th>종료 일시</th><th>제출</th><th>성적</th></tr></thead>
    <tbody>
      <tr><td></td><td><a href="/mod/assign/view.php?id=137984">Attitude</a></td><td>2026-12-25 00:00</td><td>미제출</td><td>10.00</td></tr>
      <tr><td>2주차</td><td><a href="/mod/assign/view.php?id=139659">HW1</a></td><td>2026-09-11 23:00</td><td>제출 완료</td><td>-</td></tr>
      <tr><td colspan="5"><div class="tabledivider"></div></td></tr>
      <tr><td>3주차</td><td><a href="/mod/assign/view.php?id=140397">HW2</a></td><td>2026-09-18 23:00</td><td>미제출</td><td>-</td></tr>
    </tbody>
  </table>
`;

const assignments = parseAssignments(html, "27920", "https://lms.gist.ac.kr");

assert.deepEqual(assignments.map((assignment) => assignment.id), ["137984", "139659", "140397"]);
console.log(JSON.stringify({ assignmentCount: assignments.length }));
