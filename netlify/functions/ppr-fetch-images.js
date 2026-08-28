// Fetches a batch of image URLs server-side and returns them as base64
// data URIs, so the report builder can inline every context photo (and the
// cover's front-exterior shot) into the report itself. That makes the saved
// report and its PDF fully self-contained - they keep rendering even if a
// CompanyCam URL later changes or the viewer is offline.
//
// POST { urls: ["https://...", ...] } -> { images: [{ url, dataUri }] }
// A URL that can't be fetched comes back with dataUri:null (caller keeps
// the original URL as a fallback) rather than failing the whole batch.

const MAX_URLS = 60;
const MAX_BYTES = 6 * 1024 * 1024; // 6MB per image - generous for a JPEG

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let urls;
  try {
    urls = JSON.parse(event.body).urls;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }
  if (!Array.isArray(urls)) {
    return { statusCode: 400, body: JSON.stringify({ error: "urls must be an array" }) };
  }

  const list = urls.slice(0, MAX_URLS);
  const images = await Promise.all(list.map(async function (url) {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return { url: url, dataUri: null };
    }
    // Already a data URI - nothing to do.
    if (/^data:/i.test(url)) return { url: url, dataUri: url };
    try {
      const resp = await fetch(url);
      if (!resp.ok) return { url: url, dataUri: null };
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > MAX_BYTES) return { url: url, dataUri: null };
      let type = (resp.headers.get("content-type") || "").split(";")[0].trim();
      if (!/^image\//.test(type)) type = "image/jpeg";
      return { url: url, dataUri: "data:" + type + ";base64," + buf.toString("base64") };
    } catch (e) {
      return { url: url, dataUri: null };
    }
  }));

  return { statusCode: 200, body: JSON.stringify({ images: images }) };
};
