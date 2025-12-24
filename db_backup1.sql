--
-- PostgreSQL database dump
--

\restrict QtF8pbLuOcVbRdVf6UbUWreGVmDTa1RBns10HBa1tPkjAWb3infIasMbKnonhUw

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.0

-- Started on 2025-11-28 13:08:08

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 877 (class 1247 OID 16504)
-- Name: audit_status_enum; Type: TYPE; Schema: public; Owner: carbon_admin
--

CREATE TYPE public.audit_status_enum AS ENUM (
    'NotApplicable',
    'Planned',
    'InProgress',
    'Completed',
    'IssuesFound'
);


ALTER TYPE public.audit_status_enum OWNER TO carbon_admin;

--
-- TOC entry 883 (class 1247 OID 16528)
-- Name: credit_event_enum; Type: TYPE; Schema: public; Owner: carbon_admin
--

CREATE TYPE public.credit_event_enum AS ENUM (
    'ISSUED',
    'OFFTAKE',
    'RETIRED'
);


ALTER TYPE public.credit_event_enum OWNER TO carbon_admin;

--
-- TOC entry 874 (class 1247 OID 16492)
-- Name: pdd_status_enum; Type: TYPE; Schema: public; Owner: carbon_admin
--

CREATE TYPE public.pdd_status_enum AS ENUM (
    'NotStarted',
    'InProgress',
    'Submitted',
    'Approved',
    'Rejected'
);


ALTER TYPE public.pdd_status_enum OWNER TO carbon_admin;

--
-- TOC entry 880 (class 1247 OID 16516)
-- Name: project_status_enum; Type: TYPE; Schema: public; Owner: carbon_admin
--

CREATE TYPE public.project_status_enum AS ENUM (
    'Planned',
    'Active',
    'Paused',
    'Completed',
    'Cancelled'
);


ALTER TYPE public.project_status_enum OWNER TO carbon_admin;

--
-- TOC entry 871 (class 1247 OID 16472)
-- Name: project_type_enum; Type: TYPE; Schema: public; Owner: carbon_admin
--

CREATE TYPE public.project_type_enum AS ENUM (
    'Afforestation',
    'Reforestation',
    'RenewableEnergy',
    'EnergyEfficiency',
    'BlueCarbon',
    'WasteManagement',
    'MethaneReduction',
    'Cookstoves',
    'Other'
);


ALTER TYPE public.project_type_enum OWNER TO carbon_admin;

--
-- TOC entry 886 (class 1247 OID 16536)
-- Name: verification_type_enum; Type: TYPE; Schema: public; Owner: carbon_admin
--

CREATE TYPE public.verification_type_enum AS ENUM (
    'LandOwner',
    'ProjectOwner'
);


ALTER TYPE public.verification_type_enum OWNER TO carbon_admin;

--
-- TOC entry 236 (class 1255 OID 16793)
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: carbon_admin
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;


ALTER FUNCTION public.set_updated_at() OWNER TO carbon_admin;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 219 (class 1259 OID 16541)
-- Name: companies; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legal_name text NOT NULL,
    function_description text,
    geographical_coverage text[] DEFAULT '{}'::text[] NOT NULL,
    company_email text NOT NULL,
    website_url text,
    phone_number text,
    registration_url text,
    employees_count integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    delete_flag boolean DEFAULT false NOT NULL,
    business_function text NOT NULL,
    owner_user_id uuid NOT NULL,
    CONSTRAINT companies_geographical_coverage_not_empty CHECK ((array_length(geographical_coverage, 1) > 0))
);


ALTER TABLE public.companies OWNER TO carbon_admin;

--
-- TOC entry 220 (class 1259 OID 16555)
-- Name: company_documents; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.company_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    title text NOT NULL,
    asset_url text NOT NULL,
    content_type text,
    sha256 text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.company_documents OWNER TO carbon_admin;

--
-- TOC entry 221 (class 1259 OID 16570)
-- Name: company_media; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.company_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    kind text,
    asset_url text NOT NULL,
    content_type text,
    sha256 text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.company_media OWNER TO carbon_admin;

