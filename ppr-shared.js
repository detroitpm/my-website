// Shared, pure helpers for the Pre-Purchase Underwriting Report builder
// (pre-purchase-report.html / ppr.js) and its server-side "Send to
// CompanyCam Files" function (ppr-send-to-companycam.js).
//
// This is deliberately a SEPARATE file from sow-shared.js. The SOW builder
// and this report builder are different products with different rules -
// keeping their shared code apart means a change to one never silently
// moves the other. Small primitives (escapeHtml/currency/normalizeKey) are
// re-declared here on purpose rather than imported from sow-shared.js.
//
// Loads as a plain <script> in the browser AND as a CommonJS module in the
// Netlify function, same dual-use trick as sow-shared.js.

function pprEscapeHtml(s) {
  return (s == null ? "" : String(s))
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pprCurrency(n) {
  var num = Number(n);
  if (isNaN(num)) num = 0;
  var sign = num < 0 ? "-" : "";
  num = Math.abs(num);
  var s = num.toFixed(2);
  if (s.endsWith(".00")) s = s.slice(0, -3);
  return sign + "$" + s;
}

// Address key for the saved-report lookup - same normalization the SOW
// builder uses for its own address key, so "8210 Decatur St" maps to one
// row no matter the spacing/casing it was typed with.
function pprNormalizeKey(s) {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

// Every line item is exactly one of red / yellow / optional. Anything
// missing or unrecognized is treated as yellow (minor repair) - the safe
// default for a freshly-imported item the reviewer hasn't triaged yet.
function pprFlag(item) {
  var f = item && item.flag;
  return (f === "red" || f === "optional") ? f : "yellow";
}

var PPR_FLAG_LABELS = { red: "Red flag", yellow: "Yellow flag", optional: "Optional" };

// Owner-facing estimate, broken out by flag. Each group = sum of
// (labor + material) across its items, then the buffer % applied once.
// Grand total includes all three groups (red + yellow + optional).
function pprComputeTotals(report) {
  var buffer = 1 + (Number(report.bufferPct) || 0) / 100;
  var base = { red: 0, yellow: 0, optional: 0 };
  (report.sections || []).forEach(function (section) {
    (section.items || []).forEach(function (item) {
      if (!item || !(item.text || "").trim()) return;
      var amt = (Number(item.labor) || 0) + (Number(item.material) || 0);
      base[pprFlag(item)] += amt;
    });
  });
  return {
    red: base.red * buffer,
    yellow: base.yellow * buffer,
    optional: base.optional * buffer,
    grand: (base.red + base.yellow + base.optional) * buffer
  };
}

// Splits a free-text block into paragraphs on blank lines. Used for the
// disclosures and the PM notes, both stored as one string.
function pprParagraphs(text) {
  return (text || "").split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
}

// ---- Printed report (static HTML string) ----
// Six sections, each starting on its own page (page-break-before). The
// Scope of Work grid in section 4 is a real <table> (thead/tbody/tr/td),
// not styled divs, for the same reason the SOW builder keeps it that way:
// CompanyCam's PDF-to-checklist importer reads tagged table structure to
// find rows. See the note in sow-shared.js.
function pprBuildReportHtml(report) {
  var totals = pprComputeTotals(report);
  var company = report.companyName || "Detroit Section 8 Property Management";
  var html = "";

  // -- Section 1: Cover --
  html += '<section class="ppr-page ppr-cover">';
  html += '<div class="ppr-cover-inner">';
  html += '<p class="ppr-cover-kicker">' + pprEscapeHtml(company) + "</p>";
  html += '<h1 class="ppr-cover-title">Pre-Purchase Underwriting Report</h1>';
  html += '<div class="ppr-goldbar"></div>';
  if (report.frontExteriorPhoto) {
    html += '<div class="ppr-cover-photo"><img src="' + pprEscapeHtml(report.frontExteriorPhoto) + '" alt="Front exterior"></div>';
  }
  html += '<p class="ppr-cover-address">' + pprEscapeHtml(report.address || "(address not set)") + "</p>";
  html += '<dl class="ppr-cover-meta">';
  html += "<dt>Date of inspection</dt><dd>" + pprEscapeHtml(report.inspectionDate || "—") + "</dd>";
  html += "<dt>Prepared for</dt><dd>" + pprEscapeHtml(report.preparedFor || "—") + "</dd>";
  html += "<dt>Prepared by</dt><dd>" + pprEscapeHtml(company) + "</dd>";
  html += "</dl>";
  html += "</div></section>";

  // -- Section 2: Important Disclosures --
  html += '<section class="ppr-page">';
  html += '<h2 class="ppr-h2">Important Disclosures</h2>';
  var discParas = pprParagraphs(report.legalDisclosures);
  if (discParas.length) {
    discParas.forEach(function (p) { html += '<p class="ppr-disc">' + pprEscapeHtml(p) + "</p>"; });
  } else {
    html += '<p class="ppr-disc ppr-muted">(No disclosure text set.)</p>';
  }
  html += "</section>";

  // -- Section 3: Property photos (context, not deficiencies) --
  var photos = (report.contextPhotos || []).filter(function (p) { return p && p.url; });
  html += '<section class="ppr-page">';
  html += '<h2 class="ppr-h2">Property Photos</h2>';
  html += '<p class="ppr-sub">Room-by-room context photos. These are not repair callouts.</p>';
  if (photos.length) {
    html += '<div class="ppr-photo-grid">';
    photos.forEach(function (p) {
      var cap = p.room || "";
      if (p.unit) cap += (cap ? " — " : "") + p.unit;
      html += '<figure class="ppr-photo"><img src="' + pprEscapeHtml(p.url) + '" alt="' + pprEscapeHtml(cap) + '">' +
        '<figcaption>' + pprEscapeHtml(cap || "—") + "</figcaption></figure>";
    });
    html += "</div>";
  } else {
    html += '<p class="ppr-disc ppr-muted">(No context photos added.)</p>';
  }
  html += "</section>";

  // -- Section 4: Scope of Work & Estimate --
  html += '<section class="ppr-page">';
  html += '<h2 class="ppr-h2">Scope of Work &amp; Estimate</h2>';
  html += '<ul class="ppr-legend">' +
    '<li><span class="ppr-flag ppr-flag-red">&#9873;</span> <strong>Red flag</strong> &mdash; major deficiencies, which may be expensive</li>' +
    '<li><span class="ppr-flag ppr-flag-yellow">&#9873;</span> <strong>Yellow flag</strong> &mdash; minor deficiencies</li>' +
    '<li><span class="ppr-flag-opt-key">OPT</span> <strong>Optional</strong> &mdash; not deficient; preventative, aesthetic, or work for later once a tenant vacates</li>' +
    "</ul>";
  html += '<table class="ppr-table"><colgroup><col class="ppr-col-room"><col></colgroup>';
  html += '<thead><tr><th>Room</th><th>Item</th></tr></thead><tbody>';
  (report.sections || []).forEach(function (section) {
    var items = (section.items || []).filter(function (it) { return (it.text || "").trim() !== ""; });
    if (!items.length) return;
    html += '<tr class="ppr-room-row"><td class="ppr-c-room">' + pprEscapeHtml(section.room || "") + '</td><td></td></tr>';
    items.forEach(function (item) {
      var flag = pprFlag(item);
      var descText = pprEscapeHtml(item.text);
      var desc = item.photoUrl ? '<a href="' + pprEscapeHtml(item.photoUrl) + '">' + descText + "</a>" : descText;
      var mark = flag === "red" ? '<span class="ppr-flag ppr-flag-red">&#9873;</span>'
        : flag === "yellow" ? '<span class="ppr-flag ppr-flag-yellow">&#9873;</span>'
        : '<span class="ppr-flag-opt">Optional</span>';
      // Only when the builder's line-by-line toggle is on. Labor and Material
      // print as two figures, the way they're entered (and the way the SOW
      // Owner Copy does it), before the buffer the totals below add.
      var price = report.showItemizedPricing
        ? '<span class="ppr-price">Labor ' + pprCurrency(Number(item.labor) || 0) + ' &middot; Material ' + pprCurrency(Number(item.material) || 0) + '</span>'
        : "";
      html += '<tr class="ppr-item-row ppr-row-' + flag + '">' +
        '<td class="ppr-c-room ppr-c-flagcell">' + mark + "</td>" +
        '<td class="ppr-c-item">&#9744; ' + desc + price + "</td></tr>";
    });
  });
  html += "</tbody></table>";

  html += '<table class="ppr-estimate"><tbody>';
  html += pprEstimateRow("Red flag items", totals.red);
  html += pprEstimateRow("Yellow flag items", totals.yellow);
  html += pprEstimateRow("Optional items", totals.optional);
  html += '<tr class="ppr-estimate-grand"><th>Grand total</th><td>' + pprCurrency(totals.grand) + "</td></tr>";
  html += "</tbody></table>";
  html += '<p class="ppr-sub">These are rough planning estimates &mdash; actual costs may be higher or lower. See the disclosures regarding accuracy.</p>';
  html += "</section>";

  // -- Section 5: Media links --
  var links = (report.mediaListLinks || []).filter(function (l) { return l && (l.url || "").trim(); });
  html += '<section class="ppr-page">';
  html += '<h2 class="ppr-h2">Photo &amp; Video Links</h2>';
  if (links.length) {
    html += '<ul class="ppr-links">';
    links.forEach(function (l) {
      html += '<li><span class="ppr-link-label">' + pprEscapeHtml(l.label || "Link") + "</span>" +
        '<a class="ppr-link-url" href="' + pprEscapeHtml(l.url) + '">' + pprEscapeHtml(l.url) + "</a></li>";
    });
    html += "</ul>";
  } else {
    html += '<p class="ppr-disc ppr-muted">(No links added.)</p>';
  }
  html += "</section>";

  // -- Section 6: Property Management notes --
  html += '<section class="ppr-page">';
  html += '<h2 class="ppr-h2">Property Management Notes</h2>';
  var noteParas = pprParagraphs(report.pmNotes);
  if (noteParas.length) {
    noteParas.forEach(function (p) { html += '<p class="ppr-disc">' + pprEscapeHtml(p) + "</p>"; });
  } else {
    html += '<p class="ppr-disc ppr-muted">(No notes.)</p>';
  }
  html += "</section>";

  return html;
}

function pprEstimateRow(label, amount) {
  return '<tr><th>' + pprEscapeHtml(label) + "</th><td>" + pprCurrency(amount) + "</td></tr>";
}

// CSS for the printed report. Mirrored into the browser page's <style>
// block (pre-purchase-report.html) - if you change one, change the other.
// Structure/accent color is gold-on-ink (matches the rest of section8pm.com
// and the SOW builder). Red / amber / grey are used ONLY as flag semantics,
// never as decoration.
var PPR_REPORT_CSS = [
  ':root{ --ink:#1a1a1a; --gold:#d4af37; --gold-ink:#8a6d16; --muted:#6b6b6b; --line:#d3d3d3;',
  '  --paper:#ffffff; --panel:#f5f4f1; --red:#b3261e; --red-bg:#fbeae8; --yellow:#9a7400; --yellow-bg:#fbf3dd;',
  '  --opt:#5f5f5f; --opt-bg:#ececec; --sans:Arial,Helvetica,sans-serif; --display:"Arial Black","Arial Bold",Arial,sans-serif; }',
  '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
  'body{margin:0;background:#fff;color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.55;}',
  '.ppr-page{padding:40px 44px;max-width:820px;margin:0 auto;}',
  '.ppr-page + .ppr-page{border-top:1px solid var(--line);}',
  '.ppr-h2{font-family:var(--display);font-size:20px;text-transform:uppercase;letter-spacing:.05em;',
  '  margin:0 0 6px;padding-bottom:8px;border-bottom:3px solid var(--gold);}',
  '.ppr-sub{font-size:12.5px;color:var(--muted);margin:6px 0 18px;}',
  '.ppr-disc{margin:0 0 12px;}',
  '.ppr-muted{color:var(--muted);}',
  /* Cover */
  '.ppr-cover{min-height:60vh;display:flex;align-items:center;justify-content:center;text-align:center;}',
  '.ppr-cover-inner{width:100%;}',
  '.ppr-cover-kicker{font-size:12.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-ink);font-weight:700;margin:0 0 16px;}',
  '.ppr-cover-title{font-family:var(--display);font-size:34px;line-height:1.12;text-transform:uppercase;margin:0;letter-spacing:-.01em;}',
  '.ppr-goldbar{width:64px;height:4px;background:var(--gold);margin:20px auto 24px;}',
  '.ppr-cover-photo{margin:0 auto 22px;max-width:520px;}',
  '.ppr-cover-photo img{width:100%;height:auto;border:2px solid var(--ink);display:block;}',
  '.ppr-cover-address{font-size:18px;font-weight:700;margin:0 0 22px;}',
  '.ppr-cover-meta{display:inline-grid;grid-template-columns:auto auto;gap:6px 18px;text-align:left;font-size:14px;}',
  '.ppr-cover-meta dt{font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.04em;color:var(--muted);align-self:center;}',
  '.ppr-cover-meta dd{margin:0;}',
  /* Photo grid */
  '.ppr-photo-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;}',
  '.ppr-photo{margin:0;}',
  '.ppr-photo img{width:100%;height:210px;object-fit:cover;border:1px solid var(--ink);display:block;}',
  '.ppr-photo figcaption{font-size:12px;font-weight:700;margin-top:5px;text-transform:uppercase;letter-spacing:.03em;}',
  /* Flag legend */
  '.ppr-legend{list-style:none;padding:12px 14px;margin:0 0 18px;border:1px solid var(--line);background:var(--panel);font-size:12.5px;line-height:1.5;}',
  '.ppr-legend li{margin:3px 0;}',
  '.ppr-legend .ppr-flag{margin-right:5px;}',
  '.ppr-flag{font-size:16px;line-height:1;font-weight:700;}',
  '.ppr-flag.ppr-flag-red{color:#e11900;}',
  '.ppr-flag.ppr-flag-yellow{color:#f5b301;}',
  '.ppr-flag-opt{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--opt);border:1px solid var(--opt);padding:1px 4px;}',
  '.ppr-flag-opt-key{display:inline-block;font-size:9px;font-weight:800;color:var(--opt);border:1px solid var(--opt);padding:1px 4px;margin-right:5px;letter-spacing:.04em;}',
  /* SOW table - bold outer border, thin grey inner gridlines. Item text is
     always default ink; only the flag glyph carries colour. */
  '.ppr-table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:26px;border:2.5px solid #000;color:var(--ink);}',
  '.ppr-table th,.ppr-table td{text-align:left;vertical-align:top;padding:7px 10px;border:1px solid #9a9a9a;}',
  '.ppr-table col.ppr-col-room{width:26%;}',
  '.ppr-table thead th{background:var(--ink);color:#fff;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.03em;padding:8px 10px;border-color:#000;}',
  '.ppr-table tr.ppr-room-row td{background:var(--panel);color:var(--ink);font-weight:800;border-top:2px solid #000;border-bottom:2px solid #000;}',
  '.ppr-table tr.ppr-room-row td.ppr-c-room{padding-left:12px;border-left:5px solid var(--gold);}',
  '.ppr-table tr.ppr-item-row td{color:var(--ink);}',
  '.ppr-table td.ppr-c-flagcell{text-align:center;}',
  '.ppr-table tr.ppr-row-optional td{background:var(--opt-bg);}',
  '.ppr-table td.ppr-c-item a{color:inherit;text-decoration:underline dotted;text-decoration-color:#9a9a9a;}',
  '.ppr-price{display:block;margin-top:3px;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;}',
  /* Estimate summary */
  '.ppr-estimate{border-collapse:collapse;width:100%;max-width:420px;border:2.5px solid #000;color:var(--ink);}',
  '.ppr-estimate th,.ppr-estimate td{padding:8px 12px;font-size:14px;border:1px solid #9a9a9a;}',
  '.ppr-estimate th{text-align:left;font-weight:700;}',
  '.ppr-estimate td{text-align:right;font-variant-numeric:tabular-nums;}',
  '.ppr-estimate tr.ppr-estimate-grand th,.ppr-estimate tr.ppr-estimate-grand td{background:var(--ink);color:#fff;border-color:#000;}',
  '.ppr-estimate tr.ppr-estimate-grand td{color:var(--gold);font-weight:800;border-left-color:#444;}',
  '.ppr-estimate tr.ppr-estimate-grand th{font-weight:800;text-transform:uppercase;letter-spacing:.03em;}',
  /* Links */
  '.ppr-links{list-style:none;padding:0;margin:0;}',
  '.ppr-links li{padding:16px 0;border-bottom:1px solid var(--line);}',
  '.ppr-link-label{display:block;font-weight:700;font-size:15px;margin-bottom:3px;}',
  '.ppr-link-url{font-size:12.5px;color:var(--gold-ink);word-break:break-all;}',
  '@media print{ .ppr-page{page-break-before:always;padding:0.5in 0.6in;max-width:none;} .ppr-page:first-child{page-break-before:auto;} .ppr-page + .ppr-page{border-top:none;} .ppr-cover{min-height:8in;} }'
].join("\n");

function pprBuildStandaloneReportPage(report) {
  return "<!doctype html><html><head><meta charset=\"utf-8\"><style>" + PPR_REPORT_CSS +
    "</style></head><body>" + pprBuildReportHtml(report) + "</body></html>";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    pprEscapeHtml: pprEscapeHtml,
    pprCurrency: pprCurrency,
    pprNormalizeKey: pprNormalizeKey,
    pprFlag: pprFlag,
    pprComputeTotals: pprComputeTotals,
    pprParagraphs: pprParagraphs,
    pprBuildReportHtml: pprBuildReportHtml,
    pprBuildStandaloneReportPage: pprBuildStandaloneReportPage,
    PPR_REPORT_CSS: PPR_REPORT_CSS,
    PPR_FLAG_LABELS: PPR_FLAG_LABELS
  };
}
