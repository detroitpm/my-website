#!/usr/bin/env node
// Sorts a SOW's line items into "already priced from history" and "needs a
// judgement call", for the pricing step of the /build-sow skill.
//
// The point is to keep Claude OUT of the lines the builder can price on its
// own. A price you actually charged beats an estimate every time, so this
// runs the exact same bestRateMatch() the builder runs - imported from
// sow-shared.js, not reimplemented - and only reports what it couldn't cover.
//
// For those, it lists the nearest past jobs anyway (below the match
// threshold, so not safe to auto-fill) as anchors to reason from. Suggesting
// $150 because three similar jobs went for $125-$175 is defensible;
// suggesting it from nothing is not.
//
//   node tools/sow-price-check.js sow-files/sow-123-example-st.json

const fs = require("fs");
const { bestRateMatch, matchTokens, usablePrice } = require("../sow-shared.js");

const RATES_URL = "https://section8pm.com/.netlify/functions/rates-list";
const ANCHOR_COUNT = 5;

// Anchors are NOT matches, and they use a looser test on purpose.
// bestRateMatch() insists the verb agrees, because it fills prices in
// automatically and must not confuse "replace a door" with "repair a
// doorknob". Anchors are only ever read by a human deciding a price, so
// "Repair the soffit" is allowed to surface "Replace fascia board" as
// context - related work, different verb. Under the strict test 28 of 73
// unpriced lines had nothing at all to reason from; this drops that to a
// handful.
function anchorScore(a, b) {
  const ta = matchTokens(a), tb = matchTokens(b);
  if (!ta.length || !tb.length) return 0;
  const sa = new Set(ta), sb = new Set(tb);
  let inter = 0;
  sa.forEach(function (w) { if (sb.has(w)) inter++; });
  const union = new Set([].concat(ta, tb)).size;
  return union ? inter / union : 0;
}

// What their pricing generally looks like, so a line with no anchor at all
// can still be reasoned about ("small repairs here cluster at $25") instead
// of guessed from nothing.
function priceLandscape(rates) {
  const labor = [], material = [];
  rates.forEach(function (r) {
    const l = usablePrice(r.labor), m = usablePrice(r.material);
    if (l != null) labor.push(l);
    if (m != null) material.push(m);
  });
  const stats = function (xs) {
    if (!xs.length) return null;
    const s = xs.slice().sort(function (a, b) { return a - b; });
    const counts = {};
    s.forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
    const common = Object.keys(counts)
      .sort(function (a, b) { return counts[b] - counts[a]; })
      .slice(0, 5)
      .map(function (v) { return { price: Number(v), timesUsed: counts[v] }; });
    return { count: s.length, min: s[0], median: s[Math.floor(s.length / 2)], max: s[s.length - 1], mostCommon: common };
  };
  return { labor: stats(labor), material: stats(material) };
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node tools/sow-price-check.js <sow-file.json>");
    process.exit(1);
  }
  const sow = JSON.parse(fs.readFileSync(file, "utf8"));

  const resp = await fetch(RATES_URL);
  if (!resp.ok) throw new Error(`rates-list responded ${resp.status}`);
  const rates = (await resp.json()).rates || [];

  const covered = [];
  const needsSuggestion = [];

  (sow.sections || []).forEach(function (section) {
    (section.items || []).forEach(function (item) {
      const text = (item.text || "").trim();
      if (!text) return;
      const m = bestRateMatch(text, rates);

      // A match with a real price is the builder's job, not Claude's.
      if (m && (m.labor != null || m.material != null)) {
        covered.push({ room: section.room, text: text, labor: m.labor, material: m.material,
                       basis: m.rate.taskText, score: Number(m.score.toFixed(2)) });
        return;
      }

      // Either nothing matched, or the match had only $0s. Either way Claude
      // has to decide - so hand over the nearest past jobs as anchors.
      const anchors = rates
        .map(function (r) {
          return { text: r.taskText, labor: usablePrice(r.labor), material: usablePrice(r.material),
                   score: Number(anchorScore(text, r.taskText).toFixed(2)) };
        })
        .filter(function (a) { return a.score > 0 && (a.labor != null || a.material != null); })
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, ANCHOR_COUNT);

      needsSuggestion.push({
        room: section.room, text: text,
        matchedButUnpriced: m ? m.rate.taskText : null,
        anchors: anchors
      });
    });
  });

  const total = covered.length + needsSuggestion.length;
  console.log(JSON.stringify({
    summary: { total: total, pricedFromHistory: covered.length, needsSuggestion: needsSuggestion.length },
    priceLandscape: priceLandscape(rates),
    covered: covered,
    needsSuggestion: needsSuggestion
  }, null, 2));
}

main().catch(function (e) { console.error(e.message); process.exit(1); });