--
-- TOC entry 222 (class 1259 OID 16585)
-- Name: company_partners; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.company_partners (
    company_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    relationship text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT company_partners_check CHECK ((company_id <> partner_id))
);


ALTER TABLE public.company_partners OWNER TO carbon_admin;

--
-- TOC entry 223 (class 1259 OID 16604)
-- Name: company_users; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.company_users (
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_title text
);


ALTER TABLE public.company_users OWNER TO carbon_admin;

--
-- TOC entry 226 (class 1259 OID 16752)
-- Name: credit_events; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.credit_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    event_type public.credit_event_enum NOT NULL,
    quantity numeric(20,6) NOT NULL,
    event_date date NOT NULL,
    registry_tx_id text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT credit_events_quantity_check CHECK ((quantity >= (0)::numeric))
);


ALTER TABLE public.credit_events OWNER TO carbon_admin;

--
-- TOC entry 225 (class 1259 OID 16631)
-- Name: methodologies; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.methodologies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text,
    title text,
    url text
);


ALTER TABLE public.methodologies OWNER TO carbon_admin;

--
-- TOC entry 230 (class 1259 OID 16963)
-- Name: project_collaborators; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.project_collaborators (
    project_id uuid NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_label text,
    CONSTRAINT project_collaborators_check CHECK (((company_id IS NOT NULL) OR (user_id IS NOT NULL)))
);


ALTER TABLE public.project_collaborators OWNER TO carbon_admin;

--
-- TOC entry 232 (class 1259 OID 17001)
-- Name: project_documents; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.project_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    doc_type text NOT NULL,
    title text,
    asset_url text NOT NULL,
    content_type text,
    sha256 text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.project_documents OWNER TO carbon_admin;

--
-- TOC entry 231 (class 1259 OID 16986)
-- Name: project_media; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.project_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    kind text,
    asset_url text NOT NULL,
    content_type text,
    sha256 text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.project_media OWNER TO carbon_admin;

--
-- TOC entry 229 (class 1259 OID 16943)
-- Name: project_registry_links; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.project_registry_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    registry_id uuid NOT NULL,
    registry_project_id text,
    registry_url text
);


ALTER TABLE public.project_registry_links OWNER TO carbon_admin;

--
-- TOC entry 228 (class 1259 OID 16914)
-- Name: projects; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    name text NOT NULL,
    project_type public.project_type_enum NOT NULL,
    sector text,
    host_country text,
    host_region text,
    pdd_status public.pdd_status_enum DEFAULT 'NotStarted'::public.pdd_status_enum NOT NULL,
    audit_status public.audit_status_enum DEFAULT 'NotApplicable'::public.audit_status_enum NOT NULL,
    inception_date date,
    credit_issuance_date date,
    registry_date date,
    registration_date_expected date,
    registration_date_actual date,
    implementation_start date,
    implementation_end date,
    crediting_start date,
    crediting_end date,
    status public.project_status_enum DEFAULT 'Planned'::public.project_status_enum NOT NULL,
    registry_project_url text,
    registration_platform text,
    methodology_id uuid,
    methodology_version text,
    methodology_notes text,
    tenure_text text,
    completion_date date,
    project_methodology_doc_url text,
    expected_annual_reductions jsonb DEFAULT '{}'::jsonb,
    volume_offered_authority numeric(20,6),
    tenderer_role text,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    delete_flag boolean DEFAULT false NOT NULL,
    owner_user_id uuid NOT NULL
);


ALTER TABLE public.projects OWNER TO carbon_admin;

--
-- TOC entry 224 (class 1259 OID 16621)
-- Name: registries; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.registries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    base_url text
);


ALTER TABLE public.registries OWNER TO carbon_admin;

--
-- TOC entry 227 (class 1259 OID 16778)
-- Name: user_media; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.user_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text,
    asset_url text NOT NULL,
    content_type text,
    sha256 text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_media OWNER TO carbon_admin;

