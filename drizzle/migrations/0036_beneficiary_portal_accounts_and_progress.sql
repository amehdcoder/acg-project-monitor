CREATE TABLE public.beneficiary_portal_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 beneficiary_id uuid NOT NULL REFERENCES public.beneficiaries(id) ON DELETE CASCADE,
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 active boolean NOT NULL DEFAULT true,
 verified_by uuid NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(beneficiary_id), UNIQUE(user_id,beneficiary_id)
);
GRANT SELECT ON public.beneficiary_portal_accounts TO authenticated;
GRANT ALL ON public.beneficiary_portal_accounts TO service_role;
ALTER TABLE public.beneficiary_portal_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_account_self_read ON public.beneficiary_portal_accounts FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_admin(auth.uid()));
CREATE TABLE public.beneficiary_pathway_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES public.beneficiary_portal_accounts(id) ON DELETE CASCADE,
 stage text NOT NULL,
 activity_date date NOT NULL,
 notes text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','returned')),
 review_notes text,
 reviewed_by uuid,
 reviewed_at timestamptz,
 service_id uuid REFERENCES public.beneficiary_services(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.beneficiary_pathway_submissions TO authenticated;
GRANT ALL ON public.beneficiary_pathway_submissions TO service_role;
ALTER TABLE public.beneficiary_pathway_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_submission_self_read ON public.beneficiary_pathway_submissions FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.beneficiary_portal_accounts a WHERE a.id=account_id AND a.user_id=auth.uid() AND a.active));
CREATE OR REPLACE FUNCTION public.graduation_portal_stages() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT '["Participant orientation: Graduation Approach, rights & safeguarding","Life skills, social empowerment, inclusion & safeguarding (PSEA)","Skills acquisition training","Financial literacy training","Financial literacy & entrepreneurship refresher","Monthly cash transfer (time-bound social protection)","Quarterly enterprise coaching, mentoring & business support","Start-up grants","Savings group (VSLA) enrolment","Market linkages: suppliers, aggregators & buyers"]'::jsonb $$;
REVOKE ALL ON FUNCTION public.graduation_portal_stages() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.graduation_portal_stages() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.link_beneficiary_portal(_beneficiary uuid,_email text,_active boolean DEFAULT true) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.beneficiaries; uid uuid; linked uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Only project administrators can verify portal access'; END IF;
 SELECT * INTO b FROM public.beneficiaries WHERE id=_beneficiary;
 IF b.id IS NULL THEN RAISE EXCEPTION 'Beneficiary not found'; END IF;
 IF _active AND COALESCE(b.profile->'graduation'->>'status','') NOT IN ('verified','selected') THEN RAISE EXCEPTION 'Verify this beneficiary before linking their account'; END IF;
 SELECT u.id INTO uid FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE lower(u.email)=lower(trim(_email)) AND u.email_confirmed_at IS NOT NULL;
 IF uid IS NULL THEN RAISE EXCEPTION 'This person must create and confirm their account first'; END IF;
 INSERT INTO public.beneficiary_portal_accounts(beneficiary_id,project_id,user_id,active,verified_by) VALUES(b.id,b.project_id,uid,_active,auth.uid()) ON CONFLICT(beneficiary_id) DO UPDATE SET user_id=EXCLUDED.user_id,active=EXCLUDED.active,verified_by=EXCLUDED.verified_by,verified_at=now() RETURNING id INTO linked;
 RETURN linked;
