// Lists saved SOWs (id/address/type/updated_at only, no line-item content)
// for the "Load previous SOW" dropdown. type_of_work comes back because a
// property can have more than one SOW now, and the address alone wouldn't
// tell them apart in the list.
const { getPool } = require("../../db.js");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, address, type_of_work, updated_at FROM sows ORDER BY updated_at DESC LIMIT 200`
    );
    return { statusCode: 200, body: JSON.stringify({ sows: rows }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
