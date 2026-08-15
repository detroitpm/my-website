// Saves (upserts, by address) the current SOW, and bulk-upserts every
// priced line item into the rate table as a safety net - the per-field
// blur-triggered save in rate-save.js should already cover most of this,
// but this catches anything that didn't fire (e.g. tab closed before blur).
const { getPool } = require("../../db.js");
const { normalizeKey } = require("../../sow-shared.js");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let sow;
  try {
    sow = JSON.parse(event.body).sow;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!sow || !sow.address || !sow.address.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: "sow.address is required" }) };
  }

  const addressKey = normalizeKey(sow.address);

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO sows (address_key, address, type_of_work, media_link, buffer_pct, sections, questions, contractors, contractor_total_override, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (address_key) DO UPDATE SET
         address = EXCLUDED.address,
         type_of_work = EXCLUDED.type_of_work,
         media_link = EXCLUDED.media_link,
         buffer_pct = EXCLUDED.buffer_pct,
         sections = EXCLUDED.sections,
         questions = EXCLUDED.questions,
         contractors = EXCLUDED.contractors,
         contractor_total_override = EXCLUDED.contractor_total_override,
         updated_at = NOW()
       RETURNING id`,
      [
        addressKey,
        sow.address,
        sow.typeOfWork || null,
        sow.mediaLink || null,
        sow.bufferPct != null ? sow.bufferPct : 20,
        JSON.stringify(sow.sections || []),
        JSON.stringify(sow.questions || []),
        JSON.stringify(sow.contractors || []),
        sow.contractorTotalOverride != null ? sow.contractorTotalOverride : null
      ]
    );

    const rateRows = [];
    (sow.sections || []).forEach(function (section) {
      (section.items || []).forEach(function (item) {
        var text = (item.text || "").trim();
        if (!text) return;
        if (item.labor == null && item.material == null) return;
        rateRows.push({ taskKey: normalizeKey(text), taskText: text, labor: item.labor, material: item.material });
      });
    });

    for (const r of rateRows) {
      await pool.query(
        `INSERT INTO rate_items (task_key, task_text, labor, material, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (task_key) DO UPDATE SET
           task_text = EXCLUDED.task_text,
           labor = COALESCE(EXCLUDED.labor, rate_items.labor),
           material = COALESCE(EXCLUDED.material, rate_items.material),
           updated_at = NOW()`,
        [r.taskKey, r.taskText, r.labor, r.material]
      );
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, id: rows[0].id }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
