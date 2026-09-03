// Read-only hosted view of one SOW - what the "Copy owner link" button in the
// builder hands to a property owner.
//
// It renders through buildPrintHtml(sow, "owner") from sow-shared.js, the
// same function behind the Owner Copy PDF, so the page an owner opens and the
// PDF they'd be emailed are the same document. Nothing here writes: no
// pricing inputs, no save, no builder chrome.
(function () {
  "use strict";

  var stateEl = document.getElementById("state");
  var docEl = document.getElementById("doc");
  var hintEl = document.getElementById("hint");
  var printBtn = document.getElementById("printBtn");

  function fail(message) {
    stateEl.hidden = false;
    stateEl.className = "state err";
    stateEl.textContent = message;
  }

  function render(sow) {
    stateEl.hidden = true;
    docEl.innerHTML = buildPrintHtml(sow, "owner");
    if ((sow.address || "").trim()) document.title = "Scope of Work - " + sow.address;
    printBtn.hidden = false;
    // Only offer the hint if at least one line actually has a photo.
    hintEl.hidden = !docEl.querySelector(".pv-c-desc a");
    SowLightbox.bind(docEl, ".pv-c-desc a");
  }

  // Legacy links: the builder used to encode the whole SOW into the URL as
  // ?d=<base64>. Those still open, so links already sent out keep working -
  // but it's no longer what "Copy owner link" produces, because a real SOW
  // blows past what a URL can carry (see the note on that button in sow.js).
  function decodeState(str) {
    try {
      var b64 = str.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) {
      return null;
    }
  }

  // PRINT_CSS is a plain string in sow-shared.js; dropping it into the
  // placeholder <style> keeps it above the page chrome in source order.
  document.getElementById("printCss").textContent = PRINT_CSS;
  printBtn.onclick = function () { window.print(); };

  var params = new URLSearchParams(location.search);
  var id = params.get("id");

  if (id) {
    fetch("/.netlify/functions/sow-load?id=" + encodeURIComponent(id))
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.data.sow) throw new Error((res.data && res.data.error) || "Not found");
        render(res.data.sow);
      })
      .catch(function (err) {
        fail("Couldn't open this scope of work: " + err.message + ". Ask whoever sent the link for a fresh one.");
      });
  } else if (params.has("d")) {
    var decoded = decodeState(params.get("d"));
    if (decoded) render(decoded);
    else fail("This link is damaged - the scope of work couldn't be read from it. Ask whoever sent it for a fresh link.");
  } else {
    fail("This link is missing its scope of work. Ask whoever sent it for a fresh link.");
  }
})();
