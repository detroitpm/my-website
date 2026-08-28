// Lists saved pre-purchase underwriting reports (id/address/updated_at only)
// for the "Load previous report" dropdown on pre-purchase-report.html.
const { getPool } = require("../../db.js");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, address, updated_at FROM underwriting_reports ORDER BY updated_at DESC LIMIT 200`
    );
    return { statusCode: 200, body: JSON.stringify({ reports: rows }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
