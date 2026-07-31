// Lists saved SOWs (id/address/updated_at only, no line-item content) for
// the "Load previous SOW" dropdown.
const { getDatabase } = require("@netlify/database");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const db = getDatabase();
    const rows = await db.sql`
      SELECT id, address, updated_at FROM sows ORDER BY updated_at DESC LIMIT 200
    `;
    return { statusCode: 200, body: JSON.stringify({ sows: rows }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
