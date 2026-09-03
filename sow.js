// Scope of Work Builder — vanilla JS, no build step, no backend except the
// one CompanyCam upload function. State lives entirely in the page's own URL
// (same trick as owner-faq.html's link-copy feature), so there is no database.
//
// escapeHtml/currency/computeTotals/computeRoomSubtotal/buildPrintHtml now
// live in sow-shared.js (loaded before this file) so the server-side
// "Send to CompanyCam Files" function can reuse the exact same PDF-building
// logic instead of drifting out of sync with it.

var DEFAULT_SOW = {
  address: "",
  typeOfWork: "Pre-inspection list",
  mediaLink: "",
  bufferPct: 20,
  sections: [],
  questions: [],
  // Manual override for the Contractor Total (labor only). null = use the
  // computed line-item sum; a number means "the real total is this,
  // regardless of what the lines add up to."
  contractorTotalOverride: null,
  // Shown on the Contractor Copy only (never the Owner Copy), and only
  // when showKeyLocation is true.
  keyLocation: "",
  showKeyLocation: true
};

// A failed function call's JSON body isn't always shaped the way our own
// functions shape it ({error: "..."}) - a platform-level crash (e.g. the
// function throwing before it reaches its own try/catch) comes back as
// {errorMessage: "...", errorType: "...", trace: [...]} instead, which
// used to fall through to a useless "unknown error". Check both shapes and
// fall back to the HTTP status so there's always something to go on.
function extractErrorMessage(result) {
  var data = result.data;
  if (data) {
    if (data.error) return data.error;
    if (data.errorMessage) return data.errorMessage;
  }
  return "HTTP " + (result.status || "?");
}