--
-- TOC entry 218 (class 1259 OID 16449)
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.user_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text,
    location text,
    carbon_generated numeric(20,6) DEFAULT 0,
    carbon_sold numeric(20,6) DEFAULT 0,
    personal_website text,
    linkedin_url text,
    phone_number text,
    bio text,
    qr_code_url text,
    expertise_tags text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    delete_flag boolean DEFAULT false NOT NULL
);


ALTER TABLE public.user_profiles OWNER TO carbon_admin;

--
-- TOC entry 217 (class 1259 OID 16437)
-- Name: users; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text,
    provider text DEFAULT 'local'::text NOT NULL,
    google_sub text,
    name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO carbon_admin;

--
-- TOC entry 234 (class 1259 OID 17031)
-- Name: v_project_credit_totals; Type: VIEW; Schema: public; Owner: carbon_admin
--

CREATE VIEW public.v_project_credit_totals AS
 SELECT p.id AS project_id,
    COALESCE(sum(
        CASE
            WHEN (ce.event_type = 'ISSUED'::public.credit_event_enum) THEN ce.quantity
            ELSE NULL::numeric
        END), (0)::numeric) AS to_date_issued,
    COALESCE(sum(
        CASE
            WHEN (ce.event_type = 'OFFTAKE'::public.credit_event_enum) THEN ce.quantity
            ELSE NULL::numeric
        END), (0)::numeric) AS to_date_offtake,
    COALESCE(sum(
        CASE
            WHEN (ce.event_type = 'RETIRED'::public.credit_event_enum) THEN ce.quantity
            ELSE NULL::numeric
        END), (0)::numeric) AS to_date_retired
   FROM (public.projects p
     LEFT JOIN public.credit_events ce ON ((ce.project_id = p.id)))
  GROUP BY p.id;


ALTER VIEW public.v_project_credit_totals OWNER TO carbon_admin;

--
-- TOC entry 235 (class 1259 OID 17036)
-- Name: v_company_credit_totals; Type: VIEW; Schema: public; Owner: carbon_admin
--

CREATE VIEW public.v_company_credit_totals AS
 SELECT c.id AS company_id,
    COALESCE(sum(pt.to_date_issued), (0)::numeric) AS to_date_issued,
    COALESCE(sum(pt.to_date_offtake), (0)::numeric) AS to_date_offtake,
    COALESCE(sum(pt.to_date_retired), (0)::numeric) AS to_date_retired
   FROM ((public.companies c
     LEFT JOIN public.projects p ON (((p.company_id = c.id) AND (p.delete_flag = false))))
     LEFT JOIN public.v_project_credit_totals pt ON ((pt.project_id = p.id)))
  GROUP BY c.id;


ALTER VIEW public.v_company_credit_totals OWNER TO carbon_admin;

--
-- TOC entry 233 (class 1259 OID 17016)
-- Name: verifications; Type: TABLE; Schema: public; Owner: carbon_admin
--

CREATE TABLE public.verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    verification_type public.verification_type_enum NOT NULL,
    verifier_name text,
    verifier_org text,
    evidence_url text,
    status text,
    comments text,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.verifications OWNER TO carbon_admin;

--
-- TOC entry 4299 (class 2606 OID 16552)
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- TOC entry 4301 (class 2606 OID 16564)
-- Name: company_documents company_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.company_documents
    ADD CONSTRAINT company_documents_pkey PRIMARY KEY (id);


--
-- TOC entry 4303 (class 2606 OID 16579)
-- Name: company_media company_media_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.company_media
    ADD CONSTRAINT company_media_pkey PRIMARY KEY (id);


--
-- TOC entry 4305 (class 2606 OID 16593)
-- Name: company_partners company_partners_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.company_partners
    ADD CONSTRAINT company_partners_pkey PRIMARY KEY (company_id, partner_id);


--
-- TOC entry 4307 (class 2606 OID 16610)
-- Name: company_users company_users_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.company_users
    ADD CONSTRAINT company_users_pkey PRIMARY KEY (company_id, user_id);


