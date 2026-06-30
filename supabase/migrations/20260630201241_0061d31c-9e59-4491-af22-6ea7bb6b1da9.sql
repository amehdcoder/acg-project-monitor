CREATE OR REPLACE FUNCTION public._after_hours_insert_one(p_table text, p_obj jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  collist text;
  collist_noid text;
  has_id boolean;
BEGIN
  -- Build the list of payload keys that are real columns on the target table.
  SELECT string_agg(quote_ident(key), ',') INTO collist
  FROM jsonb_object_keys(p_obj) AS key
  WHERE EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = p_table AND c.column_name = key
  );
  IF collist IS NULL THEN RAISE EXCEPTION 'No matching columns for %', p_table; END IF;

  -- Same list but excluding the primary-key "id" column, so we can retry with a
  -- freshly generated id if the stored payload's id collides with an existing row.
  SELECT string_agg(quote_ident(key), ',') INTO collist_noid
  FROM jsonb_object_keys(p_obj) AS key
  WHERE key <> 'id' AND EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = p_table AND c.column_name = key
  );

  has_id := (p_obj ? 'id');

  BEGIN
    EXECUTE format(
      'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)',
      p_table, collist, collist, p_table
    ) USING p_obj;
  EXCEPTION WHEN unique_violation THEN
    -- The payload collided with an existing row (e.g. it was already saved or the
    -- id was reused). Re-insert without the stored id so the database assigns a
    -- fresh one and the submission is still persisted and reflected on dashboards.
    IF has_id AND collist_noid IS NOT NULL THEN
      BEGIN
        EXECUTE format(
          'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)',
          p_table, collist_noid, collist_noid, p_table
        ) USING (p_obj - 'id');
      EXCEPTION WHEN unique_violation THEN
        -- Genuinely a duplicate submission (no id involved) — treat as idempotent.
        NULL;
      END;
    ELSE
      -- Duplicate on a non-id unique constraint: already present, treat as success.
      NULL;
    END IF;
  END;
END;
$function$;