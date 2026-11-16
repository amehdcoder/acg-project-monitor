"""Update the published microplanning workbook without rebuilding its existing fields."""
import argparse
from copy import copy
import openpyxl


def update_workbook(workbook):
    survey = workbook['survey']
    columns = {cell.value: cell.column for cell in survey[1]}

    def put(row, key, value):
        survey.cell(row, columns[key], value)

    def find(name):
        for row in range(2, survey.max_row + 1):
            if survey.cell(row, columns['name']).value == name:
                return row
        raise ValueError(f'Missing expected question: {name}')

    community = find('group_yf5bw16')
    put(community, 'label', 'Community · add each community separately')
    for name, label in [('community_gps', 'Community GPS coordinates'), ('settlement_gps', 'Settlement GPS coordinates')]:
        row = find(name)
        put(row, 'required', 'true')
        put(row, 'label', label)
        put(row, 'hint', 'Capture this location on site. GPS is required for every instance; do not reuse the facility location.')

    start = find('group_dt1sn66')
    end = start + 1
    while survey.cell(end, columns['type']).value not in ('end_group', 'end group'):
        end += 1
    put(start, 'type', 'begin_repeat')
    put(start, 'name', 'settlement_repeat')
    put(start, 'label', 'Settlements within ${Community_Name}')
    put(start, 'relevant', "${Has_Settlements} = 'yes'")
    survey.cell(start, columns['appearance']).value = None
    put(end, 'type', 'end_repeat')
    put(find('Settlement_Name'), 'required', 'true')

    survey.insert_rows(start)
    for col in range(1, survey.max_column + 1):
        survey.cell(start, col)._style = copy(survey.cell(start + 1, col)._style)
    for key, value in {
        'type': 'select_one settlement_presence', 'name': 'Has_Settlements',
        'label': 'Are there settlements within this community?', 'required': 'true',
        'hint': 'Select Yes to add one or more named settlements for this community.',
        'appearance': 'minimal',
    }.items():
        put(start, key, value)

    # A relevant repeat must contain at least one item, while still allowing any
    # number of additions. This check sits outside the nested repeat.
    end += 1
    survey.insert_rows(end + 1)
    for key, value in {
        'type': 'integer', 'name': 'settlement_count_check',
        'label': 'Settlement count', 'calculation': 'count(${settlement_repeat})',
        'relevant': "${Has_Settlements} = 'yes'", 'constraint': '. >= 1',
        'constraint_message': 'Add at least one settlement, including its name and GPS coordinates, or select No.',
        'required': 'true', 'appearance': 'hidden',
    }.items():
        put(end + 1, key, value)

    choices = workbook['choices']
    choice_columns = {cell.value: cell.column for cell in choices[1]}
    for name, label in [('yes', 'Yes — add settlements'), ('no', 'No — community only')]:
        row = choices.max_row + 1
        for key, value in [('list_name', 'settlement_presence'), ('name', name), ('label', label)]:
            choices.cell(row, choice_columns[key], value)

    settings = workbook['settings']
    settings_columns = {cell.value: cell.column for cell in settings[1]}
    settings.cell(2, settings_columns['version'], '202611162144')
    settings.cell(2, settings_columns['form_title'], 'Amehnities Geo Microplanning · Communities & Settlements · v2026.11.16c')
    return workbook


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('destination')
    args = parser.parse_args()
    update_workbook(openpyxl.load_workbook(args.source)).save(args.destination)