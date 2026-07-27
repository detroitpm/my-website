// Builds a simple PDF of the Contractor Copy and attaches it to the
// CompanyCam project it came from. The CompanyCam API key lives only in
// this server-side function (COMPANYCAM_API_KEY env var) — it is never
// sent to the browser.
//
// NOTE: CompanyCam's public docs don't show the exact request-body schema
// for POST /v2/projects/{id}/documents (it's rendered client-side on their
// docs site). This implementation is a best-effort based on their other
// endpoints' conventions. If CompanyCam rejects the shape, the error
// message it returns will say which field it expected — adjust from there.

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

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
          file_name: filename,
          content: base64
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
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 612, pageH = 792;
  const margin = 48;
  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;

  function ensureRoom(lines) {
    if (y - lines * 14 < margin) {
      page = doc.addPage([pageW, pageH]);
      y = pageH - margin;
    }
  }

  function drawText(text, opts) {
    opts = opts || {};
    const size = opts.size || 11;
    const f = opts.bold ? bold : font;
    const maxWidth = pageW - margin * 2 - (opts.indent || 0);
    const words = String(text).split(" ");
    let line = "";
    const lines = [];
    words.forEach(function (w) {
      const test = line ? line + " " + w : w;
      if (f.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    ensureRoom(lines.length);
    lines.forEach(function (l) {
      page.drawText(l, { x: margin + (opts.indent || 0), y: y, size: size, font: f, color: opts.color || rgb(0, 0, 0) });
      y -= size + 4;
    });
  }

  drawText("Scope of Work — Contractor Copy", { size: 16, bold: true });
  drawText(sow.address || "(address not set)", { size: 13, bold: true });
  drawText(sow.typeOfWork || "", { size: 11, color: rgb(0.35, 0.35, 0.35) });
  y -= 8;

  let laborTotal = 0;
  (sow.sections || []).forEach(function (section) {
    const items = (section.items || []).filter(function (it) { return (it.text || "").trim() !== ""; });
    if (!items.length) return;
    y -= 4;
    drawText(section.room, { size: 12.5, bold: true });
    items.forEach(function (item) {
      const prefix = item.optional ? "(optional) " : "• ";
      drawText(prefix + item.text, { size: 11, indent: 14, color: item.optional ? rgb(0.45, 0.45, 0.45) : rgb(0, 0, 0) });
      if (!item.optional) laborTotal += Number(item.labor) || 0;
    });
  });

  const qItems = (sow.questions || []).filter(function (q) { return (q.text || "").trim() !== ""; });
  if (qItems.length) {
    y -= 4;
    drawText("Questions", { size: 12.5, bold: true });
    qItems.forEach(function (q) {
      drawText(q.text + " — " + (q.answer || "(unanswered)"), { size: 11, indent: 14 });
    });
  }

  y -= 4;
  drawText("Pictures / Videos: " + (sow.mediaLink || "none"), { size: 10.5, color: rgb(0.35, 0.35, 0.35) });
  y -= 10;
  drawText("Total (Labor): $" + laborTotal.toFixed(2), { size: 13, bold: true });

  return doc.save();
}