// ---- URL state encoding ----
function encodeState(sow) {
  var json = JSON.stringify(sow);
  var b64 = btoa(unescape(encodeURIComponent(json)));
  // URL-safe
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeState(str) {
  try {
    var b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function loadInitialState() {
  var params = new URLSearchParams(location.search);
  if (params.has("d")) {
    var decoded = decodeState(params.get("d"));
    if (decoded) return decoded;
  }
  return JSON.parse(JSON.stringify(DEFAULT_SOW));
}

var sow = loadInitialState();

function currentUrlWithState() {
  var encoded = encodeState(sow);
  return location.origin + location.pathname + "?d=" + encoded;
}

function pushStateToUrl() {
  var url = currentUrlWithState();
  history.replaceState(null, "", url);
}

// ---- Rate cache (exact-match price auto-fill) ----
// Fetched once on load into a plain object keyed by normalizeKey(taskText)
// -> {labor, material}, so matching a line item's text is a local lookup,
// not a network call per keystroke/blur.
var ratesCache = {};
var ratesList = [];

function loadRatesCache() {
  return fetch("/.netlify/functions/rates-list")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      ratesCache = {};
      ratesList = data.rates || [];
      ratesList.forEach(function (r) {
        ratesCache[r.taskKey] = { labor: r.labor, material: r.material };
      });
    })
    .catch(function () { /* no rate data yet, or offline - fine, just no auto-fill */ });
}

// Fills any item that has no price yet from the closest equivalent job in the
// rate table (see bestRateMatch in sow-shared.js for how "equivalent" is
// decided, and why it errs on the side of filling nothing).
//
// Anything filled here is marked priceSource:"matched" - an UNCONFIRMED
// price. It shows greyed out, it is not written back to the rate table, and
// it stops being unconfirmed the moment a human edits or accepts it. That
// last part matters: without it, a guess gets saved as history and becomes
// the thing the next SOW matches against, so one bad number quietly hardens
// into the standard price.
//
// priceBasis is kept even when the matched job has no usable price, so the
// builder can still say "you've done this before, here's what you called it".
function autofillAllFromRates() {
  var changed = false;
  sow.sections.forEach(function (section) {
    section.items.forEach(function (item) {
      if (item.labor != null || item.material != null) return;
      if (!(item.text || "").trim()) return;
      var match = bestRateMatch(item.text, ratesList);
      if (!match) return;
      if (match.labor == null && match.material == null) {
        if (item.priceBasis !== match.rate.taskText) { item.priceBasis = match.rate.taskText; changed = true; }
        return;
      }
      if (match.labor != null) item.labor = match.labor;
      if (match.material != null) item.material = match.material;
      item.priceSource = "matched";
      item.priceBasis = match.rate.taskText;
      changed = true;
    });
  });
  return changed;
}

// A price the builder guessed, still waiting on a human. Anything else -
// typed by hand, or accepted - counts as confirmed and behaves normally.
function isUnconfirmed(item) {
  return item.priceSource === "matched" || item.priceSource === "suggested";
}

function confirmPrice(item) {
  delete item.priceSource;
}

function countUnconfirmed() {
  var n = 0;
  sow.sections.forEach(function (section) {
    section.items.forEach(function (item) { if (isUnconfirmed(item)) n++; });
  });
  return n;
}

// ---- Global contractor list (shared across every SOW, like the rate cache) ----
// Fetched once on load into a plain array of names. Adding a contractor
// writes through to the contractors table via contractor-save, so it shows
// up in every SOW's dropdowns from then on - not just this one.
var contractorsCache = [];

function loadContractorsCache() {
  return fetch("/.netlify/functions/contractors-list")
    .then(function (r) { return r.json(); })
    .then(function (data) { contractorsCache = data.contractors || []; })
    .catch(function () { /* no contractor data yet, or offline - dropdowns just stay empty */ });
}

// ---- Builder (editable) view ----
function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

// <option> markup for a contractor <select>: a blank/"unassigned" option
// plus one per name in the global contractor list, with `selected` on the
// current value.
function contractorOptionsHtml(selectedValue) {
  var html = '<option value=""' + (!selectedValue ? " selected" : "") + '>&mdash;</option>';
  contractorsCache.forEach(function (name) {
    html += '<option value="' + escapeHtml(name) + '"' + (selectedValue === name ? " selected" : "") + '>' + escapeHtml(name) + "</option>";
  });
  return html;
}

function renderBuilder() {
  document.getElementById("addressInput").value = sow.address || "";
  document.getElementById("typeInput").value = sow.typeOfWork || "";
  document.getElementById("bufferInput").value = sow.bufferPct;
  document.getElementById("mediaInput").value = sow.mediaLink || "";
  document.getElementById("keyLocationInput").value = sow.keyLocation || "";
  document.getElementById("showKeyLocationInput").checked = sow.showKeyLocation !== false;

  renderContractorChips();
  renderContractorFilterSelect();

  var container = document.getElementById("sectionsContainer");
  container.innerHTML = "";

  sow.sections.forEach(function (section, sIdx) {
    var roomRow = document.createElement("div");
    roomRow.className = "room-row";
    roomRow.innerHTML =
      '<div class="room-name-wrap"><input type="text" class="room-name" value="' +
      escapeHtml(section.room) + '" data-s="' + sIdx + '"></div>' +
      '<div class="room-rest">' +
      '<select class="room-contractor-assign" data-s="' + sIdx + '"><option value="">Assign all to&hellip;</option>' +
      contractorsCache.map(function (name) { return '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + "</option>"; }).join("") +
      '</select>' +
      '<span class="room-subtotal" data-s="' + sIdx + '">' + currency(computeRoomSubtotal(section)) + '</span><button class="btn small no-print" data-s="' + sIdx + '" data-act="delroom">Delete room</button></div>';
    container.appendChild(roomRow);

    section.items.forEach(function (item, iIdx) {
      var row = document.createElement("div");
      row.className = "item-row" + (item.optional ? " optional" : "");
      // An unconfirmed price shows greyed out with the past job it came from
      // and an Accept button, so the number is never mistaken for one a human
      // entered. A matched job with no usable price still gets the note.
      var unconfirmedCls = isUnconfirmed(item) ? " unconfirmed" : "";
      var basisHtml = "";
      if (item.priceBasis) {
        basisHtml = '<div class="price-basis' + (isUnconfirmed(item) ? "" : " confirmed") + '">' +
          (isUnconfirmed(item)
            ? 'Guessed from: &ldquo;' + escapeHtml(item.priceBasis) + '&rdquo; <button class="accept-price" data-s="' + sIdx + '" data-i="' + iIdx + '" data-act="accept">Accept</button>'
            : 'You&rsquo;ve done this before: &ldquo;' + escapeHtml(item.priceBasis) + '&rdquo; &mdash; no price was saved for it') +
          "</div>";
      }
      var photoLinkHtml = item.photoUrl
        ? '<a class="photo-link" href="' + escapeHtml(item.photoUrl) + '" rel="noopener" title="Show the picture" data-caption="' + escapeHtml(item.text) + '">&#128247;</a>'
        : '';
      row.innerHTML =
        '<div class="c-room-blank"></div>' +
        '<div class="c-desc"><textarea rows="1" class="item-text" data-s="' + sIdx + '" data-i="' + iIdx + '">' + escapeHtml(item.text) + '</textarea>' + photoLinkHtml + basisHtml + '</div>' +
        '<div class="c-contractor"><select class="contractor-select" data-s="' + sIdx + '" data-i="' + iIdx + '">' + contractorOptionsHtml(item.contractor || "") + '</select></div>' +
        '<div class="c-labor"><input type="number" class="price' + unconfirmedCls + '" data-s="' + sIdx + '" data-i="' + iIdx + '" data-field="labor" value="' + (item.labor != null ? item.labor : "") + '" placeholder="0"></div>' +
        '<div class="c-material"><input type="number" class="price' + unconfirmedCls + '" data-s="' + sIdx + '" data-i="' + iIdx + '" data-field="material" value="' + (item.material != null ? item.material : "") + '" placeholder="0"></div>' +
        '<div class="c-opt"><input type="checkbox" data-s="' + sIdx + '" data-i="' + iIdx + '" class="optcheck" ' + (item.optional ? "checked" : "") + '></div>' +
        '<div class="c-del"><button data-s="' + sIdx + '" data-i="' + iIdx + '" data-act="delitem">&#10005;</button></div>';
      container.appendChild(row);
    });

    var addItemBtn = document.createElement("button");
    addItemBtn.className = "btn small no-print addrow-btn";
    addItemBtn.textContent = "+ Add line to " + section.room;
    addItemBtn.dataset.s = sIdx;
    addItemBtn.dataset.act = "additem";
    container.appendChild(addItemBtn);
  });

  renderQuestions();

  var mediaDisplay = document.getElementById("mediaDisplay");
  mediaDisplay.innerHTML = sow.mediaLink
    ? '<a href="' + escapeHtml(sow.mediaLink) + '" target="_blank" rel="noopener">' + escapeHtml(sow.mediaLink) + "</a>"
    : '<span style="color:#999;">none yet</span>';

  var totals = computeTotals(sow);
  var overrideInput = document.getElementById("contractorTotalOverrideInput");
  overrideInput.value = sow.contractorTotalOverride != null ? sow.contractorTotalOverride : "";
  overrideInput.placeholder = String(totals.contractorTotal);
  updateContractorVariance(totals.contractorTotal);
  document.getElementById("ownerTotalDisplay").textContent = currency(totals.ownerTotal);

  attachBuilderListeners();
  document.querySelectorAll(".item-text").forEach(autoGrow);
  pushStateToUrl();
}

// Shows how far the manual override is from the computed (line-item-sum)
// total - blank when there's no override, or the override matches exactly.
function updateContractorVariance(computedTotal) {
  var el = document.getElementById("contractorTotalVariance");
  var override = sow.contractorTotalOverride;
  if (override == null || Number(override) === computedTotal) {
    el.textContent = "";
    return;
  }
  var diff = Number(override) - computedTotal;
  var word = diff > 0 ? "above" : "below";
  el.textContent = "Override is " + currency(Math.abs(diff)) + " " + word + " the computed total of " + currency(computedTotal) + ".";
}

// Read-only display of the global contractor list - no per-SOW delete here
// (that list is shared across every SOW, so removing one is a bigger call
// than this panel is meant to make).
function renderContractorChips() {
  var wrap = document.getElementById("contractorChips");
  wrap.innerHTML = "";
  contractorsCache.forEach(function (name) {
    var chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = name;
    wrap.appendChild(chip);
  });
}

function renderContractorFilterSelect() {
  var sel = document.getElementById("contractorFilterSelect");
  var current = sel.value;
  sel.innerHTML = '<option value="">All contractors</option>';
  contractorsCache.forEach(function (name) {
    var opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
  if (contractorsCache.indexOf(current) !== -1) sel.value = current;
}

function renderQuestions() {
  var qc = document.getElementById("questionsContainer");
  qc.innerHTML = "";
  sow.questions.forEach(function (q, qIdx) {
    var row = document.createElement("div");
    row.className = "qitem-row";
    row.innerHTML =
      '<div class="c-room-blank"></div>' +
      '<div class="c-desc">' +
      '<input type="text" class="q-text" data-q="' + qIdx + '" value="' + escapeHtml(q.text) + '">' +
      '<input type="text" class="q-answer" data-q="' + qIdx + '" placeholder="Answer" value="' + escapeHtml(q.answer) + '">' +
      "</div>" +
      '<div class="c-del"><button data-q="' + qIdx + '" data-act="delquestion">&#10005;</button></div>';
    qc.appendChild(row);
  });
}

// "Accept" on a guessed price. Delegated against the container so it keeps
// working after every renderBuilder() re-render.
document.getElementById("sectionsContainer").addEventListener("click", function (e) {
  var btn = e.target.closest && e.target.closest('button[data-act="accept"]');
  if (!btn) return;
  var item = sow.sections[btn.dataset.s].items[btn.dataset.i];
  confirmPrice(item);
  // Accepting is the human decision the rate table has been waiting for, so
  // now it's worth remembering.
  var text = (item.text || "").trim();
  if (text && (item.labor != null || item.material != null)) {
    fetch("/.netlify/functions/rate-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text, labor: item.labor, material: item.material })
    }).catch(function () { /* background save - fine to silently drop */ });
  }
  renderBuilder();
});

// The camera icon on a line item shows its picture in place instead of
// navigating to CompanyCam - see sow-lightbox.js. Bound once against the
// container, so it survives every renderBuilder() re-render.
SowLightbox.bind(document.getElementById("sectionsContainer"), "a.photo-link");

function attachBuilderListeners() {
  document.getElementById("addressInput").oninput = function (e) { sow.address = e.target.value; pushStateToUrl(); };
  document.getElementById("typeInput").oninput = function (e) { sow.typeOfWork = e.target.value; pushStateToUrl(); };
  document.getElementById("bufferInput").oninput = function (e) { sow.bufferPct = e.target.value === "" ? 0 : Number(e.target.value); renderBuilder(); };
  document.getElementById("mediaInput").oninput = function (e) { sow.mediaLink = e.target.value; renderBuilder(); };
  document.getElementById("keyLocationInput").oninput = function (e) { sow.keyLocation = e.target.value; pushStateToUrl(); };
  document.getElementById("showKeyLocationInput").onchange = function (e) { sow.showKeyLocation = e.target.checked; pushStateToUrl(); };

  document.querySelectorAll(".room-name").forEach(function (el) {
    el.oninput = function (e) { sow.sections[e.target.dataset.s].room = e.target.value; pushStateToUrl(); };
  });

  document.querySelectorAll(".item-text").forEach(function (el) {
    el.oninput = function (e) {
      sow.sections[e.target.dataset.s].items[e.target.dataset.i].text = e.target.value;
      autoGrow(e.target);
      pushStateToUrl();
    };
    // On blur (done typing this line), check whether the finished text
    // exactly matches a known rate and pre-fill its price if so.
    el.onblur = function (e) {
      var item = sow.sections[e.target.dataset.s].items[e.target.dataset.i];
      if (item.labor == null && item.material == null) {
        var match = ratesCache[normalizeKey(item.text)];
        if (match) {
          if (match.labor != null) item.labor = match.labor;
          if (match.material != null) item.material = match.material;
          renderBuilder();
        }
      }
    };
  });

  document.querySelectorAll(".price").forEach(function (el) {
    el.oninput = function (e) {
      var s = e.target.dataset.s, i = e.target.dataset.i, f = e.target.dataset.field;
      var editedItem = sow.sections[s].items[i];
      editedItem[f] = e.target.value === "" ? null : Number(e.target.value);
      // Typing over a guess is how you accept it - it stops being a guess.
      if (isUnconfirmed(editedItem)) {
        confirmPrice(editedItem);
        e.target.classList.remove("unconfirmed");
        var row = e.target.closest(".item-row");
        var basisEl = row && row.querySelector(".price-basis");
        if (basisEl) basisEl.remove();
      }
      var totals = computeTotals(sow);
      document.getElementById("contractorTotalOverrideInput").placeholder = String(totals.contractorTotal);
      updateContractorVariance(totals.contractorTotal);
      document.getElementById("ownerTotalDisplay").textContent = currency(totals.ownerTotal);
      var subtotalEl = document.querySelector('.room-subtotal[data-s="' + s + '"]');
      if (subtotalEl) subtotalEl.textContent = currency(computeRoomSubtotal(sow.sections[s]));
      pushStateToUrl();
    };
    // On blur (done entering this price), remember it in the rate table -
    // "each line I enter gets stored" happens live, not just on explicit save.
    el.onblur = function (e) {
      var s = e.target.dataset.s, i = e.target.dataset.i;
      var item = sow.sections[s].items[i];
      var text = (item.text || "").trim();
      if (!text || (item.labor == null && item.material == null)) return;
      // Never teach the rate table a price no human has confirmed, or the
      // builder ends up matching future SOWs against its own guesses.
      if (isUnconfirmed(item)) return;
      fetch("/.netlify/functions/rate-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, labor: item.labor, material: item.material })
      }).then(function () {
        ratesCache[normalizeKey(text)] = { labor: item.labor, material: item.material };
      }).catch(function () { /* background save - fine to silently drop */ });
    };
  });

  document.querySelectorAll(".contractor-select").forEach(function (el) {
    el.onchange = function (e) {
      sow.sections[e.target.dataset.s].items[e.target.dataset.i].contractor = e.target.value;
      pushStateToUrl();
    };
  });

  document.querySelectorAll(".room-contractor-assign").forEach(function (el) {
    el.onchange = function (e) {
      var value = e.target.value;
      if (!value) return;
      sow.sections[e.target.dataset.s].items.forEach(function (item) { item.contractor = value; });
      renderBuilder();
    };
  });

  var overrideInput = document.getElementById("contractorTotalOverrideInput");
  overrideInput.oninput = function (e) {
    sow.contractorTotalOverride = e.target.value === "" ? null : Number(e.target.value);
    updateContractorVariance(computeTotals(sow).contractorTotal);
    pushStateToUrl();
  };

  document.querySelectorAll(".optcheck").forEach(function (el) {
    el.onchange = function (e) {
      sow.sections[e.target.dataset.s].items[e.target.dataset.i].optional = e.target.checked;
      renderBuilder();
    };
  });

  document.querySelectorAll('[data-act="delitem"]').forEach(function (el) {
    el.onclick = function (e) {
      var t = e.currentTarget;
      sow.sections[t.dataset.s].items.splice(t.dataset.i, 1);
      renderBuilder();
    };
  });

  document.querySelectorAll('[data-act="delroom"]').forEach(function (el) {
    el.onclick = function (e) {
      if (!confirm("Delete this whole room and its lines?")) return;
      sow.sections.splice(e.currentTarget.dataset.s, 1);
      renderBuilder();
    };
  });

  document.querySelectorAll('[data-act="additem"]').forEach(function (el) {
    el.onclick = function (e) {
      sow.sections[e.currentTarget.dataset.s].items.push({ text: "", labor: null, material: null, optional: false, contractor: "", photoUrl: null });
      renderBuilder();
    };
  });

  document.querySelectorAll(".q-text").forEach(function (el) {
    el.oninput = function (e) { sow.questions[e.target.dataset.q].text = e.target.value; pushStateToUrl(); };
  });
  document.querySelectorAll(".q-answer").forEach(function (el) {
    el.oninput = function (e) { sow.questions[e.target.dataset.q].answer = e.target.value; pushStateToUrl(); };
  });
  document.querySelectorAll('[data-act="delquestion"]').forEach(function (el) {
    el.onclick = function (e) {
      sow.questions.splice(e.currentTarget.dataset.q, 1);
      renderBuilder();
    };
  });
}

document.getElementById("addRoomBtn").onclick = function () {
  sow.sections.push({ room: "New Room", items: [{ text: "", labor: null, material: null, optional: false, contractor: "" }] });
  renderBuilder();
};
document.getElementById("addQuestionBtn").onclick = function () {
  sow.questions.push({ text: "", answer: "" });
  renderBuilder();
};

function addContractorFromInput() {
  var input = document.getElementById("newContractorInput");
  var name = input.value.trim();
  if (!name) return;
  if (contractorsCache.indexOf(name) !== -1) { input.value = ""; return; }
  // Optimistic: add locally right away so the dropdowns update instantly,
  // then write through to the global list for every other SOW to pick up.
  contractorsCache.push(name);
  contractorsCache.sort();
  input.value = "";
  renderBuilder();
  fetch("/.netlify/functions/contractor-save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name })
  }).catch(function () { /* background save - the name is still usable this session even if this fails */ });
}
document.getElementById("addContractorBtn").onclick = addContractorFromInput;
document.getElementById("newContractorInput").onkeydown = function (e) {
  if (e.key === "Enter") { e.preventDefault(); addContractorFromInput(); }
};

// ---- Save / load SOWs from the database ----
function refreshSowList() {
  var select = document.getElementById("loadSowSelect");
  return fetch("/.netlify/functions/sow-list")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var current = select.value;
      select.innerHTML = '<option value="">Load previous SOW&hellip;</option>';
      (data.sows || []).forEach(function (row) {
        var opt = document.createElement("option");
        opt.value = row.id;
        var d = new Date(row.updated_at);
        opt.textContent = row.address + " (" + (d.toString() !== "Invalid Date" ? d.toLocaleDateString() : "") + ")";
        select.appendChild(opt);
      });
      select.value = current;
    })
    .catch(function () { /* list unavailable - dropdown just stays empty, not fatal */ });
}

