// Pre-Purchase Underwriting Report Builder — vanilla JS, no build step.
// Sibling of sow.js but deliberately its own file: the SOW builder and this
// report builder are different products. Shared pure helpers live in
// ppr-shared.js (loaded first), NOT sow-shared.js.
//
// Persistence: primary store is Supabase (Save report / Load previous
// report, via the ppr-* Netlify functions). The URL also carries a
// lightweight copy of the state for "Copy link" — but with embedded image
// data stripped back to source URLs so the link stays short.

var DEFAULT_DISCLOSURES =
  "1. Who we are. Detroit Section 8 Property Management is a property management company. We are not licensed home inspectors, builders, engineers, architects, or construction contractors, and nothing in this report should be treated as a professional inspection, an engineering assessment, or a contractor's bid. Our observations are those of a property manager walking the property, based on what was visible and accessible on the date of inspection.\n\n" +
  "2. Not investment advice. This report is not investment, financial, legal, or tax advice, and is not a recommendation to buy, not buy, or pay any particular price for this property. Decisions about whether and how to proceed with a purchase are yours alone. You should retain your own licensed inspectors, contractors, and advisors before closing.\n\n" +
  "3. Informational purposes only. This report is provided for informational purposes only. It is not a warranty or guarantee of the property's condition, its compliance with any code or Section 8 / HQS standard, its rental income potential, or its future performance. Conditions not noted in this report may still exist, including latent or concealed defects.\n\n" +
  "4. Estimates are approximate. Any repair scopes, quantities, and cost figures in this report are rough estimates prepared for planning purposes. Actual costs may be materially higher or lower depending on contractor pricing, material costs, hidden conditions discovered during work, permit and inspection requirements, and the scope you ultimately choose. No figure in this report should be relied on as a firm quote.\n\n" +
  "5. No duty to you. Preparing this report does not create a fiduciary relationship, agency relationship, or any duty for us to advise, represent, or protect the interests of the buyer or any other reader. We are not obligated to manage this property, to perform any of the work described, or to take any action on your behalf.\n\n" +
  "6. Limitation. To the fullest extent permitted by law, Detroit Section 8 Property Management's liability arising out of this report is limited to the fee paid for the walkthrough, and we are not liable for any indirect, incidental, or consequential damages.";

var DEFAULT_COMPANY = "Detroit Section 8 Property Management";
var MAX_PHOTOS_PER_GROUP = 3;

var DEFAULT_REPORT = {
  address: "",
  preparedFor: "",
  inspectionDate: "",
  companyName: DEFAULT_COMPANY,
  companyCamProjectId: "",
  mediaLink: "",
  frontExteriorPhoto: "",
  frontExteriorPhotoSrc: "",
  bufferPct: 20,
  legalDisclosures: DEFAULT_DISCLOSURES,
  contextPhotos: [],
  sections: [],
  mediaListLinks: [],
  pmNotes: ""
};

function extractErrorMessage(result) {
  var data = result.data;
  if (data) {
    if (data.error) return data.error;
    if (data.errorMessage) return data.errorMessage;
  }
  return "HTTP " + (result.status || "?");
}

