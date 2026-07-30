// Scope of Work Builder — vanilla JS, no build step, no backend except the
// one CompanyCam upload function. State lives entirely in the page's own URL
// (same trick as owner-faq.html's link-copy feature), so there is no database.

var DEFAULT_SOW = {
  address: "",
  typeOfWork: "Pre-inspection list",
  mediaLink: "",
  bufferPct: 20,
  sections: [],
  questions: []
};

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

// ---- Totals ----
function computeRoomSubtotal(section) {
  var subtotal = 0;
  section.items.forEach(function (item) {
    if (item.optional) return;
    subtotal += (Number(item.labor) || 0) + (Number(item.material) || 0);
  });
  return subtotal;
}

function computeTotals() {
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

// ---- Builder (editable) view ----
function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function renderBuilder() {
  document.getElementById("addressInput").value = sow.address || "";
  document.getElementById("typeInput").value = sow.typeOfWork || "";
  document.getElementById("bufferInput").value = sow.bufferPct;
  document.getElementById("mediaInput").value = sow.mediaLink || "";

  var container = document.getElementById("sectionsContainer");
  container.innerHTML = "";

  sow.sections.forEach(function (section, sIdx) {
    var roomRow = document.createElement("div");
    roomRow.className = "room-row";
    roomRow.innerHTML =
      '<div class="room-name-wrap"><input type="text" class="room-name" value="' +
      escapeHtml(section.room) + '" data-s="' + sIdx + '"></div>' +
      '<div class="room-rest"><span class="room-subtotal" data-s="' + sIdx + '">' + currency(computeRoomSubtotal(section)) + '</span><button class="btn small no-print" data-s="' + sIdx + '" data-act="delroom">Delete room</button></div>';
    container.appendChild(roomRow);

    section.items.forEach(function (item, iIdx) {
      var row = document.createElement("div");
      row.className = "item-row" + (item.optional ? " optional" : "");
      row.innerHTML =
        '<div class="c-room-blank"></div>' +
        '<div class="c-desc"><textarea rows="1" class="item-text" data-s="' + sIdx + '" data-i="' + iIdx + '">' + escapeHtml(item.text) + '</textarea></div>' +
        '<div class="c-labor"><input type="number" class="price" data-s="' + sIdx + '" data-i="' + iIdx + '" data-field="labor" value="' + (item.labor != null ? item.labor : "") + '" placeholder="0"></div>' +
        '<div class="c-material"><input type="number" class="price" data-s="' + sIdx + '" data-i="' + iIdx + '" data-field="material" value="' + (item.material != null ? item.material : "") + '" placeholder="0"></div>' +
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

  var totals = computeTotals();
  document.getElementById("contractorTotalDisplay").textContent = currency(totals.contractorTotal);
  document.getElementById("ownerTotalDisplay").textContent = currency(totals.ownerTotal);

  attachBuilderListeners();
  document.querySelectorAll(".item-text").forEach(autoGrow);
  pushStateToUrl();
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

function attachBuilderListeners() {
  document.getElementById("addressInput").oninput = function (e) { sow.address = e.target.value; pushStateToUrl(); };
  document.getElementById("typeInput").oninput = function (e) { sow.typeOfWork = e.target.value; pushStateToUrl(); };
  document.getElementById("bufferInput").oninput = function (e) { sow.bufferPct = e.target.value === "" ? 0 : Number(e.target.value); renderBuilder(); };
  document.getElementById("mediaInput").oninput = function (e) { sow.mediaLink = e.target.value; renderBuilder(); };

  document.querySelectorAll(".room-name").forEach(function (el) {
    el.oninput = function (e) { sow.sections[e.target.dataset.s].room = e.target.value; pushStateToUrl(); };
  });

  document.querySelectorAll(".item-text").forEach(function (el) {
    el.oninput = function (e) {
      sow.sections[e.target.dataset.s].items[e.target.dataset.i].text = e.target.value;
      autoGrow(e.target);
      pushStateToUrl();
    };
  });

  document.querySelectorAll(".price").forEach(function (el) {
    el.oninput = function (e) {
      var s = e.target.dataset.s, i = e.target.dataset.i, f = e.target.dataset.field;
      sow.sections[s].items[i][f] = e.target.value === "" ? null : Number(e.target.value);
      var totals = computeTotals();
      document.getElementById("contractorTotalDisplay").textContent = currency(totals.contractorTotal);
      document.getElementById("ownerTotalDisplay").textContent = currency(totals.ownerTotal);
      var subtotalEl = document.querySelector('.room-subtotal[data-s="' + s + '"]');
      if (subtotalEl) subtotalEl.textContent = currency(computeRoomSubtotal(sow.sections[s]));
      pushStateToUrl();
    };
  });

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
      sow.sections[e.currentTarget.dataset.s].items.push({ text: "", labor: null, material: null, optional: false });
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
  sow.sections.push({ room: "New Room", items: [{ text: "", labor: null, material: null, optional: false }] });
  renderBuilder();
};
document.getElementById("addQuestionBtn").onclick = function () {
  sow.questions.push({ text: "", answer: "" });
  renderBuilder();
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
      sections: parsed.sections.map(function (s) {
        return {
          room: s.room || "",
          items: s.items.map(function (it) {
            return { text: it.text || "", labor: it.labor != null ? it.labor : null, material: it.material != null ? it.material : null, optional: !!it.optional };
          })
        };
      }),
      questions: parsed.questions.length ? parsed.questions.map(function (q) {
        return { text: q.text || "", answer: q.answer || "" };
      }) : JSON.parse(JSON.stringify(DEFAULT_SOW.questions))
    };
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
// NOTE: the room/item grid below is a real <table> (thead/tbody/tr/td), not
// styled divs. Third-party tools that turn an uploaded PDF into a checklist
// (e.g. CompanyCam) read the PDF's tagged table structure to find rows to
// convert - a div-based "fake table" prints visually the same but carries no
// real table tags, so it comes through as one untagged block of text instead
// of individual checkable lines. Keep this a genuine <table> for that reason.
function buildPrintHtml(mode) {
  var total = computeTotals();
  var html = "";
  html += '<div class="pv-header">Scope of Work' + (mode === "contractor" ? " &mdash; Contractor Copy" : " &mdash; Owner Copy") + ": " + escapeHtml(sow.address || "(address not set)") + "</div>";
  html += '<div class="pv-sub">' + escapeHtml(sow.typeOfWork || "") + "</div>";
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

  var qItems = sow.questions.filter(function (q) { return (q.text || "").trim() !== ""; });
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
  return html;
}

function downloadCopy(mode) {
  document.getElementById("printView").innerHTML = buildPrintHtml(mode);
  document.title = (mode === "contractor" ? "Contractor Copy - " : "Owner Copy - ") + (sow.address || "SOW");
  document.body.dataset.printing = mode;
  window.print();
  setTimeout(function () { delete document.body.dataset.printing; }, 300);
}

document.getElementById("downloadContractorBtn").onclick = function () { downloadCopy("contractor"); };
document.getElementById("downloadOwnerBtn").onclick = function () { downloadCopy("owner"); };

// ---- Copy link ----
document.getElementById("copyLinkBtn").onclick = function () {
  var url = currentUrlWithState();
  var wrap = document.getElementById("linkwrap");
  var out = document.getElementById("linkOut");
  out.value = url;
  wrap.style.display = "block";
  out.focus();
  out.select();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () {
      var btn = document.getElementById("copyLinkBtn");
      var t = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(function () { btn.textContent = t; }, 1600);
    }, function () {});
  }
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
    .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
    .then(function (result) {
      btn.disabled = false;
      if (result.ok) {
        status.textContent = "Sent to CompanyCam Files.";
        status.className = "sendstatus ok";
      } else {
        status.textContent = "Failed: " + (result.data && result.data.error ? result.data.error : "unknown error");
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