document.getElementById("saveSowBtn").onclick = function () {
  var status = document.getElementById("saveStatus");
  if (!sow.address || !sow.address.trim()) {
    status.textContent = "Enter a property address before saving.";
    status.className = "sendstatus err";
    return;
  }
  var btn = document.getElementById("saveSowBtn");
  btn.disabled = true;
  status.textContent = "Saving...";
  status.className = "sendstatus";

  fetch("/.netlify/functions/sow-save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sow: sow })
  })
    .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, status: r.status, data: data }; }); })
    .then(function (result) {
      btn.disabled = false;
      if (result.ok) {
        status.textContent = "Saved. It'll show up in “Load previous SOW”.";
        status.className = "sendstatus ok";
        refreshSowList();
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

document.getElementById("loadSowSelect").onchange = function (e) {
  var id = e.target.value;
  if (!id) return;
  if (sow.sections.length && !confirm("This will replace everything currently in the editor. Continue?")) {
    e.target.value = "";
    return;
  }
  fetch("/.netlify/functions/sow-load?id=" + encodeURIComponent(id))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.sow) throw new Error(data.error || "Not found");
      sow = data.sow;
      autofillAllFromRates();
      renderBuilder();
      e.target.value = "";
    })
    .catch(function (err) {
      alert("Couldn't load that SOW: " + err.message);
      e.target.value = "";
    });
};