END $$;
CREATE OR REPLACE FUNCTION public.my_beneficiary_pathways() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('account_id',a.id,'name',b.full_name,'project_name',p.name,'gate',jsonb_build_object('status',b.profile->'graduation'->>'status'),'stages',public.graduation_portal_stages(),'services',COALESCE((SELECT jsonb_agg(jsonb_build_object('service_name',s.service_name,'service_date',s.service_date)) FROM public.beneficiary_services s WHERE s.beneficiary_id=b.id AND s.service_name IN (SELECT jsonb_array_elements_text(public.graduation_portal_stages())) AND s.component_key ~* 'livelihood|economic|empower'),'[]'::jsonb),'submissions',COALESCE((SELECT jsonb_agg(to_jsonb(t)-'reviewed_by'-'service_id' ORDER BY t.created_at DESC) FROM public.beneficiary_pathway_submissions t WHERE t.account_id=a.id),'[]'::jsonb))),'[]'::jsonb) FROM public.beneficiary_portal_accounts a JOIN public.beneficiaries b ON b.id=a.beneficiary_id JOIN public.projects p ON p.id=a.project_id WHERE a.user_id=auth.uid() AND a.active;
$$;
CREATE OR REPLACE FUNCTION public.submit_beneficiary_progress(_account uuid,_stage text,_date date,_notes text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.beneficiary_portal_accounts; linked uuid; gate text;
BEGIN
 SELECT * INTO a FROM public.beneficiary_portal_accounts WHERE id=_account AND user_id=auth.uid() AND active FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'This pathway is not linked to your verified account'; END IF;
 SELECT profile->'graduation'->>'status' INTO gate FROM public.beneficiaries WHERE id=a.beneficiary_id;
 IF gate IS DISTINCT FROM 'selected' THEN RAISE EXCEPTION 'Progress submissions open after selection'; END IF;
 IF NOT public.graduation_portal_stages() ? _stage THEN RAISE EXCEPTION 'Choose a valid Graduation stage'; END IF;
 IF _date IS NULL OR _date>CURRENT_DATE THEN RAISE EXCEPTION 'Choose today or a previous activity date'; END IF;
 IF length(trim(COALESCE(_notes,'')))<5 OR length(_notes)>4000 THEN RAISE EXCEPTION 'Add activity notes between 5 and 4000 characters'; END IF;
 IF EXISTS(SELECT 1 FROM public.beneficiary_pathway_submissions WHERE account_id=a.id AND stage=_stage AND status='pending') THEN RAISE EXCEPTION 'This stage already has progress awaiting review'; END IF;
 INSERT INTO public.beneficiary_pathway_submissions(account_id,stage,activity_date,notes) VALUES(a.id,_stage,_date,trim(_notes)) RETURNING id INTO linked;
 RETURN linked;
END $$;
CREATE OR REPLACE FUNCTION public.beneficiary_progress_reviews(_beneficiary uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.beneficiaries;
BEGIN
 SELECT * INTO b FROM public.beneficiaries WHERE id=_beneficiary;
 IF b.id IS NULL OR auth.uid() IS NULL OR NOT(public.is_admin(auth.uid()) OR (public.is_project_member(auth.uid(),b.project_id) AND NOT public.facility_restricted_user(auth.uid()) AND public.beneficiary_in_user_scope(auth.uid(),b.id,b.project_id,b.created_by) AND public.programme_action_allowed(auth.uid(),b.project_id,'manage_livelihood'))) THEN RAISE EXCEPTION 'You cannot review this beneficiary'; END IF;
 RETURN jsonb_build_object('account',(SELECT jsonb_build_object('active',a.active,'verified_at',a.verified_at) FROM public.beneficiary_portal_accounts a WHERE a.beneficiary_id=b.id),'submissions',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC) FROM public.beneficiary_pathway_submissions t JOIN public.beneficiary_portal_accounts a ON a.id=t.account_id WHERE a.beneficiary_id=b.id),'[]'::jsonb));
END $$;
CREATE OR REPLACE FUNCTION public.review_beneficiary_progress(_submission uuid,_approve boolean,_notes text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.beneficiary_pathway_submissions; a public.beneficiary_portal_accounts; b public.beneficiaries; component text; linked uuid;
BEGIN
 SELECT * INTO t FROM public.beneficiary_pathway_submissions WHERE id=_submission FOR UPDATE;
 IF t.id IS NULL THEN RAISE EXCEPTION 'Progress submission not found'; END IF;
 SELECT * INTO a FROM public.beneficiary_portal_accounts WHERE id=t.account_id;
 PERFORM public.beneficiary_progress_reviews(a.beneficiary_id);
 IF t.status<>'pending' THEN RAISE EXCEPTION 'This progress has already been reviewed'; END IF;
 IF NOT _approve AND length(trim(COALESCE(_notes,'')))<5 THEN RAISE EXCEPTION 'Explain what needs changing before returning progress'; END IF;
 IF _approve THEN
 SELECT * INTO b FROM public.beneficiaries WHERE id=a.beneficiary_id;
 IF NOT a.active OR b.profile->'graduation'->>'status' IS DISTINCT FROM 'selected' THEN RAISE EXCEPTION 'The beneficiary must remain active and selected'; END IF;
 SELECT c->>'key' INTO component FROM public.programme_modules m CROSS JOIN LATERAL jsonb_array_elements(m.config->'components') c WHERE m.id=b.module_id AND COALESCE(c->>'key','')||' '||COALESCE(c->>'label','') ~* 'livelihood|economic|empower' LIMIT 1;
 IF component IS NULL THEN RAISE EXCEPTION 'Configure a Livelihood component before approving progress'; END IF;
 INSERT INTO public.beneficiary_services(beneficiary_id,module_id,project_id,component_key,service_name,service_date,result,status,data,recorded_by) VALUES(b.id,b.module_id,b.project_id,component,t.stage,t.activity_date,'Completed','on_track',jsonb_build_object('portal_submission_id',t.id,'beneficiary_notes',t.notes,'review_notes',_notes),auth.uid()) RETURNING id INTO linked;
 END IF;
 UPDATE public.beneficiary_pathway_submissions SET status=CASE WHEN _approve THEN 'approved' ELSE 'returned' END,review_notes=_notes,reviewed_by=auth.uid(),reviewed_at=now(),service_id=linked WHERE id=t.id;
 RETURN t.id;
END $$;
REVOKE ALL ON FUNCTION public.link_beneficiary_portal(uuid,text,boolean),public.my_beneficiary_pathways(),public.submit_beneficiary_progress(uuid,text,date,text),public.beneficiary_progress_reviews(uuid),public.review_beneficiary_progress(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.link_beneficiary_portal(uuid,text,boolean),public.my_beneficiary_pathways(),public.submit_beneficiary_progress(uuid,text,date,text),public.beneficiary_progress_reviews(uuid),public.review_beneficiary_progress(uuid,boolean,text) TO authenticated,service_role;