// ---- URL state ----
function encodeState(obj) {
  var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeState(str) {
  try {
    var b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch (e) { return null; }
}

function loadInitialState() {
  var params = new URLSearchParams(location.search);
  if (params.has("d")) {
    var decoded = decodeState(params.get("d"));
    if (decoded) return normalizeReport(decoded);
  }
  return JSON.parse(JSON.stringify(DEFAULT_REPORT));
}

// Fills in any missing fields / coerces shapes so a report from an older
// link, an uploaded file, or a DB row all end up uniform.
function normalizeReport(r) {
  r = r || {};
  return {
    address: r.address || "",
    preparedFor: r.preparedFor || "",
    inspectionDate: r.inspectionDate || "",
    companyName: r.companyName || DEFAULT_COMPANY,
    companyCamProjectId: r.companyCamProjectId || "",
    mediaLink: r.mediaLink || "",
    frontExteriorPhoto: r.frontExteriorPhoto || "",
    frontExteriorPhotoSrc: r.frontExteriorPhotoSrc || (isDataUri(r.frontExteriorPhoto) ? "" : (r.frontExteriorPhoto || "")),
    bufferPct: r.bufferPct != null ? Number(r.bufferPct) : 20,
    legalDisclosures: r.legalDisclosures != null ? r.legalDisclosures : DEFAULT_DISCLOSURES,
    contextPhotos: (Array.isArray(r.contextPhotos) ? r.contextPhotos : []).map(function (p) {
      p = p || {};
      var url = p.url || p.srcUrl || "";
      return { room: p.room || "", unit: p.unit || "", url: url, srcUrl: p.srcUrl || (isDataUri(url) ? "" : url) };
    }),
    sections: (Array.isArray(r.sections) ? r.sections : []).map(function (s) {
      s = s || {};
      return {
        room: s.room || "",
        items: (Array.isArray(s.items) ? s.items : []).map(function (it) {
          it = it || {};
          return {
            text: it.text || "",
            flag: (it.flag === "red" || it.flag === "optional") ? it.flag : "yellow",
            labor: it.labor != null ? Number(it.labor) : null,
            material: it.material != null ? Number(it.material) : null,
            photoUrl: it.photoUrl || null
          };
        })
      };
    }),
    mediaListLinks: (Array.isArray(r.mediaListLinks) ? r.mediaListLinks : []).map(function (l) {
      l = l || {};
      return { label: l.label || "", url: l.url || "" };
    }),
    pmNotes: r.pmNotes || ""
  };
}

function isDataUri(s) { return typeof s === "string" && /^data:/i.test(s); }

var report = loadInitialState();

// Nothing autosaves to the database while you type - the URL copy below is
// only a best-effort convenience for "Copy link" and gives up silently if
// it can't keep up (see pushStateToUrl). "Save report" is the only thing
// that actually writes to Supabase, so we track whether there are edits
// since the last real save/load and warn before the tab can be closed or
// navigated away from with unsaved work sitting only in memory.
var isDirty = false;
window.addEventListener("beforeunload", function (e) {
  if (!isDirty) return;
  e.preventDefault();
  e.returnValue = "";
});

// The URL copy is built field-by-field (no deep JSON clone of `report`) and
// deliberately excludes every base64 image blob — a report with a dozen
// embedded JPEGs is hundreds of KB, and cloning + serializing + base64ing
// that on every keystroke is what used to make the line-item boxes crawl.
function shareableClone() {
  return {
    address: report.address, preparedFor: report.preparedFor, inspectionDate: report.inspectionDate,
    companyName: report.companyName, companyCamProjectId: report.companyCamProjectId, mediaLink: report.mediaLink,
    frontExteriorPhoto: report.frontExteriorPhotoSrc || (isDataUri(report.frontExteriorPhoto) ? "" : report.frontExteriorPhoto),
    frontExteriorPhotoSrc: report.frontExteriorPhotoSrc || "",
    bufferPct: report.bufferPct,
    legalDisclosures: report.legalDisclosures,
    contextPhotos: (report.contextPhotos || []).map(function (p) {
      return { room: p.room, unit: p.unit, url: p.srcUrl || (isDataUri(p.url) ? "" : p.url), srcUrl: p.srcUrl || "" };
    }),
    sections: (report.sections || []).map(function (s) {
      return { room: s.room, items: (s.items || []).map(function (it) {
        return { text: it.text, flag: it.flag, labor: it.labor, material: it.material, photoUrl: it.photoUrl };
      }) };
    }),
    mediaListLinks: (report.mediaListLinks || []).map(function (l) { return { label: l.label, url: l.url }; }),
    pmNotes: report.pmNotes
  };
}
function currentUrlWithState() {
  return location.origin + location.pathname + "?d=" + encodeState(shareableClone());
}

// ---- Local draft autosave ----
// The database only gets written on an explicit "Save report". So that a
// half-finished report survives a tab getting discarded, an accidental
// close, or a reload, every debounced edit also writes a draft to this
// browser's localStorage (text/flags/prices/room-unit/cover fields only —
// same base64-stripped shape as the URL copy, so it stays small). On the
// next load, if the editor is empty and a draft is sitting there, we offer
// to restore it.
var DRAFT_KEY = "pprBuilderDraft.v1";
function saveDraft() {
  // Never overwrite a real draft with an empty editor - matters on boot,
  // where renderBuilder()'s debounced push would otherwise fire ~500ms
  // later and clobber the draft before the user clicks "Restore".
  if (reportIsEmpty(report)) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), report: shareableClone() }));
  } catch (e) { /* quota exceeded or storage disabled - the beforeunload warning still covers this */ }
}
function readDraft() {
  try {
    var raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    var d = JSON.parse(raw);
    if (!d || !d.report) return null;
    return d;
  } catch (e) { return null; }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
}
function reportIsEmpty(r) {
  return !(r.address || "").trim() && !(r.sections || []).length && !(r.contextPhotos || []).length &&
    !(r.preparedFor || "").trim() && !(r.mediaListLinks || []).length && !(r.pmNotes || "").trim();
}

// Debounced: typing fires this constantly, and history.replaceState with a
// multi-KB URL on every keystroke stutters. The URL is only a convenience
// (Copy link) — Save report is the real store — so a ~half-second lag on
// the address bar is fine.
var _urlSyncTimer = null;
function pushStateToUrl() {
  // Marked synchronously (not inside the debounce below) so the
  // beforeunload warning is armed immediately on the first keystroke,
  // not half a second later.
  isDirty = true;
  if (_urlSyncTimer) clearTimeout(_urlSyncTimer);
  _urlSyncTimer = setTimeout(function () {
    _urlSyncTimer = null;
    saveDraft();
    try { history.replaceState(null, "", currentUrlWithState()); } catch (e) { /* URL too long — Save report is what actually persists this, so this failing silently is fine on its own; it just means "Copy link" won't reflect the very latest edits until a save. */ }
  }, 500);
}

// ---- CompanyCam project id ----
function parseCompanyCamProjectId(url) {
  if (!url) return null;
  var m = String(url).match(/companycam\.com\/projects\/(\d+)/);
  return m ? m[1] : null;
}
function activeProjectId() {
  return parseCompanyCamProjectId(report.mediaLink) || (report.companyCamProjectId || null);
}