// ---- Upload a SOW file (e.g. one produced by the /build-sow skill) ----
function isValidSowShape(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (!Array.isArray(obj.sections)) return false;
  if (!Array.isArray(obj.questions)) return false;
  for (var i = 0; i < obj.sections.length; i++) {
    var s = obj.sections[i];
    if (typeof s.room !== "string" || !Array.isArray(s.items)) return false;
    for (var j = 0; j < s.items.length; j++) {
      if (typeof s.items[j].text !== "string") return false;
    }
  }
  return true;
}

document.getElementById("uploadSowBtn").onclick = function () {
  document.getElementById("uploadSowInput").click();
};

document.getElementById("uploadSowInput").onchange = function (e) {
  var file = e.target.files[0];
  var status = document.getElementById("uploadStatus");
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    var parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (err) {
      status.textContent = "That file isn't valid JSON — was it exported by the SOW skill?";
      status.className = "sendstatus err";
      return;
    }
    if (!isValidSowShape(parsed)) {
      status.textContent = "That file doesn't look like a SOW export (missing rooms/items). Nothing was loaded.";
      status.className = "sendstatus err";
      return;
    }
    if (sow.sections.length && !confirm("This will replace everything currently in the editor with the uploaded file. Continue?")) {
      return;
    }
    sow = {
      address: parsed.address || "",
      typeOfWork: parsed.typeOfWork || "Pre-inspection list",
      mediaLink: parsed.mediaLink || "",
      bufferPct: parsed.bufferPct != null ? parsed.bufferPct : 20,
      contractorTotalOverride: parsed.contractorTotalOverride != null ? Number(parsed.contractorTotalOverride) : null,
      keyLocation: parsed.keyLocation || "",
      showKeyLocation: parsed.showKeyLocation !== false,
      sections: parsed.sections.map(function (s) {
        return {
          room: s.room || "",
          items: s.items.map(function (it) {
            return { text: it.text || "", labor: it.labor != null ? it.labor : null, material: it.material != null ? it.material : null, optional: !!it.optional, contractor: it.contractor || "", photoUrl: it.photoUrl || null };
          })
        };
      }),
      questions: parsed.questions.length ? parsed.questions.map(function (q) {
        return { text: q.text || "", answer: q.answer || "" };
      }) : JSON.parse(JSON.stringify(DEFAULT_SOW.questions))
    };
    autofillAllFromRates();
    status.textContent = "Loaded “" + (sow.address || "SOW") + "” — " + sow.sections.length + " rooms. Fill in prices, then download or send.";
    status.className = "sendstatus ok";
    renderBuilder();
  };
  reader.onerror = function () {
    status.textContent = "Couldn't read that file.";
    status.className = "sendstatus err";
  };
  reader.readAsText(file);
  e.target.value = "";
};