--
-- TOC entry 4315 (class 2606 OID 16761)
-- Name: credit_events credit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.credit_events
    ADD CONSTRAINT credit_events_pkey PRIMARY KEY (id);


--
-- TOC entry 4313 (class 2606 OID 16638)
-- Name: methodologies methodologies_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.methodologies
    ADD CONSTRAINT methodologies_pkey PRIMARY KEY (id);


--
-- TOC entry 4330 (class 2606 OID 16970)
-- Name: project_collaborators project_collaborators_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_pkey PRIMARY KEY (project_id, company_id, user_id);


--
-- TOC entry 4334 (class 2606 OID 17010)
-- Name: project_documents project_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.project_documents
    ADD CONSTRAINT project_documents_pkey PRIMARY KEY (id);


--
-- TOC entry 4332 (class 2606 OID 16995)
-- Name: project_media project_media_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.project_media
    ADD CONSTRAINT project_media_pkey PRIMARY KEY (id);


--
-- TOC entry 4326 (class 2606 OID 16950)
-- Name: project_registry_links project_registry_links_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.project_registry_links
    ADD CONSTRAINT project_registry_links_pkey PRIMARY KEY (id);


--
-- TOC entry 4328 (class 2606 OID 16952)
-- Name: project_registry_links project_registry_links_project_id_registry_id_key; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.project_registry_links
    ADD CONSTRAINT project_registry_links_project_id_registry_id_key UNIQUE (project_id, registry_id);


--
-- TOC entry 4322 (class 2606 OID 16928)
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- TOC entry 4309 (class 2606 OID 16630)
-- Name: registries registries_name_key; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.registries
    ADD CONSTRAINT registries_name_key UNIQUE (name);


--
-- TOC entry 4311 (class 2606 OID 16628)
-- Name: registries registries_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.registries
    ADD CONSTRAINT registries_pkey PRIMARY KEY (id);


--
-- TOC entry 4318 (class 2606 OID 16787)
-- Name: user_media user_media_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.user_media
    ADD CONSTRAINT user_media_pkey PRIMARY KEY (id);


--
-- TOC entry 4293 (class 2606 OID 16462)
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- TOC entry 4295 (class 2606 OID 16464)
-- Name: user_profiles user_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);


--
-- TOC entry 4288 (class 2606 OID 16448)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 4290 (class 2606 OID 16446)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4336 (class 2606 OID 17024)
-- Name: verifications verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.verifications
    ADD CONSTRAINT verifications_pkey PRIMARY KEY (id);


--
-- TOC entry 4296 (class 1259 OID 16554)
-- Name: companies_geographical_coverage_idx; Type: INDEX; Schema: public; Owner: carbon_admin
--

CREATE INDEX companies_geographical_coverage_idx ON public.companies USING gin (geographical_coverage);


--
-- TOC entry 4297 (class 1259 OID 16553)
-- Name: companies_lower_idx; Type: INDEX; Schema: public; Owner: carbon_admin
--

CREATE INDEX companies_lower_idx ON public.companies USING btree (lower(legal_name));


--
-- TOC entry 4316 (class 1259 OID 16767)
-- Name: credit_events_project_id_event_type_idx; Type: INDEX; Schema: public; Owner: carbon_admin
--

CREATE INDEX credit_events_project_id_event_type_idx ON public.credit_events USING btree (project_id, event_type);


--
-- TOC entry 4319 (class 1259 OID 16942)
-- Name: projects_host_country_idx; Type: INDEX; Schema: public; Owner: carbon_admin
--

CREATE INDEX projects_host_country_idx ON public.projects USING btree (host_country);


--
-- TOC entry 4320 (class 1259 OID 16939)
-- Name: projects_name_idx; Type: INDEX; Schema: public; Owner: carbon_admin
--

CREATE INDEX projects_name_idx ON public.projects USING btree (lower(name));


--
-- TOC entry 4323 (class 1259 OID 16941)
-- Name: projects_sector_idx; Type: INDEX; Schema: public; Owner: carbon_admin
--