// ---- CompanyCam project search ----
// The whole account's project list is pulled once (server-side function,
// browser-cached 5 min) and the search box filters it locally — no API
// call per keystroke, and it matches on address as well as name.
var ccProjectsCache = null;
var ccProjectsLoad = null;
function loadCcProjects() {
  if (ccProjectsLoad) return ccProjectsLoad;
  ccProjectsLoad = fetch("/.netlify/functions/ppr-companycam-projects")
    .then(function (r) { return r.json(); })
    .then(function (d) { ccProjectsCache = (d.projects || []); return ccProjectsCache; })
    .catch(function () { ccProjectsCache = ccProjectsCache || []; return ccProjectsCache; });
  return ccProjectsLoad;
}
function ccLabel(p) {
  if (!p) return "";
  if (p.name && p.address) return p.name + " — " + p.address;
  return p.name || p.address || p.url || "";
}
function findCcById(id) {
  if (!id || !ccProjectsCache) return null;
  for (var i = 0; i < ccProjectsCache.length; i++) {
    if (String(ccProjectsCache[i].id) === String(id)) return ccProjectsCache[i];
  }
  return null;
}
var _ccActiveIdx = -1;
function renderCcResults(q) {
  var box = document.getElementById("mediaResults");
  if (!box) return;
  q = (q || "").trim().toLowerCase();
  if (q.length < 2 || !ccProjectsCache) { box.classList.remove("open"); box.innerHTML = ""; return; }
  var terms = q.split(/\s+/);
  var matches = ccProjectsCache.filter(function (p) {
    var hay = ((p.name || "") + " " + (p.address || "")).toLowerCase();
    return terms.every(function (t) { return hay.indexOf(t) !== -1; });
  }).slice(0, 10);
  _ccActiveIdx = -1;
  if (!matches.length) {
    box.innerHTML = '<div class="cc-empty">No matching CompanyCam projects.</div>';
    box.classList.add("open");
    return;
  }
  box.innerHTML = matches.map(function (p, i) {
    return '<div class="cc-row" data-id="' + esc(String(p.id)) + '" data-i="' + i + '">' +
      '<div class="n">' + esc(p.name || "(unnamed project)") + "</div>" +
      (p.address ? '<div class="a">' + esc(p.address) + "</div>" : "") + "</div>";
  }).join("");
  box.classList.add("open");
  box.querySelectorAll(".cc-row").forEach(function (row) {
    // mousedown, not click — fires before the input's blur so the pick lands
    row.addEventListener("mousedown", function (e) {
      e.preventDefault();
      pickCcProject(findCcById(row.dataset.id));
    });
  });
}
function pickCcProject(p) {
  if (!p) return;
  report.mediaLink = p.url;
  report.companyCamProjectId = String(p.id);
  var box = document.getElementById("mediaResults");
  box.classList.remove("open"); box.innerHTML = "";
  document.getElementById("mediaInput").value = ccLabel(p);
  updateMediaHint();
  pushStateToUrl();
}
function updateMediaHint() {
  var hint = document.getElementById("mediaHint");
  if (!hint) return;
  if (!report.mediaLink) { hint.style.display = "none"; hint.textContent = ""; return; }
  var p = findCcById(report.companyCamProjectId || parseCompanyCamProjectId(report.mediaLink));
  hint.style.display = "block";
  hint.textContent = "Linked: " + (p ? ccLabel(p) : report.mediaLink);
}
// Fills the search box + hint from the current report. Skips the box while
// the user is typing in it.
function updateMediaField() {
  var input = document.getElementById("mediaInput");
  if (!input) return;
  var box = document.getElementById("mediaResults");
  var searching = document.activeElement === input && box && box.classList.contains("open");
  if (!searching) {
    var p = findCcById(report.companyCamProjectId || parseCompanyCamProjectId(report.mediaLink));
    input.value = p ? ccLabel(p) : (report.mediaLink || "");
  }
  updateMediaHint();
}

