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

// CompanyCam hands back two different URL shapes depending on the photo:
//
//   static.companycam.com/....jpeg?d=400x400          size is a query param
//   img.companycam.com/<signature>/rs:fit:400:400/... size is in a SIGNED path
//
// The first can be bumped to a bigger variant with a string swap. The second
// cannot: editing the path invalidates the signature and the CDN answers 403.
// So rewrite only the query-param form, and otherwise fall back to the
// `original` variant, which is already full size. Getting this wrong is
// invisible in the API response - you just quietly serve a 400x400 image into
// a full-screen lightbox and it looks blurry.
function displayUri(uris) {
  var pick = function (type) { return (uris.find(function (u) { return u.type === type; }) || {}).uri || ""; };
  var web = pick("web");
  if (/[?&]d=\d+x\d+/.test(web)) return web.replace(/([?&]d=)\d+x\d+/, "$11600x1600");
  return pick("original") || web;
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
    const display = displayUri(uris);
    if (!display) {
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
          displayUrl: display,
          thumbUrl: pick("thumbnail") || display,
          description: desc || "",
          photoUrl: p.photo_url || ""
        }
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