// ---- Print views (static, built fresh each time) ----
// buildPrintHtml lives in sow-shared.js - see the note there.
function downloadCopy(mode) {
  // An unconfirmed price still counts toward the total. Sending an owner an
  // estimate built partly on guesses is exactly the mistake this whole
  // greyed-out mechanism exists to prevent, so say so before it leaves.
  var pending = countUnconfirmed();
  if (pending && !confirm(pending + (pending === 1 ? " price is" : " prices are") +
      " still greyed out - guessed from past jobs and not yet accepted. They're included in the total. Download anyway?")) {
    return;
  }
  var contractorFilter = mode === "contractor" ? (document.getElementById("contractorFilterSelect").value || "") : "";
  document.getElementById("printView").innerHTML = buildPrintHtml(sow, mode, contractorFilter);
  var titleSuffix = contractorFilter ? " (" + contractorFilter + ")" : "";
  document.title = (mode === "contractor" ? "Contractor Copy" + titleSuffix + " - " : "Owner Copy - ") + (sow.address || "SOW");
  document.body.dataset.printing = mode;
  window.print();
  setTimeout(function () { delete document.body.dataset.printing; }, 300);
}

document.getElementById("downloadContractorBtn").onclick = function () { downloadCopy("contractor"); };
document.getElementById("downloadOwnerBtn").onclick = function () { downloadCopy("owner"); };

