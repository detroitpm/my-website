// Adds one name to the global contractor list. Called when the user types
// a new contractor and hits "+ Add contractor" - the list is shared across
// every SOW from then on, so this is a one-time add, not a per-SOW save.
const { getPool } = require("../../db.js");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const name = (payload.name || "").trim();
  if (!name) {
    return { statusCode: 400, body: JSON.stringify({ error: "name is required" }) };
  }

  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO contractors (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      [name]
    );
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
