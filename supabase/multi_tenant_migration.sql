-- ============================================================
-- Zaans Licht — Multi-tenant migratie
-- Uitvoeren in Supabase SQL Editor (één keer)
-- ============================================================


-- ── STAP 1: Kolommen toevoegen aan bestaande tabellen ──────────────────────

-- tournaments: eigenaar + logo
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS logo_url text;

-- referees: geblokkeerde rondes
ALTER TABLE referees
  ADD COLUMN IF NOT EXISTS blocked_rounds integer[];


-- ── STAP 2: Nieuwe tabellen ───────────────────────────────────────────────

-- Admin profielen
CREATE TABLE IF NOT EXISTS admin_profiles (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text        NOT NULL,
  name          text        NOT NULL,
  is_superadmin boolean     NOT NULL DEFAULT false,
  is_active     boolean     NOT NULL DEFAULT true,
  expires_at    timestamptz,
  features      jsonb       NOT NULL DEFAULT '{}',
  created_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now()
);

-- Uitnodigingen
CREATE TABLE IF NOT EXISTS invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  email       text        NOT NULL,
  name        text,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at     timestamptz,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at  timestamptz DEFAULT now()
);


-- ── STAP 3: SECURITY DEFINER functies ────────────────────────────────────

-- Helper: is de huidige ingelogde gebruiker superadmin?
-- Gebruikt SECURITY DEFINER zodat RLS-policies hem veilig kunnen aanroepen
-- zonder een oneindige lus.
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE user_id = auth.uid()
      AND is_superadmin = true
      AND is_active = true
  );
END;
$$;

-- Uitnodiging accepteren: maakt admin_profile aan voor de ingelogde gebruiker.
-- Wordt aangeroepen vanuit de browser net na auth.signUp().
CREATE OR REPLACE FUNCTION claim_invitation(p_token text, p_name text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite invitations%ROWTYPE;
BEGIN
  -- Haal uitnodiging op en valideer
  SELECT * INTO v_invite FROM invitations WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Uitnodiging niet gevonden');
  END IF;
  IF v_invite.used_at IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Uitnodiging al gebruikt');
  END IF;
  IF v_invite.expires_at < now() THEN
    RETURN json_build_object('success', false, 'error', 'Uitnodiging verlopen');
  END IF;

  -- Maak admin profiel aan voor de huidige ingelogde gebruiker
  INSERT INTO admin_profiles (user_id, email, name, is_superadmin, is_active, created_by)
  VALUES (
    auth.uid(),
    v_invite.email,
    p_name,
    false,        -- nooit superadmin via uitnodiging
    true,
    v_invite.created_by
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Markeer uitnodiging als gebruikt
  UPDATE invitations SET used_at = now() WHERE token = p_token;

  RETURN json_build_object('success', true);
END;
$$;


-- ── STAP 4: Row Level Security ────────────────────────────────────────────

-- admin_profiles
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmin alle profielen" ON admin_profiles;
DROP POLICY IF EXISTS "Eigen profiel lezen"       ON admin_profiles;

-- Superadmin kan alles zien en aanpassen
CREATE POLICY "Superadmin alle profielen" ON admin_profiles
  FOR ALL USING (is_superadmin());

-- Iedere admin kan zijn eigen profiel lezen (voor login-check)
CREATE POLICY "Eigen profiel lezen" ON admin_profiles
  FOR SELECT USING (user_id = auth.uid());

-- invitations
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmin alle uitnodigingen" ON invitations;

CREATE POLICY "Superadmin alle uitnodigingen" ON invitations
  FOR ALL USING (is_superadmin());

-- tournaments: vervang de brede "alle authenticated users" door eigenaar-filter
DROP POLICY IF EXISTS "Admin all tournaments" ON tournaments;

CREATE POLICY "Eigenaar beheert toernooi" ON tournaments
  FOR ALL USING (owner_id = auth.uid() OR is_superadmin());


-- ── STAP 5: Bootstrap ─────────────────────────────────────────────────────
-- Maak jou de eerste superadmin en koppel bestaande toernooien aan jou.
--
-- Zoek eerst je user ID:
--   SELECT id, email FROM auth.users;
--
-- Vervang dan JOUW_EMAIL_ADRES hieronder (bijv. 'andreas@zaanslicht.nl')
-- en voer dit blok uit.

INSERT INTO admin_profiles (user_id, email, name, is_superadmin, is_active)
SELECT
  id,
  email,
  'Andreas',
  true,
  true
FROM auth.users
WHERE email = 'JOUW_EMAIL_ADRES'
ON CONFLICT (user_id) DO NOTHING;

-- Koppel alle toernooien zonder eigenaar aan jou
UPDATE tournaments
SET owner_id = (
  SELECT id FROM auth.users WHERE email = 'JOUW_EMAIL_ADRES'
)
WHERE owner_id IS NULL;