// ---- Rendering ----
function autoGrow(el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
function esc(s) { return pprEscapeHtml(s); }

function groupKey(p) { return pprNormalizeKey((p.room || "") + "|" + (p.unit || "")); }

function overCapGroups() {
  var counts = {};
  report.contextPhotos.forEach(function (p) {
    var k = groupKey(p);
    counts[k] = (counts[k] || 0) + 1;
  });
  var over = [];
  report.contextPhotos.forEach(function (p) {
    var k = groupKey(p);
    if (counts[k] > MAX_PHOTOS_PER_GROUP && over.indexOf(k) === -1) {
      over.push(k);
    }
  });
  return over.map(function (k) {
    var sample = report.contextPhotos.find(function (p) { return groupKey(p) === k; });
    var name = (sample.room || "(no room)") + (sample.unit ? " — " + sample.unit : "");
    return name + " (" + counts[k] + ")";
  });
}

function renderBuilder() {
  document.getElementById("addressInput").value = report.address;
  document.getElementById("preparedForInput").value = report.preparedFor;
  document.getElementById("inspectionDateInput").value = report.inspectionDate;
  document.getElementById("companyNameInput").value = report.companyName;
  document.getElementById("bufferInput").value = report.bufferPct;
  updateMediaField();
  document.getElementById("frontPhotoInput").value = report.frontExteriorPhotoSrc || (isDataUri(report.frontExteriorPhoto) ? "" : report.frontExteriorPhoto);
  document.getElementById("disclosuresInput").value = report.legalDisclosures;
  document.getElementById("pmNotesInput").value = report.pmNotes;

  var fp = document.getElementById("frontPhotoPreview");
  fp.innerHTML = report.frontExteriorPhoto
    ? '<img src="' + esc(report.frontExteriorPhoto) + '" alt="Front exterior preview">'
    : "";

  renderContextPhotos();
  renderSections();
  renderLinks();
  computeAndShowTotals();
  pushStateToUrl();
}

function renderContextPhotos() {
  var c = document.getElementById("ctxPhotosContainer");
  c.innerHTML = "";
  report.contextPhotos.forEach(function (p, idx) {
    var row = document.createElement("div");
    row.className = "ctx-row";
    var thumb = p.url
      ? '<div class="ctx-thumb"><img src="' + esc(p.url) + '" alt=""></div>'
      : '<div class="ctx-thumb"><div class="noimg">no image</div></div>';
    row.innerHTML = thumb +
      '<div class="ctx-fields">' +
      '<div class="fld"><label>Room</label><input type="text" class="ctx-room" data-i="' + idx + '" value="' + esc(p.room) + '" placeholder="Kitchen"></div>' +
      '<div class="fld"><label>Unit</label><input type="text" class="ctx-unit" data-i="' + idx + '" value="' + esc(p.unit) + '" placeholder="Lower Unit"></div>' +
      '</div>' +
      '<div class="ctx-actions">' +
      '<button type="button" data-act="ctx-up" data-i="' + idx + '">&uarr;</button>' +
      '<button type="button" data-act="ctx-down" data-i="' + idx + '">&darr;</button>' +
      '<button type="button" data-act="ctx-del" data-i="' + idx + '">&times;</button>' +
      '</div>';
    c.appendChild(row);
  });

  updateCtxCapWarn();

  // Update the model + the cap warning only. Do NOT re-render the container
  // here — rebuilding its innerHTML on every keystroke destroys the very
  // input being typed in, which is what made these boxes accept one letter
  // at a time.
  c.querySelectorAll(".ctx-room").forEach(function (el) {
    el.oninput = function (e) { report.contextPhotos[e.target.dataset.i].room = e.target.value; updateCtxCapWarn(); pushStateToUrl(); };
  });
  c.querySelectorAll(".ctx-unit").forEach(function (el) {
    el.oninput = function (e) { report.contextPhotos[e.target.dataset.i].unit = e.target.value; updateCtxCapWarn(); pushStateToUrl(); };
  });
  c.querySelectorAll("[data-act]").forEach(function (el) {
    el.onclick = function (e) {
      var i = Number(e.currentTarget.dataset.i);
      var act = e.currentTarget.dataset.act;
      if (act === "ctx-del") report.contextPhotos.splice(i, 1);
      else if (act === "ctx-up" && i > 0) swap(report.contextPhotos, i, i - 1);
      else if (act === "ctx-down" && i < report.contextPhotos.length - 1) swap(report.contextPhotos, i, i + 1);
      renderBuilder();
    };
  });
}

function swap(arr, a, b) { var t = arr[a]; arr[a] = arr[b]; arr[b] = t; }

// Lightweight: recomputes the over-cap groups and updates just the warning
// line. Safe to call on every keystroke — touches one element, no rebuild.
function updateCtxCapWarn() {
  var warn = document.getElementById("ctxCapWarn");
  if (!warn) return;
  var over = overCapGroups();
  if (over.length) {
    warn.style.display = "block";
    warn.textContent = "Over the 3-per-room limit: " + over.join(", ") + ". Trim before printing.";
  } else {
    warn.style.display = "none";
  }
}

function flagOptions(sel) {
  return ["yellow", "red", "optional"].map(function (v) {
    var label = v === "red" ? "Red flag" : v === "yellow" ? "Yellow flag" : "Optional";
    return '<option value="' + v + '"' + (sel === v ? " selected" : "") + ">" + label + "</option>";
  }).join("");
}

function renderSections() {
  var container = document.getElementById("sectionsContainer");
  container.innerHTML = "";
  report.sections.forEach(function (section, sIdx) {
    var roomRow = document.createElement("div");
    roomRow.className = "room-row";
    roomRow.innerHTML =
      '<div class="room-name-wrap"><input type="text" class="room-name" value="' + esc(section.room) + '" data-s="' + sIdx + '"></div>' +
      '<div class="room-rest">' +
      '<span class="room-subtotal" data-s="' + sIdx + '">' + pprCurrency(roomBase(section)) + '</span>' +
      '<button class="btn small no-print" data-s="' + sIdx + '" data-act="delroom">Delete room</button></div>';
    container.appendChild(roomRow);

    section.items.forEach(function (item, iIdx) {
      var row = document.createElement("div");
      row.className = "item-row flag-" + pprFlag(item);
      var photoLinkHtml = item.photoUrl
        ? '<a class="photo-link" href="' + esc(item.photoUrl) + '" target="_blank" rel="noopener" title="View photo/video in CompanyCam">&#128247;</a>'
        : "";
      row.innerHTML =
        '<div class="c-flagcell"><span class="flagmark">&#9873;</span><select class="flag-select" data-s="' + sIdx + '" data-i="' + iIdx + '">' + flagOptions(pprFlag(item)) + "</select></div>" +
        '<div class="c-desc"><textarea rows="1" class="item-text" data-s="' + sIdx + '" data-i="' + iIdx + '">' + esc(item.text) + "</textarea>" + photoLinkHtml + "</div>" +
        '<div class="c-labor"><input type="number" class="price" data-s="' + sIdx + '" data-i="' + iIdx + '" data-field="labor" value="' + (item.labor != null ? item.labor : "") + '" placeholder="0"></div>' +
        '<div class="c-material"><input type="number" class="price" data-s="' + sIdx + '" data-i="' + iIdx + '" data-field="material" value="' + (item.material != null ? item.material : "") + '" placeholder="0"></div>' +
        '<div class="c-del"><button data-s="' + sIdx + '" data-i="' + iIdx + '" data-act="delitem">&#10005;</button></div>';
      container.appendChild(row);
    });

    var addItemBtn = document.createElement("button");
    addItemBtn.className = "btn small no-print addrow-btn";
    addItemBtn.textContent = "+ Add line to " + (section.room || "room");
    addItemBtn.dataset.s = sIdx;
    addItemBtn.dataset.act = "additem";
    container.appendChild(addItemBtn);
  });

  attachSectionListeners();
  document.querySelectorAll(".item-text").forEach(autoGrow);
}

function roomBase(section) {
  var t = 0;
  section.items.forEach(function (it) {
    if (!(it.text || "").trim()) return;
    t += (Number(it.labor) || 0) + (Number(it.material) || 0);
  });
  return t;
}

function renderLinks() {
  var c = document.getElementById("linksContainer");
  c.innerHTML = "";
  report.mediaListLinks.forEach(function (l, idx) {
    var row = document.createElement("div");
    row.className = "link-row";
    row.innerHTML =
      '<input type="text" class="link-label" data-i="' + idx + '" value="' + esc(l.label) + '" placeholder="Video of lower unit">' +
      '<input type="text" class="link-url" data-i="' + idx + '" value="' + esc(l.url) + '" placeholder="https://app.companycam.com/&hellip;">' +
      '<button type="button" data-act="link-up" data-i="' + idx + '">&uarr;</button>' +
      '<button type="button" data-act="link-down" data-i="' + idx + '">&darr;</button>' +
      '<button type="button" data-act="link-del" data-i="' + idx + '">&times;</button>';
    c.appendChild(row);
  });
  c.querySelectorAll(".link-label").forEach(function (el) {
    el.oninput = function (e) { report.mediaListLinks[e.target.dataset.i].label = e.target.value; pushStateToUrl(); };
  });
  c.querySelectorAll(".link-url").forEach(function (el) {
    el.oninput = function (e) { report.mediaListLinks[e.target.dataset.i].url = e.target.value; pushStateToUrl(); };
  });
  c.querySelectorAll("[data-act]").forEach(function (el) {
    el.onclick = function (e) {
      var i = Number(e.currentTarget.dataset.i);
      var act = e.currentTarget.dataset.act;
      if (act === "link-del") report.mediaListLinks.splice(i, 1);
      else if (act === "link-up" && i > 0) swap(report.mediaListLinks, i, i - 1);
      else if (act === "link-down" && i < report.mediaListLinks.length - 1) swap(report.mediaListLinks, i, i + 1);
      renderLinks();
      pushStateToUrl();
    };
  });
}

function computeAndShowTotals() {
  var t = pprComputeTotals(report);
  document.getElementById("totRed").textContent = pprCurrency(t.red);
  document.getElementById("totYellow").textContent = pprCurrency(t.yellow);
  document.getElementById("totOptional").textContent = pprCurrency(t.optional);
  document.getElementById("totGrand").textContent = pprCurrency(t.grand);
}

function attachSectionListeners() {
  document.querySelectorAll(".room-name").forEach(function (el) {
    el.oninput = function (e) { report.sections[e.target.dataset.s].room = e.target.value; pushStateToUrl(); };
  });
  document.querySelectorAll(".item-text").forEach(function (el) {
    el.oninput = function (e) {
      report.sections[e.target.dataset.s].items[e.target.dataset.i].text = e.target.value;
      autoGrow(e.target);
      pushStateToUrl();
    };
  });
  document.querySelectorAll(".flag-select").forEach(function (el) {
    el.onchange = function (e) {
      report.sections[e.target.dataset.s].items[e.target.dataset.i].flag = e.target.value;
      renderSections();
      computeAndShowTotals();
      pushStateToUrl();
    };
  });
  document.querySelectorAll(".price").forEach(function (el) {
    el.oninput = function (e) {
      var s = e.target.dataset.s, i = e.target.dataset.i, f = e.target.dataset.field;
      report.sections[s].items[i][f] = e.target.value === "" ? null : Number(e.target.value);
      var sub = document.querySelector('.room-subtotal[data-s="' + s + '"]');
      if (sub) sub.textContent = pprCurrency(roomBase(report.sections[s]));
      computeAndShowTotals();
      pushStateToUrl();
    };
  });
  document.querySelectorAll('[data-act="delitem"]').forEach(function (el) {
    el.onclick = function (e) {
      var t = e.currentTarget;
      report.sections[t.dataset.s].items.splice(t.dataset.i, 1);
      renderSections(); computeAndShowTotals(); pushStateToUrl();
    };
  });
  document.querySelectorAll('[data-act="delroom"]').forEach(function (el) {
    el.onclick = function (e) {
      if (!confirm("Delete this whole room and its lines?")) return;
      report.sections.splice(e.currentTarget.dataset.s, 1);
      renderSections(); computeAndShowTotals(); pushStateToUrl();
    };
  });
  document.querySelectorAll('[data-act="additem"]').forEach(function (el) {
    el.onclick = function (e) {
      report.sections[e.currentTarget.dataset.s].items.push({ text: "", flag: "yellow", labor: null, material: null, photoUrl: null });
      renderSections(); pushStateToUrl();
    };
  });
}

// ---- Top-level field listeners ----
document.getElementById("addressInput").oninput = function (e) { report.address = e.target.value; pushStateToUrl(); };
document.getElementById("preparedForInput").oninput = function (e) { report.preparedFor = e.target.value; pushStateToUrl(); };
document.getElementById("inspectionDateInput").oninput = function (e) { report.inspectionDate = e.target.value; pushStateToUrl(); };
document.getElementById("companyNameInput").oninput = function (e) { report.companyName = e.target.value; pushStateToUrl(); };
document.getElementById("bufferInput").oninput = function (e) { report.bufferPct = e.target.value === "" ? 0 : Number(e.target.value); computeAndShowTotals(); pushStateToUrl(); };
(function () {
  var input = document.getElementById("mediaInput");
  var box = document.getElementById("mediaResults");

  input.oninput = function (e) {
    var v = e.target.value;
    var pid = parseCompanyCamProjectId(v);
    if (pid) {
      // A pasted link still works exactly as before.
      report.mediaLink = v;
      report.companyCamProjectId = pid;
      box.classList.remove("open"); box.innerHTML = "";
      updateMediaHint();
      pushStateToUrl();
      return;
    }
    // Otherwise treat it as a search. Clearing the box unlinks the project.
    if (!v.trim()) {
      report.mediaLink = ""; report.companyCamProjectId = "";
      updateMediaHint();
      pushStateToUrl();
    }
    if (ccProjectsCache) renderCcResults(v);
    else loadCcProjects().then(function () { renderCcResults(input.value); });
  };

  input.onfocus = function () {
    loadCcProjects().then(function () {
      if (input.value && !parseCompanyCamProjectId(input.value)) renderCcResults(input.value);
    });
  };
  input.onblur = function () {
    // Delay so a result's mousedown-driven pick isn't cut off. (mousedown
    // already beats blur, but keep the box visible a beat regardless.)
    setTimeout(function () { box.classList.remove("open"); }, 150);
  };
  input.onkeydown = function (e) {
    if (!box.classList.contains("open")) return;
    var rows = box.querySelectorAll(".cc-row");
    if (!rows.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      _ccActiveIdx += (e.key === "ArrowDown" ? 1 : -1);
      if (_ccActiveIdx < 0) _ccActiveIdx = rows.length - 1;
      if (_ccActiveIdx >= rows.length) _ccActiveIdx = 0;
      rows.forEach(function (r, i) { r.classList.toggle("active", i === _ccActiveIdx); });
    } else if (e.key === "Enter" && _ccActiveIdx >= 0) {
      e.preventDefault();
      pickCcProject(findCcById(rows[_ccActiveIdx].dataset.id));
    } else if (e.key === "Escape") {
      box.classList.remove("open");
    }
  };
})();
document.getElementById("frontPhotoInput").oninput = function (e) {
  report.frontExteriorPhotoSrc = e.target.value;
  report.frontExteriorPhoto = e.target.value;
  var fp = document.getElementById("frontPhotoPreview");
  fp.innerHTML = e.target.value ? '<img src="' + esc(e.target.value) + '" alt="Front exterior preview">' : "";
  pushStateToUrl();
};
document.getElementById("disclosuresInput").oninput = function (e) { report.legalDisclosures = e.target.value; pushStateToUrl(); };
document.getElementById("pmNotesInput").oninput = function (e) { report.pmNotes = e.target.value; pushStateToUrl(); };

document.getElementById("addRoomBtn").onclick = function () {
  report.sections.push({ room: "New Room", items: [{ text: "", flag: "yellow", labor: null, material: null, photoUrl: null }] });
  renderSections(); pushStateToUrl();
};
document.getElementById("addLinkBtn").onclick = function () {
  report.mediaListLinks.push({ label: "", url: "" });
  renderLinks(); pushStateToUrl();
};
document.getElementById("addCtxManualBtn").onclick = function () {
  var url = prompt("Image URL for this context photo:");
  if (url == null) return;
  url = url.trim();
  report.contextPhotos.push({ room: "", unit: "", url: url, srcUrl: isDataUri(url) ? "" : url });
  renderBuilder();
};

// ---- CompanyCam photo picker ----
var pickState = { mode: null, photos: [], selected: [] };

function openPicker(mode) {
  var pid = activeProjectId();
  var status = document.getElementById("pickStatus");
  var grid = document.getElementById("pickGrid");
  if (!pid) {
    alert("Paste the CompanyCam project link up top first.");
    return;
  }
  pickState = { mode: mode, photos: [], selected: [] };
  document.getElementById("pickTitle").textContent = mode === "front" ? "Pick the front exterior photo" : "Pick room context photos";
  document.getElementById("pickConfirmBtn").textContent = mode === "front" ? "Use this photo" : "Add selected";
  grid.innerHTML = "";
  status.textContent = "Loading photos from CompanyCam…";
  status.className = "sendstatus";
  document.getElementById("pickModal").classList.add("open");

  fetch("/.netlify/functions/ppr-companycam-photos?projectId=" + encodeURIComponent(pid))
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
    .then(function (res) {
      if (!res.ok) { status.textContent = "Failed: " + extractErrorMessage(res); status.className = "sendstatus err"; return; }
      pickState.photos = res.data.photos || [];
      status.textContent = pickState.photos.length + " photos. " + (pickState.mode === "front" ? "Click one." : "Click to select multiple.");
      status.className = "sendstatus";
      renderPickGrid();
    })
    .catch(function (err) { status.textContent = "Failed: " + err.message; status.className = "sendstatus err"; });
}

function renderPickGrid() {
  var grid = document.getElementById("pickGrid");
  grid.innerHTML = "";
  pickState.photos.forEach(function (p, idx) {
    var cell = document.createElement("button");
    cell.type = "button";
    cell.className = "pick-cell" + (pickState.selected.indexOf(idx) !== -1 ? " sel" : "");
    cell.innerHTML = '<img src="' + esc(p.thumbUrl || p.displayUrl) + '" alt="">' +
      '<div class="pick-cap">' + esc((p.description || "").slice(0, 90)) + "</div>";
    cell.onclick = function () {
      if (pickState.mode === "front") {
        pickState.selected = [idx];
      } else {
        var at = pickState.selected.indexOf(idx);
        if (at === -1) pickState.selected.push(idx); else pickState.selected.splice(at, 1);
      }
      renderPickGrid();
    };
    grid.appendChild(cell);
  });
}

document.getElementById("pickCloseBtn").onclick = function () { document.getElementById("pickModal").classList.remove("open"); };
document.getElementById("pickFrontBtn").onclick = function () { openPicker("front"); };
document.getElementById("pickCtxBtn").onclick = function () { openPicker("context"); };

document.getElementById("pickConfirmBtn").onclick = function () {
  var picks = pickState.selected.map(function (i) { return pickState.photos[i]; }).filter(Boolean);
  if (!picks.length) { document.getElementById("pickModal").classList.remove("open"); return; }
  if (pickState.mode === "front") {
    var u = picks[0].displayUrl || picks[0].thumbUrl;
    report.frontExteriorPhoto = u;
    report.frontExteriorPhotoSrc = u;
  } else {
    picks.forEach(function (p) {
      var u = p.displayUrl || p.thumbUrl;
      report.contextPhotos.push({ room: "", unit: "", url: u, srcUrl: u });
    });
  }
  document.getElementById("pickModal").classList.remove("open");
  renderBuilder();
};

// ---- Embed photos as base64 ----
document.getElementById("embedImagesBtn").onclick = function () { embedImages(true); };

function embedImages(loud) {
  var status = document.getElementById("embedStatus");
  var jobs = [];
  if (report.frontExteriorPhotoSrc && !isDataUri(report.frontExteriorPhoto)) jobs.push(report.frontExteriorPhotoSrc);
  report.contextPhotos.forEach(function (p) {
    if (p.srcUrl && !isDataUri(p.url)) jobs.push(p.srcUrl);
  });
  jobs = jobs.filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  if (!jobs.length) {
    if (loud) { status.textContent = "Nothing to embed — all photos are already inlined."; status.className = "sendstatus ok"; }
    return Promise.resolve();
  }
  var btn = document.getElementById("embedImagesBtn");
  btn.disabled = true;
  status.textContent = "Embedding " + jobs.length + " photo(s)…";
  status.className = "sendstatus";
  return fetch("/.netlify/functions/ppr-fetch-images", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls: jobs })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var map = {};
      (data.images || []).forEach(function (im) { if (im.dataUri) map[im.url] = im.dataUri; });
      var done = 0, failed = 0;
      if (report.frontExteriorPhotoSrc && map[report.frontExteriorPhotoSrc]) { report.frontExteriorPhoto = map[report.frontExteriorPhotoSrc]; done++; }
      report.contextPhotos.forEach(function (p) {
        if (p.srcUrl && map[p.srcUrl]) { p.url = map[p.srcUrl]; done++; }
        else if (p.srcUrl && !isDataUri(p.url)) failed++;
      });
      btn.disabled = false;
      status.textContent = "Embedded " + done + " photo(s)." + (failed ? " " + failed + " couldn't be fetched — left as links." : "");
      status.className = failed ? "sendstatus err" : "sendstatus ok";
      renderBuilder();
    })
    .catch(function (err) {
      btn.disabled = false;
      status.textContent = "Embed failed: " + err.message;
      status.className = "sendstatus err";
    });
}

