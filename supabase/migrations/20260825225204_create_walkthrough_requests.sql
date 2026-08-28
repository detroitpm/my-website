-- Pre-purchase walkthrough bookings from pre-purchase-walkthrough.html.
-- One row per PayPal order: created as 'pending' when the customer starts
-- checkout, flipped to 'paid' by the capture function once PayPal confirms
-- the charge. Rows that stay 'pending' are abandoned checkouts.
CREATE TABLE walkthrough_requests (
  id SERIAL PRIMARY KEY,
  paypal_order_id TEXT UNIQUE NOT NULL,
  paypal_capture_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  preferred_date TEXT,
  preferred_time TEXT,
  sewer_camera BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  amount_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX walkthrough_requests_status_idx ON walkthrough_requests (status);
CREATE INDEX walkthrough_requests_created_at_idx ON walkthrough_requests (created_at DESC);
