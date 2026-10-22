// Loads one full saved underwriting report by id, shaped to match the
// front-end's `report` object exactly so it drops straight into the builder.
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
      // SELECT * rather than a column list so show_itemized_pricing comes
      // back once its migration has run, without failing before it has.
      `SELECT * FROM underwriting_reports WHERE id = $1`,
      [id]
    );
    if (!rows.length) {
      return { statusCode: 404, body: JSON.stringify({ error: "Not found" }) };
    }
    const row = rows[0];
    return {
      statusCode: 200,
      body: JSON.stringify({
        report: {
          address: row.address || "",
          preparedFor: row.prepared_for || "",
          inspectionDate: row.inspection_date || "",
          companyName: row.company_name || "Detroit Section 8 Property Management",
          companyCamProjectId: row.companycam_project_id || "",
          mediaLink: row.media_link || "",
          frontExteriorPhoto: row.front_exterior_photo || "",
          bufferPct: row.buffer_pct != null ? Number(row.buffer_pct) : 20,
          legalDisclosures: row.legal_disclosures || "",
          contextPhotos: row.context_photos || [],
          sections: row.sections || [],
          mediaListLinks: row.media_list_links || [],
          pmNotes: row.pm_notes || "",
          showItemizedPricing: !!row.show_itemized_pricing
        }
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
