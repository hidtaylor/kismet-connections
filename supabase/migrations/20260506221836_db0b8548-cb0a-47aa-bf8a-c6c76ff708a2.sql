
ALTER FUNCTION public.normalize_company_name(text) SET search_path = public;
ALTER FUNCTION public.domain_from_email(text) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.ensure_org_and_company(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.contacts_autolink_org() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_org_and_company(uuid, text, text) TO authenticated;