// ---- Save / load ----
function refreshReportList() {
  var select = document.getElementById("loadReportSelect");
  return fetch("/.netlify/functions/ppr-list")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var current = select.value;
      select.innerHTML = '<option value="">Load previous report&hellip;</option>';
      (data.reports || []).forEach(function (row) {
        var opt = document.createElement("option");
        opt.value = row.id;
        var d = new Date(row.updated_at);
        opt.textContent = row.address + " (" + (d.toString() !== "Invalid Date" ? d.toLocaleDateString() : "") + ")";
        select.appendChild(opt);
      });
      select.value = current;
    })
    .catch(function () { /* dropdown just stays empty */ });
}

document.getElementById("saveReportBtn").onclick = function () {
  var status = document.getElementById("saveStatus");
  if (!report.address || !report.address.trim()) {
    status.textContent = "Enter a property address before saving.";
    status.className = "sendstatus err";
    return;
  }
  var btn = document.getElementById("saveReportBtn");
  btn.disabled = true;
  status.textContent = "Saving…";
  status.className = "sendstatus";
  fetch("/.netlify/functions/ppr-save", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report: report })
  })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
    .then(function (result) {
      btn.disabled = false;
      if (result.ok) {
        status.textContent = "Saved. It'll show up in “Load previous report”.";
        status.className = "sendstatus ok";
        isDirty = false;
        clearDraft();
        refreshReportList();
      } else {
        status.textContent = "Failed: " + extractErrorMessage(result);
        status.className = "sendstatus err";
      }
    })
    .catch(function (err) {
      btn.disabled = false;
      status.textContent = "Failed: " + err.message;
      status.className = "sendstatus err";
    });
};

