// Upserts a single rate item - called on price-field blur as the user
// builds a SOW, so "each line I enter gets stored" happens live rather
// than only when the whole SOW is explicitly saved. Only overwrites the
// field that was actually provided (COALESCE keeps the other one intact),
// so blurring an empty Labor field doesn't wipe out a previously-recorded
// Material price for the same task, or vice versa.
const { getDatabase } = require("@netlify/database");
const { normalizeKey } = require("../../sow-shared.js");

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

  const text = (payload.text || "").trim();
  if (!text) {
    return { statusCode: 400, body: JSON.stringify({ error: "text is required" }) };
  }
  if (payload.labor == null && payload.material == null) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true }) };
  }

  const taskKey = normalizeKey(text);

  try {
    const db = getDatabase();
    await db.sql`
      INSERT INTO rate_items (task_key, task_text, labor, material, updated_at)
      VALUES (${taskKey}, ${text}, ${payload.labor}, ${payload.material}, NOW())
      ON CONFLICT (task_key) DO UPDATE SET
        task_text = EXCLUDED.task_text,
        labor = COALESCE(EXCLUDED.labor, rate_items.labor),
        material = COALESCE(EXCLUDED.material, rate_items.material),
        updated_at = NOW()
    `;
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
