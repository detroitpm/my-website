// Read-only hosted view of one saved pre-purchase report - what the "Copy
// link" button in the builder hands to a buyer.
//
// It renders through pprBuildReportHtml(report) from ppr-shared.js, the same
// function behind the report PDF, so the page a buyer opens and the PDF
// they'd be emailed are the same document. Nothing here writes: no pricing
// inputs, no save, no builder chrome.
(function () {
  "use strict";

  var stateEl = document.getElementById("state");
  var docEl = document.getElementById("doc");
  var printBtn = document.getElementById("printBtn");

  function fail(message) {
    stateEl.hidden = false;
    stateEl.className = "state err";
    stateEl.textContent = message;
  }

  function render(report) {
    stateEl.hidden = true;
    docEl.innerHTML = pprBuildReportHtml(report);
    if ((report.address || "").trim()) document.title = "Pre-Purchase Report - " + report.address;
    printBtn.hidden = false;
  }

  // Legacy links: the builder used to encode the whole report into the URL
  // as ?d=<base64> and point it at the builder itself. Short reports still
  // decode here, but it's no longer what "Copy link" produces, because a real
  // report blows past what a URL can carry (see the note on that button in
  // ppr.js).
  function decodeState(str) {
    try {
      var b64 = str.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) {
      return null;
    }
  }

  // PPR_REPORT_CSS is a plain string in ppr-shared.js; dropping it into the
  // placeholder <style> keeps it above the page chrome in source order.
  document.getElementById("printCss").textContent = PPR_REPORT_CSS;
  printBtn.onclick = function () { window.print(); };

  var params = new URLSearchParams(location.search);
  var id = params.get("id");

  if (id) {
    fetch("/.netlify/functions/ppr-load?id=" + encodeURIComponent(id))
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.data.report) throw new Error((res.data && res.data.error) || "Not found");
        render(res.data.report);
      })
      .catch(function (err) {
        fail("Couldn't open this report: " + err.message + ". Ask whoever sent the link for a fresh one.");
      });
  } else if (params.has("d")) {
    var decoded = decodeState(params.get("d"));
    if (decoded) render(decoded);
    else fail("This link is damaged - the report couldn't be read from it. Ask whoever sent it for a fresh link.");
  } else {
    fail("This link is missing its report. Ask whoever sent it for a fresh link.");
  }
})();
