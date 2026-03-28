
ALTER TABLE public.microplan_entries
  ADD COLUMN trachoma_0_5_months integer NULL,
  ADD COLUMN trachoma_6m_6y integer NULL,
  ADD COLUMN trachoma_7_14y integer NULL,
  ADD COLUMN trachoma_15_plus integer NULL;
