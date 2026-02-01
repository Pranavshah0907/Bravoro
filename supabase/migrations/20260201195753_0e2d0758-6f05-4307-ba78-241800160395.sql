-- Create master_contacts table for centralized contact storage
CREATE TABLE public.master_contacts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    person_id TEXT,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    email_2 TEXT,
    phone_1 TEXT,
    phone_2 TEXT,
    linkedin TEXT,
    title TEXT,
    organization TEXT,
    domain TEXT,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_search_id UUID,
    source_user_id UUID
);

-- Create indexes for fast searching and deduplication
CREATE UNIQUE INDEX idx_master_contacts_person_id ON public.master_contacts(person_id) WHERE person_id IS NOT NULL;
CREATE INDEX idx_master_contacts_organization ON public.master_contacts(organization);
CREATE INDEX idx_master_contacts_domain ON public.master_contacts(domain);
CREATE INDEX idx_master_contacts_fallback_dedup ON public.master_contacts(first_name, last_name, organization);
CREATE INDEX idx_master_contacts_linkedin ON public.master_contacts(linkedin) WHERE linkedin IS NOT NULL;
CREATE INDEX idx_master_contacts_email ON public.master_contacts(email) WHERE email IS NOT NULL;

-- Create GIN index for full-text search on organization
CREATE INDEX idx_master_contacts_org_search ON public.master_contacts USING GIN(to_tsvector('english', COALESCE(organization, '')));

-- Enable Row Level Security
ALTER TABLE public.master_contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only admins can SELECT from master_contacts
CREATE POLICY "Admins can view all master contacts"
ON public.master_contacts
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policy: Service role can INSERT (for edge functions)
CREATE POLICY "Service role can insert master contacts"
ON public.master_contacts
FOR INSERT
WITH CHECK (true);

-- RLS Policy: Service role can UPDATE (for edge functions)
CREATE POLICY "Service role can update master contacts"
ON public.master_contacts
FOR UPDATE
USING (true);