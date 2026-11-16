import unittest
import openpyxl
from pathlib import Path
import importlib.util

spec=importlib.util.spec_from_file_location('details',Path(__file__).with_name('update-microplan-settlement-details.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SettlementDetails(unittest.TestCase):
    def setUp(self):
        self.w=openpyxl.load_workbook('/tmp/amehnities_geo_microplanning_v2026_11_16d.xlsx')
        headers=[c.value for c in self.w['survey'][1]]
        self.rows=[dict(zip(headers,r)) for r in self.w['survey'].iter_rows(min_row=2,values_only=True)]
        self.by={r['name']:r for r in self.rows if r.get('name')}

    def test_each_settlement_captures_required_conditions_population_households_disability(self):
        for name in ['Type_of_Terrain','Accessibility','Security_Clearance','Number_of_Households','Visual_Seeing','Hearing','Physical_Mobility','Intellectual_Cognitive','Communication_Speech','Self_care','Albinism','pwd_total','Trachoma_5_9_Male','Trachoma_5_9_Female']:
            self.assertEqual(self.by['settlement_'+name]['required'],'true',name)

    def test_cdd_repeat_is_nested_and_uses_same_bank_choices(self):
        stack=[]
        for r in self.rows:
            if r['type']=='begin_repeat':
                if r['name']=='settlement_cdd_repeat':self.assertEqual(stack,['group_yf5bw16','settlement_repeat'])
                stack.append(r['name'])
            elif r['type']=='end_repeat':stack.pop()
        self.assertEqual(self.by['settlement_CDD_Bank']['type'],self.by['CDD_Bank']['type'])
        self.assertEqual(self.by['settlement_CDD_Bank_Other']['relevant'],"${settlement_CDD_Bank} = 'other'")

    def test_standard_trachoma_skip_logic_and_total_exclude_independent_cohort(self):
        self.assertIn("${MDA_Type} = 'trachoma_mda'",self.by['settlement_group_jq2fc22']['relevant'])
        self.assertIn('not(',self.by['settlement_group_ra96m39']['relevant'])
        self.assertNotIn('5_9',self.by['settlement_Total_Population']['calculation'])
        self.assertIn("${Has_Settlements} = 'no'",self.by['Total_Population']['relevant'])

if __name__=='__main__':unittest.main()