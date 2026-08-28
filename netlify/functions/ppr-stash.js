// Receives a finished report from the build-underwriting-report skill so it
// doesn't have to be saved as a file and hand-uploaded. The skill POSTs
// { report: {...} } here; pre-purchase-report.html then lists it under
// "Load from Claude". Rolling inbox - old rows are pruned on each insert.
//
// Unauthenticated, same as ppr-save / sow-save (the builder is an internal
// tool with no login). The payload is validated strictly and size-capped so
// a stray POST can't wedge anything; worst case is a junk row the picker
// shows and the user ignores.
const { getPool } = require("../../db.js");

const MAX_BYTES = 300 * 1024; // a report with no embedded images is a few KB
const KEEP_DAYS = 30;

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  if (event.body && event.body.length > MAX_BYTES) {
    return { statusCode: 413, body: JSON.stringify({ error: "Payload too large" }) };
  }

  let report;
  try {
    report = JSON.parse(event.body).report;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!report || typeof report !== "object") {
    return { statusCode: 400, body: JSON.stringify({ error: "report object is required" }) };
  }
  if (!report.address || !String(report.address).trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: "report.address is required" }) };
  }
  if (!Array.isArray(report.sections)) {
    return { statusCode: 400, body: JSON.stringify({ error: "report.sections must be an array" }) };
  }
  for (const s of report.sections) {
    if (!s || typeof s.room !== "string" || !Array.isArray(s.items)) {
      return { statusCode: 400, body: JSON.stringify({ error: "each section needs a room string and an items array" }) };
    }
  }

  try {
    const pool = getPool();
    await pool.query(`DELETE FROM report_stash WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(KEEP_DAYS)]);
    const { rows } = await pool.query(
      `INSERT INTO report_stash (kind, address, source, report)
       VALUES ('ppr', $1, $2, $3) RETURNING id`,
      [String(report.address), "build-underwriting-report skill", JSON.stringify(report)]
    );
    return { statusCode: 200, body: JSON.stringify({ ok: true, id: rows[0].id }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
