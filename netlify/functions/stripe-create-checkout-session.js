// Creates a Stripe Checkout session for a pre-purchase walkthrough booking
// and records it as 'pending' before payment happens, so an abandoned
// checkout still leaves a trace. The price is computed here from the add-on
// boolean, never trusted from the client, so a tampered request body can't
// discount the order. Payment method types are intentionally left
// unspecified so Stripe shows whatever's enabled in the Dashboard (card,
// US bank account/ACH, Cash App, etc.) without a code change on our end.
const { getStripe } = require("../../stripe-shared.js");
const { getPool } = require("../../db.js");

const BASE_PRICE = 400;
const ADDON_PRICE = 100;

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const name = (payload.name || "").trim();
  const email = (payload.email || "").trim();
  const phone = (payload.phone || "").trim();
  const address = (payload.address || "").trim();
  const preferredDate = (payload.preferredDate || "").trim();
  const preferredTime = (payload.preferredTime || "").trim();
  const notes = (payload.notes || "").trim();
  const sewerCamera = !!payload.sewerCamera;

  if (!name || !email || !phone || !address) {
    return { statusCode: 400, body: JSON.stringify({ error: "name, email, phone, and address are required" }) };
  }

  const amount = BASE_PRICE + (sewerCamera ? ADDON_PRICE : 0);
  const description = [
    "Section 8 Pre-Purchase Walkthrough",
    sewerCamera ? "Sewer Camera Add-on" : null
  ].filter(Boolean).join(" + ");

  try {
    const stripe = getStripe();
    const origin = `https://${event.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: description },
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }
      ],
      customer_email: email,
      success_url: `${origin}/pre-purchase-walkthrough.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pre-purchase-walkthrough.html#request`
    });

    const pool = getPool();
    await pool.query(
      `INSERT INTO walkthrough_requests
        (stripe_session_id, name, email, phone, address, preferred_date, preferred_time, sewer_camera, notes, amount_cents, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')`,
      [session.id, name, email, phone, address, preferredDate || null, preferredTime || null, sewerCamera, notes || null, Math.round(amount * 100)]
    );

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
