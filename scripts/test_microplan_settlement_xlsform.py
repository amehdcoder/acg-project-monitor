import importlib.util
from pathlib import Path
import unittest
import openpyxl

spec = importlib.util.spec_from_file_location('settlement_form', Path(__file__).with_name('update-microplan-settlement-xlsform.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SettlementRules(unittest.TestCase):
    def setUp(self):
        workbook = openpyxl.Workbook()
        survey = workbook.active
        survey.title = 'survey'
        self.headers = ['type', 'name', 'label', 'required', 'hint', 'appearance', 'relevant', 'calculation', 'constraint', 'constraint_message']
        survey.append(self.headers)
        for kind, name in [('begin_repeat', 'group_yf5bw16'), ('geopoint', 'community_gps'), ('begin_group', 'group_dt1sn66'), ('text', 'Settlement_Name'), ('geopoint', 'settlement_gps'), ('end_group', None), ('end_repeat', None)]:
            survey.append([kind, name])
        workbook.create_sheet('choices').append(['list_name', 'name', 'label'])
        settings = workbook.create_sheet('settings')
        settings.append(['form_title', 'version'])
        settings.append(['Original', '1'])
        self.workbook = module.update_workbook(workbook)
        self.rows = [dict(zip(self.headers, row)) for row in survey.iter_rows(min_row=2, values_only=True)]
        self.by_name = {row['name']: row for row in self.rows if row['name']}

    def test_settlements_are_repeatable_inside_each_community(self):
        stack = []
        for row in self.rows:
            if row['type'] == 'begin_repeat':
                if row['name'] == 'settlement_repeat':
                    self.assertEqual(stack, ['group_yf5bw16'])
                stack.append(row['name'])
            elif row['type'] == 'end_repeat':
                stack.pop()
        self.assertEqual(stack, [])
        self.assertEqual(self.by_name['settlement_repeat']['type'], 'begin_repeat')

    def test_each_community_requires_gps(self):
        self.assertEqual(self.by_name['community_gps']['required'], 'true')

    def test_each_settlement_requires_gps(self):
        self.assertEqual(self.by_name['settlement_gps']['required'], 'true')

    def test_each_settlement_requires_a_name(self):
        self.assertEqual(self.by_name['Settlement_Name']['required'], 'true')

    def test_community_only_allowed_but_yes_requires_settlement(self):
        self.assertEqual(self.by_name['settlement_repeat']['relevant'], "${Has_Settlements} = 'yes'")
        self.assertEqual(self.by_name['settlement_count_check']['constraint'], '. >= 1')
        self.assertEqual(self.by_name['settlement_count_check']['calculation'], 'count(${settlement_repeat})')


if __name__ == '__main__':
    unittest.main()