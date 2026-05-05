-- Resolver function: returns the active value for a (contact, field)
CREATE OR REPLACE FUNCTION public.get_active_contact_value(p_contact_id uuid, p_field_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value
  FROM public.contact_field_sources
  WHERE contact_id = p_contact_id
    AND field_name = p_field_name
    AND is_active
  ORDER BY confidence DESC, fetched_at DESC
  LIMIT 1
$$;

-- Resolved view: contact + resolved field values, falling back to base columns
CREATE OR REPLACE VIEW public.contacts_resolved
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.user_id,
  c.organization_id,
  COALESCE(public.get_active_contact_value(c.id, 'full_name'),    c.full_name)    AS full_name,
  COALESCE(public.get_active_contact_value(c.id, 'first_name'),   c.first_name)   AS first_name,
  COALESCE(public.get_active_contact_value(c.id, 'last_name'),    c.last_name)    AS last_name,
  COALESCE(public.get_active_contact_value(c.id, 'company'),      c.company)      AS company,
  COALESCE(public.get_active_contact_value(c.id, 'title'),        c.title)        AS title,
  COALESCE(public.get_active_contact_value(c.id, 'location'),     c.location)     AS location,
  COALESCE(public.get_active_contact_value(c.id, 'linkedin_url'), c.linkedin_url) AS linkedin_url,
  COALESCE(public.get_active_contact_value(c.id, 'twitter_url'),  c.twitter_url)  AS twitter_url,
  COALESCE(public.get_active_contact_value(c.id, 'website_url'),  c.website_url)  AS website_url,
  COALESCE(public.get_active_contact_value(c.id, 'photo_url'),    c.photo_url)    AS photo_url,
  COALESCE(public.get_active_contact_value(c.id, 'email'),
           NULLIF(c.emails->>0, ''))                                              AS email,
  COALESCE(public.get_active_contact_value(c.id, 'phone'),
           NULLIF(c.phones->>0, ''))                                              AS phone,
  c.emails,
  c.phones,
  c.cadence,
  c.last_contact_at,
  c.created_at,
  c.updated_at
FROM public.contacts c;