// Lists a CompanyCam project's photos so the report builder can offer a
// picker for Section 3 (room context photos) and the cover's front-exterior
// shot. Read-only. The CompanyCam API key stays server-side
// (COMPANYCAM_API_KEY), never sent to the browser - same as
// send-to-companycam.js.
const API = "https://api.companycam.com/v2";

// The CompanyCam static image URL carries its size as a `?d=WxH` param.
// The list endpoint hands back a 400x400 "web" variant; for a printed
// report we want something sharper, so bump it.
function atSize(uri, size) {
  if (!uri) return uri;
  return uri.replace(/([?&]d=)\d+x\d+/, "$1" + size + "x" + size);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const projectId = event.queryStringParameters && event.queryStringParameters.projectId;
  if (!projectId) {
    return { statusCode: 400, body: JSON.stringify({ error: "projectId query param is required" }) };
  }

  const apiKey = process.env.COMPANYCAM_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server is missing COMPANYCAM_API_KEY" }) };
  }

  try {
    const out = [];
    // Paginate - CompanyCam caps per_page at 100.
    for (let page = 1; page <= 10; page++) {
      const resp = await fetch(`${API}/projects/${projectId}/photos?per_page=100&page=${page}`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      if (!resp.ok) {
        const text = await resp.text();
        return { statusCode: resp.status, body: JSON.stringify({ error: `CompanyCam responded ${resp.status}: ${text}` }) };
      }
      const batch = await resp.json();
      if (!Array.isArray(batch) || !batch.length) break;
      batch.forEach(function (p) {
        const uris = p.uris || [];
        const web = (uris.find(function (u) { return u.type === "web"; }) || {}).uri || "";
        const thumb = (uris.find(function (u) { return u.type === "thumbnail"; }) || {}).uri || web;
        out.push({
          id: p.id,
          capturedAt: p.captured_at,
          description: (p.description && (p.description.plain_text_content || p.description)) || "",
          photoUrl: p.photo_url || "",
          thumbUrl: thumb,
          displayUrl: atSize(web, 1600)
        });
      });
      if (batch.length < 100) break;
    }
    out.sort(function (a, b) { return (a.capturedAt || 0) - (b.capturedAt || 0); });
    return { statusCode: 200, body: JSON.stringify({ photos: out }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
