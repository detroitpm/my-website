// Shared Stripe client for the walkthrough booking functions. A
// module-level singleton, same pattern as db.js's pool - avoids
// re-constructing the client on every invocation in a warm Lambda container.
const Stripe = require("stripe");

let stripeClient;
function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

module.exports = { getStripe };
