
DROP VIEW public.contacts_resolved;
CREATE VIEW public.contacts_resolved
WITH (security_invoker = true) AS
SELECT id, user_id, organization_id,
  COALESCE(get_active_contact_value(id, 'full_name'), full_name) AS full_name,
  COALESCE(get_active_contact_value(id, 'first_name'), first_name) AS first_name,
  COALESCE(get_active_contact_value(id, 'last_name'), last_name) AS last_name,
  COALESCE(get_active_contact_value(id, 'company'), company) AS company,
  COALESCE(get_active_contact_value(id, 'title'), title) AS title,
  COALESCE(get_active_contact_value(id, 'location'), location) AS location,
  COALESCE(get_active_contact_value(id, 'linkedin_url'), linkedin_url) AS linkedin_url,
  COALESCE(get_active_contact_value(id, 'twitter_url'), twitter_url) AS twitter_url,
  COALESCE(get_active_contact_value(id, 'website_url'), website_url) AS website_url,
  COALESCE(get_active_contact_value(id, 'photo_url'), photo_url) AS photo_url,
  COALESCE(get_active_contact_value(id, 'email'), NULLIF(emails ->> 0, '')) AS email,
  COALESCE(get_active_contact_value(id, 'phone'), NULLIF(phones ->> 0, '')) AS phone,
  emails, phones, cadence, last_contact_at, notes_summary, source, created_at, updated_at,
  company_id
FROM public.contacts c;
