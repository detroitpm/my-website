// Auto-approves Home Depot Pro purchase-authorization texts on the Quo
// Maintenance line.
//
// When a contractor checks out on our Home Depot Pro account, Home Depot texts
// the Maintenance line (313) 442-7328 from +1 678-563-6058:
//
//   "Joe is at Home Depot Store #2711 with a 105.29USD order for Ellsworth.
//    Reply 1 to approve and charge your primary payment method.
//    Reply 2 to deny. ..."
//
// Quo calls this function (message.received webhook) for every text that comes
// into the Maintenance line. It replies "1" ONLY when all of these are true:
//   - the Quo webhook signature checks out (QUO_WEBHOOK_SECRET)
//   - the text came in on the Maintenance line (phoneNumberId PNBlbDKekR)
//   - it came from exactly Home Depot's number (+16785636058)
//   - it is the "... is at Home Depot Store #... Reply 1 to approve" text
//   - it is less than 10 minutes old (Home Depot's request expires quickly)
//   - nobody has already replied to Home Depot since that text came in
//   - the amount is at or under MAX_AMOUNT_USD, if that variable is set
// Every other text is ignored.
//
// Environment variables (Netlify > Site configuration > Environment variables):
//   QUO_WEBHOOK_SECRET  signing key Quo gave when the webhook was created
//   QUO_API_KEY         Quo API key (Quo > Settings > API) used to send the "1"
//   DRY_RUN             anything but "false" = log what it would do, send nothing
//   MAX_AMOUNT_USD      optional cap; bigger orders are left for a person
//
// Endpoint: https://section8pm.com/.netlify/functions/hd-auto-approve

import crypto from "node:crypto";

const QUO_API = "https://api.quo.com/v1";
const MAINTENANCE_LINE_ID = "PNBlbDKekR";
const HOME_DEPOT_NUMBER = "+16785636058";
const REPLY = "1";
const MAX_AGE_MS = 10 * 60 * 1000;
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

// "<name> is at Home Depot Store #2711 with a 105.29USD order for Ellsworth. ... Reply 1 to approve"
const CONFIRM_PATTERN =
  /\bis at Home Depot Store #(\d+) with a ([\d,]+(?:\.\d+)?)\s*USD order for ([\s\S]*?)\.\s*[\r\n][\s\S]*?\bReply 1 to approve\b/i;

const env = (name) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(name)) || process.env[name] || "";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function hmacBase64(key, data) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest("base64");
}

function compactJson(raw) {
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return null;
  }
}

function freshEnough(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n)) return false;
  const ms = n > 1e12 ? n : n * 1000; // Quo's legacy header is in ms, Standard Webhooks in s
  return Math.abs(Date.now() - ms) <= SIGNATURE_TOLERANCE_MS;
}

// Quo signs webhooks one of two ways depending on how the webhook was created:
//  - legacy:  "openphone-signature: hmac;1;<timestamp>;<base64 sig>",
//             HMAC-SHA256(base64decode(key), "<timestamp>.<body>")
//  - current: Standard Webhooks headers webhook-id / webhook-timestamp /
//             webhook-signature ("v1,<base64 sig> ..."),
//             HMAC-SHA256(base64decode(secret without "whsec_"), "<id>.<timestamp>.<body>")
function verifySignature(req, rawBody, secret) {
  if (!secret) return { ok: false, why: "QUO_WEBHOOK_SECRET not set" };
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const bodies = [rawBody];
  const compact = compactJson(rawBody);
  if (compact && compact !== rawBody) bodies.push(compact);

  const legacy = req.headers.get("openphone-signature") || req.headers.get("quo-signature");
  if (legacy) {
    const [scheme, version, timestamp, signature] = legacy.split(";");
    if (scheme !== "hmac" || version !== "1" || !timestamp || !signature) {
      return { ok: false, why: "malformed signature header" };
    }
    if (!freshEnough(timestamp)) return { ok: false, why: "stale signature timestamp" };
    for (const body of bodies) {
      if (safeEqual(hmacBase64(key, `${timestamp}.${body}`), signature)) return { ok: true };
    }
    return { ok: false, why: "signature mismatch" };
  }

  const id = req.headers.get("webhook-id");
  const timestamp = req.headers.get("webhook-timestamp");
  const sigHeader = req.headers.get("webhook-signature");
  if (id && timestamp && sigHeader) {
    if (!freshEnough(timestamp)) return { ok: false, why: "stale signature timestamp" };
    const given = sigHeader
      .split(" ")
      .map((s) => s.split(",")[1])
      .filter(Boolean);
    for (const body of bodies) {
      const expected = hmacBase64(key, `${id}.${timestamp}.${body}`);
      if (given.some((g) => safeEqual(expected, g))) return { ok: true };
    }
    return { ok: false, why: "signature mismatch" };
  }

  return { ok: false, why: "no signature header" };
}

