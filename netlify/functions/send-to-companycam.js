// Builds the Contractor Copy PDF and attaches it to the CompanyCam project
// it came from. The CompanyCam API key lives only in this server-side
// function (COMPANYCAM_API_KEY env var) - it is never sent to the browser.
//
// The PDF is rendered with real headless Chrome (via puppeteer-core +
// @sparticuz/chromium), reusing the exact same buildPrintHtml()/PRINT_CSS
// from sow-shared.js that the "Download Contractor/Owner Copy" buttons use
// in the browser. This matters: CompanyCam's PDF-to-checklist importer reads
// the PDF's tagged table structure to find rows to convert. A hand-drawn PDF
// (this function used to build one line-by-line with pdf-lib) has no table
// tags at all, so CompanyCam only saw one untagged block of bullet text per
// room. Real <table> markup, printed through Chrome's own print pipeline,
// comes out with actual /Table /TR /TD structure tags - verified by
// inspecting the PDF's object structure after a manual test print.
//
// NOTE: CompanyCam's public docs don't show the exact request-body schema
// for POST /v2/projects/{id}/documents (it's rendered client-side on their
// docs site). This implementation is a best-effort based on their other
// endpoints' conventions. If CompanyCam rejects the shape, the error
// message it returns will say which field it expected - adjust from there.

// @sparticuz/chromium-min (not the full @sparticuz/chromium) - the full
// package bundles a ~60MB Chromium binary directly into the function, which
// risks exceeding Netlify/Lambda's ~50MB compressed function size limit. The
// -min variant downloads the browser from Sparticuz's GitHub release at
// cold start instead, keeping the deployed function small at the cost of a
// few extra seconds on a cold start. Keep CHROMIUM_PACK_URL's version number
// in sync with the @sparticuz/chromium-min version in package.json.
// @sparticuz/chromium-min ships as a pure ESM package ("type": "module",
// `export default Chromium`). require()-ing an ESM module gets you the
// module namespace object ({ default: Chromium, ... }), not Chromium
// itself - hence the `.default`. Omitting it is what caused the deployed
// "chromium.executablePath is not a function" error.
const chromium = require("@sparticuz/chromium-min").default;
const puppeteer = require("puppeteer-core");
const { buildStandalonePrintPage } = require("../../sow-shared.js");

const CHROMIUM_PACK_URL = "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { projectId, sow } = payload;
  if (!projectId || !sow) {
    return { statusCode: 400, body: JSON.stringify({ error: "projectId and sow are required" }) };
  }

  const apiKey = process.env.COMPANYCAM_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server is missing COMPANYCAM_API_KEY" }) };
  }

  try {
    const pdfBytes = await buildContractorPdf(sow);
    const base64 = Buffer.from(pdfBytes).toString("base64");
    const safeAddress = (sow.address || "SOW").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    const filename = `Scope-of-Work-${safeAddress}.pdf`;

    const ccResp = await fetch(`https://api.companycam.com/v2/projects/${projectId}/documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        document: {
          name: filename,
          attachment: base64
        }
      })
    });

    const text = await ccResp.text();
    if (!ccResp.ok) {
      return {
        statusCode: ccResp.status,
        body: JSON.stringify({ error: `CompanyCam responded ${ccResp.status}: ${text}` })
      };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

async function buildContractorPdf(sow) {
  const html = buildStandalonePrintPage(sow, "contractor");
  // v149 of @sparticuz/chromium-min has no defaultViewport/headless
  // properties (older versions did) - set headless explicitly rather than
  // pass through a property that no longer exists on this package.
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    headless: true
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({ format: "Letter", printBackground: true });
  } finally {
    await browser.close();
  }
}
