-- Switches walkthrough_requests from PayPal to Stripe fields. Payment
-- processor changed before this table had any real bookings in it, so this
-- is a rename rather than a parallel column addition.
ALTER TABLE walkthrough_requests RENAME COLUMN paypal_order_id TO stripe_session_id;
ALTER TABLE walkthrough_requests RENAME COLUMN paypal_capture_id TO stripe_payment_intent_id;
