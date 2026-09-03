// Shared photo lightbox for the SOW builder (sow.html) and the hosted owner
// view (sow-view.html). Loaded as a plain <script> by both, so it owns its
// own CSS and markup rather than making each page carry a copy.
//
// Why it exists: a line item's photoUrl is a CompanyCam app permalink
// (https://app.companycam.com/assets/Image/123), not an image file. Opening
// it sends the reader out of the SOW into CompanyCam, in a new tab, behind a
// login. So the camera icon resolves that permalink to a real image URI
// (sow-photo.js) and shows the picture in place instead.
(function (global) {
  "use strict";

  var CSS = [
    '.sow-lb{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:24px;}',
    '.sow-lb[hidden]{display:none;}',
    '.sow-lb-backdrop{position:absolute;inset:0;background:rgba(20,20,20,.82);}',
    '.sow-lb-box{position:relative;margin:0;max-width:min(1100px,100%);max-height:100%;display:flex;flex-direction:column;gap:10px;}',
    '.sow-lb-stage{background:#0e0e0e;border:3px solid #000;min-height:120px;display:flex;align-items:center;justify-content:center;overflow:hidden;}',
    '.sow-lb-stage img{display:block;max-width:100%;max-height:72vh;object-fit:contain;}',
    '.sow-lb-msg{color:#e9e7e1;font-size:14px;padding:32px 20px;text-align:center;line-height:1.5;}',
    '.sow-lb-bar{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:baseline;justify-content:space-between;color:#e9e7e1;font-size:13px;}',
    '.sow-lb-cap{flex:1 1 240px;min-width:0;}',
    '.sow-lb-src{color:#d4af37;text-decoration:underline;white-space:nowrap;}',
    '.sow-lb-close{position:absolute;top:-14px;right:-14px;width:36px;height:36px;border:3px solid #000;background:#fff;color:#1a1a1a;font-size:20px;line-height:1;cursor:pointer;padding:0;}',
    '.sow-lb-close:hover{background:#d4af37;}',
    '.sow-lb-close:focus-visible,.sow-lb-src:focus-visible{outline:3px solid #d4af37;outline-offset:2px;}',
    '@media (max-width:600px){.sow-lb{padding:16px;}.sow-lb-close{top:-10px;right:-6px;}}'
  ].join("\n");

  // photo id -> {displayUrl, description} once resolved, so reopening the
  // same line's photo doesn't hit the function again.
  var cache = {};
  var root = null, imgEl = null, msgEl = null, capEl = null, srcEl = null, closeEl = null;
  var lastFocus = null;
  var reqToken = 0;

  function photoIdFrom(url) {
    var m = /companycam\.com\/assets\/(?:Image|Video)\/(\d+)/i.exec(url || "");
    return m ? m[1] : null;
  }

  function build() {
    if (root) return;
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    root = document.createElement("div");
    root.className = "sow-lb no-print";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Photo");
    root.innerHTML =
      '<div class="sow-lb-backdrop"></div>' +
      '<figure class="sow-lb-box">' +
        '<button type="button" class="sow-lb-close" aria-label="Close photo">&#10005;</button>' +
        '<div class="sow-lb-stage"><img alt=""><div class="sow-lb-msg"></div></div>' +
        '<figcaption class="sow-lb-bar">' +
          '<span class="sow-lb-cap"></span>' +
          '<a class="sow-lb-src" target="_blank" rel="noopener">Open in CompanyCam</a>' +
        '</figcaption>' +
      '</figure>';
    document.body.appendChild(root);

    imgEl = root.querySelector("img");
    msgEl = root.querySelector(".sow-lb-msg");
    capEl = root.querySelector(".sow-lb-cap");
    srcEl = root.querySelector(".sow-lb-src");
    closeEl = root.querySelector(".sow-lb-close");

    closeEl.addEventListener("click", close);
    root.querySelector(".sow-lb-backdrop").addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !root.hidden) close();
    });
  }

  function showMessage(text) {
    imgEl.style.display = "none";
    imgEl.removeAttribute("src");
    msgEl.style.display = "block";
    msgEl.textContent = text;
  }

  function showImage(url) {
    msgEl.style.display = "none";
    imgEl.style.display = "block";
    imgEl.src = url;
  }

  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    reqToken++;                    // any in-flight lookup no longer applies
    imgEl.removeAttribute("src");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  // photoUrl: the line item's CompanyCam permalink. caption: the line text,
  // so whoever's looking knows which item the picture belongs to.
  function open(photoUrl, caption) {
    build();
    lastFocus = document.activeElement;
    root.hidden = false;
    capEl.textContent = caption || "";
    srcEl.href = photoUrl || "#";
    srcEl.style.display = photoUrl ? "" : "none";
    closeEl.focus();

    var id = photoIdFrom(photoUrl);
    if (!id) {
      // Not a CompanyCam asset link (e.g. a video, or a hand-pasted URL) -
      // there's nothing to inline, so point at the source instead of
      // failing silently.
      showMessage("There's no picture stored for this line. Use the CompanyCam link below to see it.");
      return;
    }
    if (cache[id]) {
      showImage(cache[id].displayUrl);
      return;
    }

    var token = ++reqToken;
    showMessage("Loading picture…");
    fetch("/.netlify/functions/sow-photo?id=" + encodeURIComponent(id))
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (token !== reqToken) return;          // closed, or another photo opened
        if (!res.ok || !res.data.photo) throw new Error((res.data && res.data.error) || "Couldn't load that picture");
        cache[id] = res.data.photo;
        showImage(res.data.photo.displayUrl);
      })
      .catch(function (err) {
        if (token !== reqToken) return;
        showMessage("Couldn't load that picture: " + err.message + ". Use the CompanyCam link below.");
      });
  }

  // Turns any <a> matching `selector` inside `container` into a lightbox
  // trigger. Plain clicks open the picture in place; modified clicks
  // (cmd/ctrl/shift/middle) still fall through to the browser, so "open in a
  // new tab" keeps working for anyone who wants CompanyCam itself.
  function bind(container, selector) {
    container.addEventListener("click", function (e) {
      var link = e.target.closest ? e.target.closest(selector) : null;
      if (!link || !container.contains(link)) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      open(link.getAttribute("href"), link.dataset.caption || link.textContent.trim());
    });
  }

  global.SowLightbox = { open: open, close: close, bind: bind };
})(window);
