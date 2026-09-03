// Resolves one CompanyCam photo permalink to a real image URL so a SOW line
// item's photo can be shown inline (the lightbox in sow-lightbox.js) instead
// of navigating away.
//
// A line item's stored photoUrl is https://app.companycam.com/assets/Image/123
// - an app *page*, not an image file. It can't be used as an <img src>, and
// following it drops whoever is reading the SOW into CompanyCam behind a
// login. This endpoint takes that photo's numeric id and hands back the
// actual static image URI. The API key stays server-side
// (COMPANYCAM_API_KEY), same as the other companycam functions.
const API = "https://api.companycam.com/v2";

// The CompanyCam static image URL carries its size as a `?d=WxH` param, so a
// bigger variant is a string swap rather than a second API call.
function atSize(uri, size) {
  if (!uri) return uri;
  return uri.replace(/([?&]d=)\d+x\d+/, "$1" + size + "x" + size);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const id = event.queryStringParameters && event.queryStringParameters.id;
  if (!id || !/^\d+$/.test(id)) {
    return { statusCode: 400, body: JSON.stringify({ error: "id query param must be a CompanyCam photo id" }) };
  }

  const apiKey = process.env.COMPANYCAM_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server is missing COMPANYCAM_API_KEY" }) };
  }

  try {
    const resp = await fetch(`${API}/photos/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { statusCode: resp.status, body: JSON.stringify({ error: `CompanyCam responded ${resp.status}: ${text}` }) };
    }
    const p = await resp.json();
    const uris = p.uris || [];
    const pick = function (type) { return (uris.find(function (u) { return u.type === type; }) || {}).uri || ""; };
    const web = pick("web") || pick("original");
    if (!web) {
      return { statusCode: 404, body: JSON.stringify({ error: "That photo has no image to show yet" }) };
    }
    const desc = p.description && (p.description.plain_text_content || (typeof p.description === "string" ? p.description : ""));
    return {
      statusCode: 200,
      // Photo URIs are stable, so let the browser and CDN hold them for an
      // hour - a SOW with 80 lines shouldn't hit the API 80 times per reload.
      headers: { "Cache-Control": "public, max-age=3600" },
      body: JSON.stringify({
        photo: {
          id: String(p.id),
          displayUrl: atSize(web, 1600),
          thumbUrl: pick("thumbnail") || web,
          description: desc || "",
          photoUrl: p.photo_url || ""
        }
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
