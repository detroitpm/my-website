// Returns one stashed skill-built report by id, shaped exactly like the
// front-end's `report` object so it drops straight into the builder.
const { getPool } = require("../../db.js");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  const id = event.queryStringParameters && event.queryStringParameters.id;
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: "id query param is required" }) };
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT report FROM report_stash WHERE id = $1 AND kind = 'ppr'`, [id]
    );
    if (!rows.length) {
      return { statusCode: 404, body: JSON.stringify({ error: "Not found" }) };
    }
    return { statusCode: 200, body: JSON.stringify({ report: rows[0].report }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
