-- Per-report toggle: when on, the printed pre-purchase report and the buyer
-- page (ppr-view.html) show each line's Labor/Material $ instead of only the
-- flag subtotals and grand total. Off by default, matching the existing
-- "prices are internal" behavior. Same idea as sows.show_itemized_pricing.
ALTER TABLE underwriting_reports ADD COLUMN show_itemized_pricing BOOLEAN NOT NULL DEFAULT false;
