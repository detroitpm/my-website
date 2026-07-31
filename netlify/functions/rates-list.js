// Returns the entire rate table for the browser to cache client-side, so
// price auto-fill (exact match on line-item text) doesn't need a network
// round trip per line item - just one fetch on page load.
const { getDatabase } = require("@netlify/database");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const db = getDatabase();
  try {
    const rows = await db.sql`
      SELECT task_key, task_text, labor, material FROM rate_items
    `;
    return {
      statusCode: 200,
      body: JSON.stringify({
        rates: rows.map(function (r) {
          return {
            taskKey: r.task_key,
            taskText: r.task_text,
            labor: r.labor != null ? Number(r.labor) : null,
            material: r.material != null ? Number(r.material) : null
          };
        })
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
