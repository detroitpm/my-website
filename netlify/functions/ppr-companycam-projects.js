// Returns the whole account's CompanyCam project list (id / name / address /
// url) so the report builder can offer a search box that filters locally —
// no API call per keystroke. Read-only. The CompanyCam API key stays
// server-side (COMPANYCAM_API_KEY), same as the other ppr-companycam-* fns.
const API = "https://api.companycam.com/v2";
const MAX_PAGES = 30; // 30 * 100 = 3000 projects, well past this account's size

function addressString(a) {
  if (!a) return "";
  return [a.street_address_1, a.street_address_2, a.city, a.state, a.postal_code]
    .filter(Boolean).join(", ");
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.COMPANYCAM_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server is missing COMPANYCAM_API_KEY" }) };
  }

  try {
    const out = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const resp = await fetch(`${API}/projects?per_page=100&page=${page}&sort=-updated_at`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      if (!resp.ok) {
        const text = await resp.text();
        return { statusCode: resp.status, body: JSON.stringify({ error: `CompanyCam responded ${resp.status}: ${text}` }) };
      }
      const batch = await resp.json();
      if (!Array.isArray(batch) || !batch.length) break;
      batch.forEach(function (p) {
        out.push({
          id: p.id,
          name: p.name || "",
          address: addressString(p.address),
          url: p.project_url || `https://app.companycam.com/projects/${p.id}`,
          status: p.status || ""
        });
      });
      if (batch.length < 100) break;
    }
    return {
      statusCode: 200,
      // Let the browser cache the list for 5 min so re-opens don't refetch.
      headers: { "Cache-Control": "public, max-age=300" },
      body: JSON.stringify({ projects: out })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