// ---- Copy owner link ----
// This used to be location.pathname + "?d=" + base64(whole SOW), which meant
// the "link" was the builder itself with every field editable, and the SOW
// was carried in the URL. Both were wrong: an owner should get a read-only
// page, and a real SOW doesn't fit in a URL (8355 Wisconsin encodes to ~24k
// characters, past what Netlify and most browsers will accept, so the link
// simply failed). So: save the SOW, then link to sow-view.html by its id.
function ownerLinkFor(id) {
  var dir = location.pathname.replace(/[^/]*$/, "");
  return location.origin + dir + "sow-view.html?id=" + encodeURIComponent(id);
}

document.getElementById("copyLinkBtn").onclick = function () {
  var btn = document.getElementById("copyLinkBtn");
  var wrap = document.getElementById("linkwrap");
  var hint = document.getElementById("linkHint");
  var out = document.getElementById("linkOut");

  if (!(sow.address || "").trim()) {
    wrap.style.display = "block";
    hint.textContent = "Add the property address first - the owner link is saved under it.";
    out.value = "";
    return;
  }

  var label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving...";

  fetch("/.netlify/functions/sow-save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sow: sow })
  })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
    .then(function (result) {
      btn.disabled = false;
      btn.textContent = label;
      if (!result.ok || !result.data.id) throw new Error(extractErrorMessage(result));

      var url = ownerLinkFor(result.data.id);
      wrap.style.display = "block";
      hint.textContent = "Owner link copied. It opens a read-only page - no prices to edit, no builder. Saving again updates what this link shows.";
      out.value = url;
      out.focus();
      out.select();
      refreshSowList();
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
      hint.textContent = "Couldn't make the link: " + err.message;
      out.value = "";
    });
};

