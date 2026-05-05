DROP VIEW IF EXISTS public.contacts_resolved;
CREATE VIEW public.contacts_resolved
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
  COALESCE(public.get_active_contact_value(c.id, 'email'), NULLIF(c.emails->>0, '')) AS email,
  COALESCE(public.get_active_contact_value(c.id, 'phone'), NULLIF(c.phones->>0, '')) AS phone,
  c.emails,
  c.phones,
  c.cadence,
  c.last_contact_at,
  c.notes_summary,
  c.source,
  c.created_at,
  c.updated_at
FROM public.contacts c;