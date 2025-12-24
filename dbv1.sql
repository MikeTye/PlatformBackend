CREATE TABLE user_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name           text,
  location            text,
  carbon_generated    numeric(20,6) DEFAULT 0,
  carbon_sold         numeric(20,6) DEFAULT 0,
  personal_website    text,
  linkedin_url        text,
  phone_number        text,
  bio                 text,
  qr_code_url         text,
  expertise_tags      text[] DEFAULT '{}', -- area of expertise (simple, indexable)
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  delete_flag         boolean NOT NULL DEFAULT false
);

CREATE INDEX ON user_profiles USING GIN (expertise_tags);

-- ───────────────────────── ENUMS ─────────────────────────
DO $$ BEGIN
  CREATE TYPE project_type_enum AS ENUM (
    'Afforestation', 'Reforestation', 'RenewableEnergy', 'EnergyEfficiency',
    'BlueCarbon','WasteManagement','MethaneReduction','Cookstoves','Other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pdd_status_enum AS ENUM ('NotStarted','InProgress','Submitted','Approved','Rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_status_enum AS ENUM ('NotApplicable','Planned','InProgress','Completed','IssuesFound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE project_status_enum AS ENUM ('Planned','Active','Paused','Completed','Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE credit_event_enum AS ENUM ('ISSUED','OFFTAKE','RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE verification_type_enum AS ENUM ('LandOwner','ProjectOwner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────────────────── COMPANIES (BUSINESSES) ─────────────────────────
CREATE TABLE companies (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name              text NOT NULL,
  function_description    text,           -- Business Function
  geographical_coverage   text[] DEFAULT '{}',  -- ISO country codes or regions
  company_email           text,
  website_url             text,
  phone_number            text,
  registration_url        text,           -- Business Registration Link
  employees_count         integer,        -- Business Employees (count)
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  delete_flag             boolean NOT NULL DEFAULT false
);

CREATE INDEX ON companies ((lower(legal_name)));
CREATE INDEX ON companies USING GIN (geographical_coverage);

-- Company registration documents
CREATE TABLE company_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title           text NOT NULL,
  asset_url       text NOT NULL,          -- storage URL (S3/GCS)
  content_type    text,
  sha256          text,
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Company media (logos, photos, etc.)
CREATE TABLE company_media (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind            text,                   -- image, video, doc
  asset_url       text NOT NULL,
  content_type    text,
  sha256          text,
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Company ↔ frequent partners (company-to-company)
CREATE TABLE company_partners (
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  relationship    text,                   -- optional label
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, partner_id),
  CHECK (company_id <> partner_id)
);

-- Optional: link company employees to user accounts (directory)
CREATE TABLE company_users (
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_title      text,
  PRIMARY KEY (company_id, user_id)
);

-- ───────────────────────── REGISTRIES & METHODOLOGIES ─────────────────────────
CREATE TABLE registries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,   -- e.g., Verra, Gold Standard
  base_url        text
);

CREATE TABLE methodologies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text,                   -- e.g., VCS-XXXX
  title           text,
  url             text
);

-- ───────────────────────── PROJECTS ─────────────────────────
CREATE TABLE projects (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid REFERENCES companies(id) ON DELETE SET NULL,
  name                        text NOT NULL,                          -- Project Name
  project_type                project_type_enum NOT NULL,
  pdd_status                  pdd_status_enum NOT NULL DEFAULT 'NotStarted',
  audit_status                audit_status_enum NOT NULL DEFAULT 'NotApplicable',
  inception_date              date,
  credit_issuance_date        date,
  registry_date               date,
  status                      project_status_enum NOT NULL DEFAULT 'Planned',
  registry_project_url        text,                                   -- Registry URL
  registration_platform       text,                                   -- free text if not in registries
  methodology_id              uuid REFERENCES methodologies(id) ON DELETE SET NULL,
  methodology_notes           text,
  tenure_text                 text,                                   -- Project Tenure (free text or years)
  completion_date             date,                                   -- Completion / Anticipated Completion
  project_methodology_doc_url text,                                   -- Methodology Documentation (link)
  description                 text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  delete_flag                 boolean NOT NULL DEFAULT false
);

CREATE INDEX ON projects ((lower(name)));
CREATE INDEX ON projects (project_type, status);

-- Project ↔ Registry mapping (in case of multiple registries/IDs)
CREATE TABLE project_registry_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  registry_id     uuid NOT NULL REFERENCES registries(id) ON DELETE CASCADE,
  registry_project_id text,               -- e.g., Verra ID
  registry_url    text,
  UNIQUE (project_id, registry_id)
);