// ---- Send to CompanyCam ----
function parseCompanyCamProjectId(url) {
  if (!url) return null;
  var m = url.match(/companycam\.com\/projects\/(\d+)/);
  return m ? m[1] : null;
}

document.getElementById("sendCCBtn").onclick = function () {
  var status = document.getElementById("sendStatus");
  var projectId = parseCompanyCamProjectId(sow.mediaLink);
  if (!projectId) {
    status.textContent = "Couldn't find a CompanyCam project ID in the Photos/Videos link above. Paste a link like https://app.companycam.com/projects/123456 first.";
    status.className = "sendstatus err";
    return;
  }
  var btn = document.getElementById("sendCCBtn");
  btn.disabled = true;
  status.textContent = "Sending...";
  status.className = "sendstatus";

  fetch("/.netlify/functions/send-to-companycam", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: projectId, sow: sow })
  })
    .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, status: r.status, data: data }; }); })
    .then(function (result) {
      btn.disabled = false;
      if (result.ok) {
        status.textContent = "Sent to CompanyCam Files.";
        status.className = "sendstatus ok";
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

renderBuilder();
refreshSowList();
loadRatesCache().then(function () {
  if (autofillAllFromRates()) renderBuilder();
});
loadContractorsCache().then(function () { renderBuilder(); });
