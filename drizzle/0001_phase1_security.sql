ALTER TABLE access_keys ADD COLUMN activated_at text;
--> statement-breakpoint
ALTER TABLE free_trials ADD COLUMN scope text NOT NULL DEFAULT 'decouverte';
--> statement-breakpoint
ALTER TABLE free_trials ADD COLUMN email_sent_at text;
--> statement-breakpoint
UPDATE free_trials SET email_sent_at = created_at;
--> statement-breakpoint
ALTER TABLE free_trials DROP CONSTRAINT IF EXISTS free_trials_email_unique;
--> statement-breakpoint
UPDATE free_trials SET email = lower(btrim(email));
--> statement-breakpoint
WITH ranked AS (
  SELECT id, key_code, row_number() OVER (
    PARTITION BY scope, lower(btrim(email))
    ORDER BY created_at ASC, id ASC
  ) AS rn
  FROM free_trials
)
UPDATE access_keys SET is_active = false
WHERE code IN (SELECT key_code FROM ranked WHERE rn > 1);
--> statement-breakpoint
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY scope, lower(btrim(email))
    ORDER BY created_at ASC, id ASC
  ) AS rn
  FROM free_trials
)
DELETE FROM free_trials
USING ranked
WHERE free_trials.id = ranked.id AND ranked.rn > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX free_trials_scope_email_unique ON free_trials (scope, lower(btrim(email)));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS documents_key_code_idx ON documents (key_code);
--> statement-breakpoint
CREATE FUNCTION prevent_access_key_expiry_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'Access key expiration is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER access_keys_immutable_expiry BEFORE UPDATE ON access_keys
FOR EACH ROW EXECUTE FUNCTION prevent_access_key_expiry_change();
