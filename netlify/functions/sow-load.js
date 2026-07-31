// Loads one full saved SOW by id, shaped to match the front-end's `sow`
// object exactly so it can be dropped in as-is.
const { getDatabase } = require("@netlify/database");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const id = event.queryStringParameters && event.queryStringParameters.id;
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: "id query param is required" }) };
  }

  try {
    const db = getDatabase();
    const rows = await db.sql`
      SELECT address, type_of_work, media_link, buffer_pct, sections, questions
      FROM sows WHERE id = ${id}
    `;
    if (!rows.length) {
      return { statusCode: 404, body: JSON.stringify({ error: "Not found" }) };
    }
    const row = rows[0];
    return {
      statusCode: 200,
      body: JSON.stringify({
        sow: {
          address: row.address || "",
          typeOfWork: row.type_of_work || "Pre-inspection list",
          mediaLink: row.media_link || "",
          bufferPct: row.buffer_pct != null ? Number(row.buffer_pct) : 20,
          sections: row.sections || [],
          questions: row.questions || []
        }
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
