// Saves (upserts, by address) the current SOW, and bulk-upserts every
// priced line item into the rate table as a safety net - the per-field
// blur-triggered save in rate-save.js should already cover most of this,
// but this catches anything that didn't fire (e.g. tab closed before blur).
const { getPool } = require("../../db.js");
const { normalizeKey, usablePrice } = require("../../sow-shared.js");

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
  // Address alone no longer identifies a SOW - a property can have several
  // (e.g. "Pre-inspection list 1" and "Pre-inspection list 2"). Normalized so
  // casing and stray spaces don't split one SOW into two.
  const typeOfWorkKey = normalizeKey(sow.typeOfWork);

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO sows (address_key, address, type_of_work, type_of_work_key, media_link, buffer_pct, sections, questions, contractor_total_override, key_location, show_key_location, show_itemized_pricing, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       ON CONFLICT (address_key, type_of_work_key) DO UPDATE SET
         address = EXCLUDED.address,
         type_of_work = EXCLUDED.type_of_work,
         media_link = EXCLUDED.media_link,
         buffer_pct = EXCLUDED.buffer_pct,
         sections = EXCLUDED.sections,
         questions = EXCLUDED.questions,
         contractor_total_override = EXCLUDED.contractor_total_override,
         key_location = EXCLUDED.key_location,
         show_key_location = EXCLUDED.show_key_location,
         show_itemized_pricing = EXCLUDED.show_itemized_pricing,
         updated_at = NOW()
       RETURNING id`,
      [
        addressKey,
        sow.address,
        sow.typeOfWork || null,
        typeOfWorkKey,
        sow.mediaLink || null,
        sow.bufferPct != null ? sow.bufferPct : 20,
        JSON.stringify(sow.sections || []),
        JSON.stringify(sow.questions || []),
        sow.contractorTotalOverride != null ? sow.contractorTotalOverride : null,
        sow.keyLocation || null,
        sow.showKeyLocation !== false,
        !!sow.showItemizedPricing
      ]
    );

    const rateRows = [];
    (sow.sections || []).forEach(function (section) {
      (section.items || []).forEach(function (item) {
        var text = (item.text || "").trim();
        if (!text) return;
        // priceSource marks a price the builder guessed and no human has
        // accepted yet. Learning from those would make the rate table match
        // future SOWs against its own guesses, so they never come in here.
        if (item.priceSource) return;
        var labor = usablePrice(item.labor);
        var material = usablePrice(item.material);
        if (labor == null && material == null) return;
        rateRows.push({ taskKey: normalizeKey(text), taskText: text, labor: labor, material: material });
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
