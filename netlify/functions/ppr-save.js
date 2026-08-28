// Saves (upserts, by address) the current underwriting report. Standalone -
// no rate-table write-through like sow-save.js does (this builder is not
// the place we curate the price book; the SOW builder is).
const { getPool } = require("../../db.js");
const { pprNormalizeKey } = require("../../ppr-shared.js");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let report;
  try {
    report = JSON.parse(event.body).report;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!report || !report.address || !report.address.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: "report.address is required" }) };
  }

  const addressKey = pprNormalizeKey(report.address);

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO underwriting_reports
         (address_key, address, prepared_for, inspection_date, company_name, companycam_project_id,
          media_link, front_exterior_photo, buffer_pct, legal_disclosures,
          context_photos, sections, media_list_links, pm_notes, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, NOW())
       ON CONFLICT (address_key) DO UPDATE SET
         address = EXCLUDED.address,
         prepared_for = EXCLUDED.prepared_for,
         inspection_date = EXCLUDED.inspection_date,
         company_name = EXCLUDED.company_name,
         companycam_project_id = EXCLUDED.companycam_project_id,
         media_link = EXCLUDED.media_link,
         front_exterior_photo = EXCLUDED.front_exterior_photo,
         buffer_pct = EXCLUDED.buffer_pct,
         legal_disclosures = EXCLUDED.legal_disclosures,
         context_photos = EXCLUDED.context_photos,
         sections = EXCLUDED.sections,
         media_list_links = EXCLUDED.media_list_links,
         pm_notes = EXCLUDED.pm_notes,
         updated_at = NOW()
       RETURNING id`,
      [
        addressKey,
        report.address,
        report.preparedFor || null,
        report.inspectionDate || null,
        report.companyName || "Detroit Section 8 Property Management",
        report.companyCamProjectId || null,
        report.mediaLink || null,
        report.frontExteriorPhoto || null,
        report.bufferPct != null ? report.bufferPct : 20,
        report.legalDisclosures || null,
        JSON.stringify(report.contextPhotos || []),
        JSON.stringify(report.sections || []),
        JSON.stringify(report.mediaListLinks || []),
        report.pmNotes || null
      ]
    );
    return { statusCode: 200, body: JSON.stringify({ ok: true, id: rows[0].id }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
