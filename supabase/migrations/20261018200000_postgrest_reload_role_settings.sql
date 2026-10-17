-- PostgREST caches per-role settings (statement_timeout, ...) when it loads its config and does not see
-- `alter role` as a schema change. 20261018190000 raised service_role's statement_timeout to 120s, but the
-- content import (Publish content run 38927028007) still died with 57014 after ~25 s, i.e. under the old limit.
-- Ask PostgREST to reload its config and schema cache; the notifications are delivered when this transaction commits.
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