-- Project collaborators (companies and/or people)
CREATE TABLE project_collaborators (
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id      uuid REFERENCES companies(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id) ON DELETE CASCADE,
  role_label      text,                   -- e.g., developer, verifier, offtaker
  PRIMARY KEY (project_id, company_id, user_id),
  CHECK ((company_id IS NOT NULL) OR (user_id IS NOT NULL))
);

-- Project media & credentials / documents
CREATE TABLE project_media (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind            text,                   -- image, video, doc
  asset_url       text NOT NULL,
  content_type    text,
  sha256          text,
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  doc_type        text NOT NULL,          -- 'PDD','AuditReport','Credentials','Registration','Other'
  title           text,
  asset_url       text NOT NULL,
  content_type    text,
  sha256          text,
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Verifications (land owner / project owner)
CREATE TABLE verifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  verification_type verification_type_enum NOT NULL,
  verifier_name     text,
  verifier_org      text,
  evidence_url      text,         -- link to uploaded doc in project_documents/project_media
  status            text,         -- e.g., 'Verified','Pending','Failed'
  comments          text,
  verified_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── CREDITS LEDGER + VIEWS (Issued/Offtake/Retired) ─────────────────────────
CREATE TABLE credit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type      credit_event_enum NOT NULL,  -- ISSUED | OFFTAKE | RETIRED
  quantity        numeric(20,6) NOT NULL CHECK (quantity >= 0),
  event_date      date NOT NULL,
  registry_tx_id  text,                         -- optional registry reference
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON credit_events (project_id, event_type);

-- Per-project aggregations
CREATE VIEW v_project_credit_totals AS
SELECT
  p.id AS project_id,
  COALESCE(SUM(CASE WHEN ce.event_type = 'ISSUED'  THEN ce.quantity END), 0) AS to_date_issued,
  COALESCE(SUM(CASE WHEN ce.event_type = 'OFFTAKE' THEN ce.quantity END), 0) AS to_date_offtake,
  COALESCE(SUM(CASE WHEN ce.event_type = 'RETIRED' THEN ce.quantity END), 0) AS to_date_retired
FROM projects p
LEFT JOIN credit_events ce ON ce.project_id = p.id
GROUP BY p.id;

-- Per-company aggregations (sum of their projects)
CREATE VIEW v_company_credit_totals AS
SELECT
  c.id AS company_id,
  COALESCE(SUM(pt.to_date_issued), 0)  AS to_date_issued,
  COALESCE(SUM(pt.to_date_offtake), 0) AS to_date_offtake,
  COALESCE(SUM(pt.to_date_retired), 0) AS to_date_retired
FROM companies c
LEFT JOIN projects p ON p.company_id = c.id AND p.delete_flag = false
LEFT JOIN v_project_credit_totals pt ON pt.project_id = p.id
GROUP BY c.id;

-- ───────────────────────── OPTIONAL: SIMPLE MEDIA FOR USER PROFILES ─────────────────────────
CREATE TABLE user_media (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            text,                   -- avatar, resume, etc.
  asset_url       text NOT NULL,
  content_type    text,
  sha256          text,
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── TRIGGERS: updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER t_companies_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER t_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER t_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();