document.getElementById("loadReportSelect").onchange = function (e) {
  var id = e.target.value;
  if (!id) return;
  if ((report.sections.length || report.contextPhotos.length) && !confirm("This will replace everything currently in the editor. Continue?")) {
    e.target.value = "";
    return;
  }
  fetch("/.netlify/functions/ppr-load?id=" + encodeURIComponent(id))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.report) throw new Error(data.error || "Not found");
      report = normalizeReport(data.report);
      renderBuilder();
      // Fresh from the database - matches what's persisted, nothing
      // pending. renderBuilder()'s own pushStateToUrl() call just set
      // isDirty back to true, so this has to come after it, not before.
      isDirty = false;
      clearDraft();
      e.target.value = "";
    })
    .catch(function (err) {
      alert("Couldn't load that report: " + err.message);
      e.target.value = "";
    });
};

// ---- Load from Claude (skill drop box) ----
// The build-underwriting-report skill POSTs its finished report to
// /ppr-stash instead of handing over a file. These are the recent ones.
function refreshStashList() {
  var select = document.getElementById("loadStashSelect");
  return fetch("/.netlify/functions/ppr-stash-list")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var current = select.value;
      select.innerHTML = '<option value="">Load from Claude&hellip;</option>';
      (data.stash || []).forEach(function (row) {
        var opt = document.createElement("option");
        opt.value = row.id;
        var d = new Date(row.created_at);
        opt.textContent = row.address + " (" + (d.toString() !== "Invalid Date" ? d.toLocaleString() : "") + ")";
        select.appendChild(opt);
      });
      select.value = current;
    })
    .catch(function () { /* dropdown just stays empty */ });
}

