// Builds the full multi-section Pre-Purchase Underwriting Report PDF and
// attaches it to the CompanyCam project it came from. Mirror of
// send-to-companycam.js (the SOW builder's version) - same headless-Chrome
// pipeline, same @sparticuz/chromium-min notes apply. The only differences
// are the report builder it calls (pprBuildStandaloneReportPage) and the
// filename.
const chromium = require("@sparticuz/chromium-min").default;
const puppeteer = require("puppeteer-core");
const { pprBuildStandaloneReportPage } = require("../../ppr-shared.js");

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

  const { projectId, report } = payload;
  if (!projectId || !report) {
    return { statusCode: 400, body: JSON.stringify({ error: "projectId and report are required" }) };
  }

  const apiKey = process.env.COMPANYCAM_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server is missing COMPANYCAM_API_KEY" }) };
  }

  try {
    const pdfBytes = await buildReportPdf(report);
    const base64 = Buffer.from(pdfBytes).toString("base64");
    const safeAddress = (report.address || "report").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    const filename = `Pre-Purchase-Report-${safeAddress}.pdf`;

    const ccResp = await fetch(`https://api.companycam.com/v2/projects/${projectId}/documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ document: { name: filename, attachment: base64 } })
    });

    const text = await ccResp.text();
    if (!ccResp.ok) {
      return { statusCode: ccResp.status, body: JSON.stringify({ error: `CompanyCam responded ${ccResp.status}: ${text}` }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

async function buildReportPdf(report) {
  const html = pprBuildStandaloneReportPage(report);
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