CREATE INDEX projects_sector_idx ON public.projects USING btree (sector);


--
-- TOC entry 4324 (class 1259 OID 16940)
-- Name: projects_type_status_idx; Type: INDEX; Schema: public; Owner: carbon_admin
--

CREATE INDEX projects_type_status_idx ON public.projects USING btree (project_type, status);


--
-- TOC entry 4291 (class 1259 OID 16470)
-- Name: user_profiles_expertise_tags_idx; Type: INDEX; Schema: public; Owner: carbon_admin
--

CREATE INDEX user_profiles_expertise_tags_idx ON public.user_profiles USING gin (expertise_tags);


--
-- TOC entry 4358 (class 2620 OID 16794)
-- Name: companies t_companies_updated_at; Type: TRIGGER; Schema: public; Owner: carbon_admin
--

CREATE TRIGGER t_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 4357 (class 2620 OID 16796)
-- Name: user_profiles t_user_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: carbon_admin
--

CREATE TRIGGER t_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 4338 (class 2606 OID 17042)
-- Name: companies companies_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id);


--
-- TOC entry 4339 (class 2606 OID 16565)
-- Name: company_documents company_documents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.company_documents
    ADD CONSTRAINT company_documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4340 (class 2606 OID 16580)
-- Name: company_media company_media_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.company_media
    ADD CONSTRAINT company_media_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4341 (class 2606 OID 16594)
-- Name: company_partners company_partners_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.company_partners
    ADD CONSTRAINT company_partners_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4342 (class 2606 OID 16599)
-- Name: company_partners company_partners_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.company_partners
    ADD CONSTRAINT company_partners_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4343 (class 2606 OID 16611)
-- Name: company_users company_users_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.company_users
    ADD CONSTRAINT company_users_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4344 (class 2606 OID 16616)
-- Name: company_users company_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.company_users
    ADD CONSTRAINT company_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4351 (class 2606 OID 16976)
-- Name: project_collaborators project_collaborators_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4352 (class 2606 OID 16971)
-- Name: project_collaborators project_collaborators_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 4353 (class 2606 OID 16981)
-- Name: project_collaborators project_collaborators_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.project_collaborators
    ADD CONSTRAINT project_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4355 (class 2606 OID 17011)
-- Name: project_documents project_documents_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.project_documents
    ADD CONSTRAINT project_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 4354 (class 2606 OID 16996)
-- Name: project_media project_media_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.project_media
    ADD CONSTRAINT project_media_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 4349 (class 2606 OID 16953)
-- Name: project_registry_links project_registry_links_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.project_registry_links
    ADD CONSTRAINT project_registry_links_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- TOC entry 4350 (class 2606 OID 16958)
-- Name: project_registry_links project_registry_links_registry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.project_registry_links
    ADD CONSTRAINT project_registry_links_registry_id_fkey FOREIGN KEY (registry_id) REFERENCES public.registries(id) ON DELETE CASCADE;


--
-- TOC entry 4346 (class 2606 OID 16929)
-- Name: projects projects_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- TOC entry 4347 (class 2606 OID 16934)
-- Name: projects projects_methodology_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_methodology_id_fkey FOREIGN KEY (methodology_id) REFERENCES public.methodologies(id) ON DELETE SET NULL;


--
-- TOC entry 4348 (class 2606 OID 17047)
-- Name: projects projects_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id);


--
-- TOC entry 4345 (class 2606 OID 16788)
-- Name: user_media user_media_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.user_media
    ADD CONSTRAINT user_media_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4337 (class 2606 OID 16465)
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4356 (class 2606 OID 17025)
-- Name: verifications verifications_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: carbon_admin
--

ALTER TABLE ONLY public.verifications
    ADD CONSTRAINT verifications_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


-- Completed on 2025-11-28 13:08:09

--
-- PostgreSQL database dump complete
--

\unrestrict QtF8pbLuOcVbRdVf6UbUWreGVmDTa1RBns10HBa1tPkjAWb3infIasMbKnonhUw

