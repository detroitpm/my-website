// Source of truth for marking a booking paid. Card payments confirm
// instantly (checkout.session.completed with payment_status 'paid'), but
// ACH direct debit settles days later - Stripe fires
// checkout.session.completed immediately for ACH too, but payment_status
// stays 'unpaid' until the bank debit clears, at which point
// checkout.session.async_payment_succeeded fires. Handling both here (vs.
// only confirming on the customer's return to the success page) is what
// makes ACH actually work, since the customer is long gone by the time an
// ACH payment clears.
const { getStripe } = require("../../stripe-shared.js");
const { getPool } = require("../../db.js");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const stripe = getStripe();
  const signature = event.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, signature, webhookSecret);
  } catch (err) {
    return { statusCode: 400, body: `Webhook signature verification failed: ${err.message}` };
  }

  try {
    const pool = getPool();

    if (
      stripeEvent.type === "checkout.session.completed" ||
      stripeEvent.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = stripeEvent.data.object;
      if (session.payment_status === "paid") {
        const result = await pool.query(
          `UPDATE walkthrough_requests
           SET status = 'paid', stripe_payment_intent_id = $2, paid_at = NOW()
           WHERE stripe_session_id = $1 AND status != 'paid'
           RETURNING name, email, phone, address, preferred_date, preferred_time, sewer_camera, notes, amount_cents`,
          [session.id, session.payment_intent]
        );

        const booking = result.rows[0];
        if (booking) {
          try {
            await fetch("https://formspree.io/f/mjkjkwlk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                _subject: "PAID: New Pre-Purchase Walkthrough Booking",
                name: booking.name,
                email: booking.email,
                phone: booking.phone,
                address: booking.address,
                preferred_date: booking.preferred_date || "(none given)",
                preferred_time: booking.preferred_time || "(none given)",
                sewer_camera_addon: booking.sewer_camera ? "Yes" : "No",
                notes: booking.notes || "(none)",
                amount_paid: `$${(booking.amount_cents / 100).toFixed(2)}`
              })
            });
          } catch (notifyErr) {
            // Booking already saved and paid - don't fail the webhook over a
            // notification email hiccup (Stripe would just retry it).
          }
        }
      }
    } else if (stripeEvent.type === "checkout.session.async_payment_failed") {
      const session = stripeEvent.data.object;
      await pool.query(
        `UPDATE walkthrough_requests SET status = 'failed' WHERE stripe_session_id = $1`,
        [session.id]
      );
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
