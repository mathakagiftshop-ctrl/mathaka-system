-- Store share tokens themselves (not hashes) so the same link can be copied
-- and re-sent on WhatsApp. Links are revoked by clearing the token.
alter table documents rename column share_token_hash to share_token;
alter table partner_jobs rename column share_token_hash to share_token;
alter table orders rename column gallery_token_hash to gallery_token;