// Decide from the webhook payload alone whether this is a Home Depot approval request.
export function classify(payload, maxAmount) {
  if (payload?.type !== "message.received") return { act: false, why: `event ${payload?.type}` };
  const msg = payload?.data?.object || {};
  if (msg.phoneNumberId !== MAINTENANCE_LINE_ID) return { act: false, why: "not the Maintenance line" };
  if (msg.direction && msg.direction !== "incoming") return { act: false, why: "not incoming" };
  if (msg.from !== HOME_DEPOT_NUMBER) return { act: false, why: "not from Home Depot" };
  const text = String(msg.body ?? msg.text ?? "");
  const m = text.match(CONFIRM_PATTERN);
  if (!m) return { act: false, why: "Home Depot text but not an approval request" };
  const amount = Number(m[2].replace(/,/g, ""));
  const order = { store: m[1], amount, jobName: m[3].trim(), messageId: msg.id, createdAt: msg.createdAt };
  if (maxAmount > 0 && amount > maxAmount) {
    return { act: false, why: `amount ${amount} over MAX_AMOUNT_USD ${maxAmount}`, order };
  }
  if (msg.createdAt && Date.now() - Date.parse(msg.createdAt) > MAX_AGE_MS) {
    return { act: false, why: "approval request is older than 10 minutes", order };
  }
  return { act: true, why: "Home Depot approval request", order };
}

// True if someone (a person or an earlier delivery of this webhook) already
// texted Home Depot after this approval request arrived.
async function alreadyAnswered(apiKey, since) {
  const url =
    `${QUO_API}/messages?phoneNumberId=${MAINTENANCE_LINE_ID}` +
    `&participants[]=${encodeURIComponent(HOME_DEPOT_NUMBER)}&maxResults=5`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) throw new Error(`Quo messages lookup ${res.status}`);
  const { data = [] } = await res.json();
  const sinceMs = Date.parse(since || 0) || 0;
  return data.some((m) => m.direction === "outgoing" && Date.parse(m.createdAt) >= sinceMs);
}

async function sendReply(apiKey) {
  const res = await fetch(`${QUO_API}/messages`, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ content: REPLY, from: MAINTENANCE_LINE_ID, to: [HOME_DEPOT_NUMBER] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Quo send ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body?.data?.id;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const rawBody = await req.text();
  const sig = verifySignature(req, rawBody, env("QUO_WEBHOOK_SECRET"));
  if (!sig.ok) {
    console.log("hd-auto-approve: rejected,", sig.why);
    return json(401, { error: "invalid signature" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "invalid JSON" });
  }

  const apiKey = env("QUO_API_KEY");
  const dryRun = env("DRY_RUN").toLowerCase() !== "false" || !apiKey;
  const decision = classify(payload, Number(env("MAX_AMOUNT_USD")) || 0);

  if (!decision.act) {
    if (decision.order) console.log("hd-auto-approve: skipped,", decision.why, JSON.stringify(decision.order));
    return json(200, { action: "ignored", reason: decision.why, order: decision.order });
  }

  try {
    if (apiKey && (await alreadyAnswered(apiKey, decision.order.createdAt))) {
      console.log("hd-auto-approve: already answered", JSON.stringify(decision.order));
      return json(200, { action: "ignored", reason: "already answered", order: decision.order });
    }
    if (dryRun) {
      console.log("hd-auto-approve: DRY RUN, would reply", REPLY, JSON.stringify(decision.order));
      return json(200, { action: "would_reply", reply: REPLY, dryRun: true, order: decision.order });
    }
    const sentId = await sendReply(apiKey);
    console.log("hd-auto-approve: replied", REPLY, sentId, JSON.stringify(decision.order));
    return json(200, { action: "replied", reply: REPLY, messageId: sentId, order: decision.order });
  } catch (err) {
    console.log("hd-auto-approve: error", err.message, JSON.stringify(decision.order));
    // 200 so Quo does not retry a request that is about to expire anyway.
    return json(200, { action: "error", error: err.message, order: decision.order });
  }
};
