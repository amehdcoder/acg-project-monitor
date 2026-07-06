
WITH ranked AS (
  SELECT id, project_id, name,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, name,
        COALESCE(settings->>'isMdaChecklist', settings->>'sarmaan_supervisory',
                 settings->>'sarmaan_acsm', settings->>'bloomberg_kind',
                 settings->>'seeclear_kind', settings->>'acsm_kind',
                 settings->>'sbc_kind', settings->>'irf_kind')
      ORDER BY created_at ASC
    ) AS rn
  FROM forms
  WHERE (settings ? 'isMdaChecklist' OR settings ? 'sarmaan_supervisory'
      OR settings ? 'sarmaan_acsm' OR settings ? 'bloomberg_kind'
      OR settings ? 'seeclear_kind' OR settings ? 'acsm_kind'
      OR settings ? 'sbc_kind' OR settings ? 'irf_kind')
),
canonical AS (
  SELECT r.id AS dup_id, k.id AS keep_id
  FROM ranked r
  JOIN ranked k ON k.project_id = r.project_id AND k.name = r.name AND k.rn = 1
  WHERE r.rn > 1
)
-- Repoint submissions from duplicates to the kept form.
, upd_sub AS (
  UPDATE form_submissions fs SET form_id = c.keep_id
  FROM canonical c WHERE fs.form_id = c.dup_id
  RETURNING 1
)
-- Repoint SARMAAN per-section access grants.
, upd_acc AS (
  UPDATE sarmaan_form_access sa SET form_id = c.keep_id
  FROM canonical c WHERE sa.form_id = c.dup_id
  RETURNING 1
)
-- Repoint generic user form assignments.
, upd_ufa AS (
  UPDATE user_form_assignments ufa SET form_id = c.keep_id
  FROM canonical c WHERE ufa.form_id = c.dup_id
  RETURNING 1
)
DELETE FROM forms f USING canonical c WHERE f.id = c.dup_id;
