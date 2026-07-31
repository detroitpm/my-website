// Shared, pure SOW helpers - no DOM/window access, so this file loads as a
// plain <script> in the browser (sow.html) AND as a CommonJS module in the
// "Send to CompanyCam Files" Netlify function (send-to-companycam.js).
// Keeping one copy of buildPrintHtml/PRINT_CSS is what guarantees the
// "Download Copy" PDF and the auto-uploaded-to-CompanyCam PDF are always the
// same real <table> markup - see the note above buildPrintHtml below for why
// that matters for CompanyCam's checklist import.

function escapeHtml(s) {
  return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function currency(n) {
  var num = Number(n);
  if (isNaN(num)) num = 0;
  var sign = num < 0 ? "-" : "";
  num = Math.abs(num);
  var s = num.toFixed(2);
  if (s.endsWith(".00")) s = s.slice(0, -3);
  return sign + "$" + s;
}

// Exact-match key for both the saved-SOW lookup (by address) and the rate
// lookup (by line-item task text). Used identically client-side (building
// the in-memory rate cache) and server-side (the DB's unique key column),
// so a given string always maps to the same row on both ends.
function normalizeKey(s) {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function computeRoomSubtotal(section) {
  var subtotal = 0;
  section.items.forEach(function (item) {
    if (item.optional) return;
    subtotal += (Number(item.labor) || 0) + (Number(item.material) || 0);
  });
  return subtotal;
}

function computeTotals(sow) {
  var labor = 0, materialPlusLabor = 0;
  sow.sections.forEach(function (section) {
    section.items.forEach(function (item) {
      if (item.optional) return;
      var l = Number(item.labor) || 0;
      var m = Number(item.material) || 0;
      labor += l;
      materialPlusLabor += l + m;
    });
  });
  var bufferPct = Number(sow.bufferPct) || 0;
  var ownerTotal = materialPlusLabor * (1 + bufferPct / 100);
  return { contractorTotal: labor, ownerTotal: ownerTotal };
}

// ---- Print view (static HTML string) ----
// NOTE: the room/item grid below is a real <table> (thead/tbody/tr/td), not
// styled divs. Third-party tools that turn an uploaded PDF into a checklist
// (e.g. CompanyCam) read the PDF's tagged table structure to find rows to
// convert - a div-based "fake table" prints visually the same but carries no
// real table tags, so it comes through as one untagged block of text instead
// of individual checkable lines. Keep this a genuine <table> for that reason.
// Everything renders inside a single .pv-doc frame (one outer border) rather
// than several separately-bordered bands, and the only accent color is gold,
// used consistently in exactly two places (the room-label stripe and the
// total figure) - not a one-off band that shows up nowhere else.
function buildPrintHtml(sow, mode) {
  var total = computeTotals(sow);
  var html = "";
  html += '<div class="pv-doc">';
  html += '<div class="pv-header">';
  html += '<div class="pv-addr">Scope of Work' + (mode === "contractor" ? " &mdash; Contractor Copy" : " &mdash; Owner Copy") + ": " + escapeHtml(sow.address || "(address not set)") + "</div>";
  html += '<div class="pv-type">' + escapeHtml(sow.typeOfWork || "") + "</div>";
  html += "</div>";
  html += '<table class="pv-table"><colgroup><col class="pv-col-room"><col></colgroup><thead><tr><th class="pv-th-room">Room</th><th class="pv-th-desc">Description</th></tr></thead><tbody>';

  sow.sections.forEach(function (section) {
    var visibleItems = section.items.filter(function (it) { return (it.text || "").trim() !== ""; });
    if (!visibleItems.length) return;
    html += '<tr class="pv-room-row"><td class="pv-c-room">' + escapeHtml(section.room) + '</td><td class="pv-c-desc"></td></tr>';
    visibleItems.forEach(function (item) {
      html += '<tr class="pv-item-row' + (item.optional ? " optional" : "") + '">' +
        '<td class="pv-c-room"></td>' +
        '<td class="pv-c-desc">&#9744; ' + (item.optional ? '<span class="tag">OPTIONAL</span>' : "") + escapeHtml(item.text) + "</td></tr>";
    });
  });

  // Questions are internal/contractor-facing (e.g. "did you put the keys
  // back") - not relevant to an owner reviewing the scope, so they're
  // dropped from the Owner copy entirely.
  var qItems = mode === "owner" ? [] : sow.questions.filter(function (q) { return (q.text || "").trim() !== ""; });
  if (qItems.length) {
    html += '<tr class="pv-room-row"><td class="pv-c-room">Questions</td><td class="pv-c-desc"></td></tr>';
    qItems.forEach(function (q) {
      html += '<tr class="pv-item-row"><td class="pv-c-room"></td><td class="pv-c-desc"><b>' + escapeHtml(q.text) + "</b> &mdash; " + escapeHtml(q.answer || "(unanswered)") + "</td></tr>";
    });
  }

  html += '<tr class="pv-footer-row"><td class="pv-c-room">Pictures / Videos</td><td class="pv-c-desc">' + escapeHtml(sow.mediaLink || "none") + "</td></tr>";
  html += "</tbody></table>";

  if (mode === "contractor") {
    html += '<div class="pv-total"><span>Total (Labor)</span><span class="n">' + currency(total.contractorTotal) + "</span></div>";
  } else {
    html += '<div class="pv-total"><span>Total (Estimate)</span><span class="n">' + currency(total.ownerTotal) + "</span></div>";
  }
  html += "</div>";
  return html;
}

// Exact copy of the #printView-related CSS from sow.html's <style> block.
// Used to build a standalone HTML page for the server-side (headless Chrome)
// PDF render in send-to-companycam.js. If you change the print styling in
// sow.html, mirror the change here too - see PRINT_CSS's callers.
// One outer frame (.pv-doc), one structural line color (#000, for section
// boundaries) and one soft line color (--line-soft, for item rows) - not a
// mix of #999/#bbb/#ccc. Gold shows up in exactly two places: the room-label
// stripe and the total figure. Nowhere else picks up a stray accent color.
var PRINT_CSS = [
  ':root{ --ink:#1a1a1a; --gold:#d4af37; --gold-ink:#8a6d16; --muted:#6b6b6b; --line:#e5e4e1; --line-soft:#d3d3d3; --panel:#f5f4f1; --paper:#ffffff; --grey-opt:#e9e7e1; --sans:Arial,Helvetica,sans-serif; }',
  '*{box-sizing:border-box;} body{margin:0;background:#fff;color:var(--ink);font-family:var(--sans);font-size:16px;}',
  '.pv-doc{border:4px solid #000;}',
  '.pv-header{background:var(--ink);color:#fff;padding:16px 18px 14px;}',
  '.pv-header .pv-addr{font-weight:800;font-size:19px;letter-spacing:.01em;}',
  '.pv-header .pv-type{margin-top:5px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.6);}',
  '.pv-table{width:100%;border-collapse:collapse;table-layout:fixed;}',
  '.pv-table th, .pv-table td{text-align:left;vertical-align:top;}',
  '.pv-table col.pv-col-room{width:26%;}',
  '.pv-table thead th{background:var(--ink);color:#fff;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.03em;padding:9px 10px;border-top:2px solid #000;}',
  '.pv-table thead th.pv-th-desc{border-left:1.5px solid rgba(255,255,255,.3);}',
  '.pv-table tr.pv-room-row{background:#fff;font-weight:800;border-top:2px solid #000;}',
  '.pv-table tr.pv-room-row td.pv-c-room{padding:8px 10px 8px 14px;border-left:5px solid var(--gold);}',
  '.pv-table tr.pv-room-row td.pv-c-desc{border-left:1.5px solid #000;}',
  '.pv-table tr.pv-item-row{border-top:1px solid var(--line-soft);}',
  '.pv-table tr.pv-item-row.optional{background:var(--grey-opt);}',
  '.pv-table tr.pv-item-row td.pv-c-desc{border-left:1.5px solid var(--line-soft);padding:6px 10px;}',
  '.pv-table tr.pv-item-row td.pv-c-desc .tag{font-size:10px;font-weight:800;background:var(--gold);color:var(--ink);padding:1px 6px;margin:0 6px;}',
  '.pv-table tr.pv-footer-row{border-top:2px solid #000;}',
  '.pv-table tr.pv-footer-row td.pv-c-room{padding:9px 10px;font-weight:800;background:var(--ink);color:#fff;}',
  '.pv-table tr.pv-footer-row td.pv-c-desc{border-left:1.5px solid #000;padding:9px 10px;word-break:break-all;}',
  '.pv-total{border-top:4px solid #000;background:var(--ink);color:#fff;padding:14px 18px;display:flex;justify-content:space-between;font-weight:800;font-size:17px;}',
  '.pv-total .n{color:var(--gold);font-size:19px;}'
].join("\n");

// Wraps buildPrintHtml()'s output in a standalone page for headless-Chrome
// rendering server-side (no builder UI, no #printView wrapper needed).
function buildStandalonePrintPage(sow, mode) {
  return "<!doctype html><html><head><meta charset=\"utf-8\"><style>" + PRINT_CSS +
    "</style></head><body>" + buildPrintHtml(sow, mode) + "</body></html>";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    escapeHtml: escapeHtml,
    currency: currency,
    computeRoomSubtotal: computeRoomSubtotal,
    computeTotals: computeTotals,
    normalizeKey: normalizeKey,
    buildPrintHtml: buildPrintHtml,
    buildStandalonePrintPage: buildStandalonePrintPage,
    PRINT_CSS: PRINT_CSS
  };
}