document.getElementById("loadStashSelect").onchange = function (e) {
  var id = e.target.value;
  if (!id) return;
  if ((report.sections.length || report.contextPhotos.length) && !confirm("This will replace everything currently in the editor with the Claude build. Continue?")) {
    e.target.value = "";
    return;
  }
  var status = document.getElementById("uploadStatus");
  status.textContent = "Loading from Claude…";
  status.className = "sendstatus";
  fetch("/.netlify/functions/ppr-stash-load?id=" + encodeURIComponent(id))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.report) throw new Error(data.error || "Not found");
      report = normalizeReport(data.report);
      if (!report.legalDisclosures) report.legalDisclosures = DEFAULT_DISCLOSURES;
      renderBuilder();
      isDirty = false;
      status.textContent = "Loaded “" + (report.address || "report") + "” from Claude — " + report.sections.length +
        " rooms, " + report.contextPhotos.length + " context photos. Embedding photos…";
      status.className = "sendstatus ok";
      embedImages(false).then(function () {
        status.textContent = "Loaded “" + (report.address || "report") + "” from Claude. Fill in prices, then download or send.";
      });
      e.target.value = "";
    })
    .catch(function (err) {
      alert("Couldn't load that Claude build: " + err.message);
      e.target.value = "";
    });
};

// ---- Upload a report file (produced by the /build-underwriting-report skill) ----
function isValidReportShape(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (!Array.isArray(obj.sections)) return false;
  for (var i = 0; i < obj.sections.length; i++) {
    if (typeof obj.sections[i].room !== "string" || !Array.isArray(obj.sections[i].items)) return false;
  }
  return true;
}

document.getElementById("uploadReportBtn").onclick = function () { document.getElementById("uploadReportInput").click(); };
document.getElementById("uploadReportInput").onchange = function (e) {
  var file = e.target.files[0];
  var status = document.getElementById("uploadStatus");
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    var parsed;
    try { parsed = JSON.parse(reader.result); }
    catch (err) {
      status.textContent = "That file isn't valid JSON — was it exported by the report skill?";
      status.className = "sendstatus err";
      return;
    }
    if (!isValidReportShape(parsed)) {
      status.textContent = "That file doesn't look like a report export (missing sections/items). Nothing was loaded.";
      status.className = "sendstatus err";
      return;
    }
    if ((report.sections.length || report.contextPhotos.length) && !confirm("This will replace everything currently in the editor with the uploaded file. Continue?")) return;
    report = normalizeReport(parsed);
    if (!report.legalDisclosures) report.legalDisclosures = DEFAULT_DISCLOSURES;
    status.textContent = "Loaded “" + (report.address || "report") + "” — " + report.sections.length + " rooms, " + report.contextPhotos.length + " context photos. Embedding photos…";
    status.className = "sendstatus ok";
    renderBuilder();
    embedImages(false).then(function () {
      status.textContent = "Loaded “" + (report.address || "report") + "” — fill in prices, then download or send.";
    });
  };
  reader.onerror = function () { status.textContent = "Couldn't read that file."; status.className = "sendstatus err"; };
  reader.readAsText(file);
  e.target.value = "";
};

