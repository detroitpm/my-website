// Returns the full global contractor list for the browser to cache
// client-side, same pattern as rates-list.js - one fetch on page load
// instead of a round trip per dropdown render.
const { getPool } = require("../../db.js");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(`SELECT name FROM contractors ORDER BY name ASC`);
    return {
      statusCode: 200,
      body: JSON.stringify({ contractors: rows.map(function (r) { return r.name; }) })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
