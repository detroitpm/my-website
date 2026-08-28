// Lists recent skill-built reports (id / address / created_at only, no
// body) for the "Load from Claude" picker on pre-purchase-report.html.
const { getPool } = require("../../db.js");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, address, created_at FROM report_stash
       WHERE kind = 'ppr' ORDER BY created_at DESC LIMIT 25`
    );
    return { statusCode: 200, body: JSON.stringify({ stash: rows }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