// ---- Print / PDF ----
var printStyleEl = document.createElement("style");
printStyleEl.media = "print";
printStyleEl.textContent = PPR_REPORT_CSS +
  "\n@media print{ body[data-printing] #builderView{display:none !important;} body[data-printing] #printView{display:block !important;} }";
document.head.appendChild(printStyleEl);

document.getElementById("downloadPdfBtn").onclick = function () {
  document.getElementById("printView").innerHTML = pprBuildReportHtml(report);
  document.title = "Pre-Purchase Report - " + (report.address || "report");
  document.body.dataset.printing = "1";
  window.print();
  setTimeout(function () { delete document.body.dataset.printing; }, 400);
};

// ---- Copy link ----
// This used to be the builder's own URL + "?d=" + base64(whole report), which
// meant the link opened the editable builder and carried the report in the
// URL. A real report doesn't fit (9383 Rutland encodes to ~26k characters and
// Netlify answers 414 URI Too Long), so the link simply failed. Same fix as
// the SOW builder's owner link: save the report, then link to ppr-view.html
// by its id.
function viewLinkFor(id) {
  var dir = location.pathname.replace(/[^/]*$/, "");
  return location.origin + dir + "ppr-view.html?id=" + encodeURIComponent(id);
}

document.getElementById("copyLinkBtn").onclick = function () {
  var btn = document.getElementById("copyLinkBtn");
  var wrap = document.getElementById("linkwrap");
  var hint = document.getElementById("linkHint");
  var out = document.getElementById("linkOut");

  if (!report.address || !report.address.trim()) {
    wrap.style.display = "block";
    hint.textContent = "Add the property address first - the link is saved under it.";
    out.value = "";
    return;
  }

  var label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving…";

  fetch("/.netlify/functions/ppr-save", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report: report })
  })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
    .then(function (result) {
      btn.disabled = false;
      btn.textContent = label;
      if (!result.ok || !result.data.id) throw new Error(extractErrorMessage(result));

      isDirty = false;
      clearDraft();
      refreshReportList();

      var url = viewLinkFor(result.data.id);
      wrap.style.display = "block";
      hint.textContent = "Link copied. It opens a read-only copy of the report - no prices, no builder. Saving again updates what this link shows.";
      out.value = url;
      out.focus(); out.select();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          btn.textContent = "Copied!";
          setTimeout(function () { btn.textContent = label; }, 1600);
        }, function () {});
      }
    })
    .catch(function (err) {
      btn.disabled = false;
      btn.textContent = label;
      wrap.style.display = "block";
      hint.textContent = "Couldn't save the report for a link: " + err.message;
      out.value = "";
    });
};

// ---- Send to CompanyCam ----
document.getElementById("sendCCBtn").onclick = function () {
  var status = document.getElementById("sendStatus");
  var projectId = activeProjectId();
  if (!projectId) {
    status.textContent = "Couldn't find a CompanyCam project ID in the project link above. Paste a link like https://app.companycam.com/projects/123456 first.";
    status.className = "sendstatus err";
    return;
  }
  var btn = document.getElementById("sendCCBtn");
  btn.disabled = true;
  status.textContent = "Rendering and sending… (this can take ~20s)";
  status.className = "sendstatus";
  fetch("/.netlify/functions/ppr-send-to-companycam", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: projectId, report: report })
  })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
    .then(function (result) {
      btn.disabled = false;
      if (result.ok) { status.textContent = "Sent to CompanyCam Files."; status.className = "sendstatus ok"; }
      else { status.textContent = "Failed: " + extractErrorMessage(result); status.className = "sendstatus err"; }
    })
    .catch(function (err) {
      btn.disabled = false;
      status.textContent = "Failed: " + err.message;
      status.className = "sendstatus err";
    });
};

// ---- Draft restore ----
// Only offer it when this is a blank editor (no ?d= link, nothing typed)
// and a draft is actually sitting in localStorage.
function offerDraftRestore() {
  if (!reportIsEmpty(report)) return;
  var d = readDraft();
  if (!d || reportIsEmpty(normalizeReport(d.report))) return;

  var when = "";
  try { when = new Date(d.savedAt).toLocaleString(); } catch (e) {}
  var bar = document.createElement("div");
  bar.className = "sendstatus";
  bar.style.cssText = "background:#fff8e6;border:1px solid var(--gold);padding:12px 14px;margin-bottom:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;";
  bar.innerHTML = '<span style="flex:1;min-width:200px;color:var(--ink);">Unsaved draft found' +
    (when ? ' from ' + esc(when) : '') + '. Restore it?</span>' +
    '<button class="btn small" id="draftRestoreBtn" type="button">Restore draft</button>' +
    '<button class="btn small" id="draftDiscardBtn" type="button">Discard</button>';
  var view = document.getElementById("builderView");
  view.insertBefore(bar, view.firstChild);

  document.getElementById("draftRestoreBtn").onclick = function () {
    report = normalizeReport(d.report);
    renderBuilder();
    isDirty = false;
    bar.remove();
    embedImages(false);
  };
  document.getElementById("draftDiscardBtn").onclick = function () {
    clearDraft();
    bar.remove();
  };
}

// ---- Boot ----
renderBuilder();
// The initial render's own pushStateToUrl() call just marked this dirty,
// but nothing has actually been edited yet - a fresh page load (or one
// opened from a shared link) shouldn't warn on close until you've typed
// something.
isDirty = false;
offerDraftRestore();
refreshReportList();
refreshStashList();
loadCcProjects().then(function () { updateMediaField(); });
