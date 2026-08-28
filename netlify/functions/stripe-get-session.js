// Read-only lookup the success page calls (with the session_id Stripe put
// in the redirect URL) to decide what to show the customer: a paid
// confirmation, or a "we're waiting on your bank" message for ACH payments
// that haven't cleared yet. Never writes - the webhook is the only writer,
// since it's the only thing guaranteed to run for async (ACH) payments.
const { getStripe } = require("../../stripe-shared.js");
const { getPool } = require("../../db.js");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const sessionId = (event.queryStringParameters || {}).session_id;
  if (!sessionId) {
    return { statusCode: 400, body: JSON.stringify({ error: "session_id is required" }) };
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const pool = getPool();
    const result = await pool.query(
      `SELECT name, preferred_date, preferred_time, status, amount_cents
       FROM walkthrough_requests WHERE stripe_session_id = $1`,
      [sessionId]
    );
    const row = result.rows[0] || {};

    return {
      statusCode: 200,
      body: JSON.stringify({
        paymentStatus: session.payment_status,
        status: row.status || null,
        name: row.name || null,
        preferredDate: row.preferred_date || null,
        preferredTime: row.preferred_time || null,
        amountCents: row.amount_cents || null
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
