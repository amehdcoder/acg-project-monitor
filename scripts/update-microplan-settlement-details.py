"""Extend the current published workbook with independent settlement evidence."""
from copy import copy
import re
import openpyxl

def finalize_workbook(w):
    """Repair published forms too; retain stable field names for Kobo ingestion."""
    s = w['survey']
    cols = {c.value: c.column for c in s[1]}
    def find(name):
        return next(i for i in range(2, s.max_row + 1) if s.cell(i, cols['name']).value == name)
    s.cell(find('group_eg0ly91'), cols['relevant'], "${Has_Settlements} = 'no'")
    # Ask the unique-person total once, alongside the disability types, not
    # again after CDD information and notes. Do not sum overlapping types.
    total = find('settlement_pwd_total')
    values = [c.value for c in s[total]]
    styles = [copy(c._style) for c in s[total]]
    s.delete_rows(total)
    position = find('settlement_Albinism') + 1
    s.insert_rows(position)
    for col, (value, style) in enumerate(zip(values, styles), 1):
        s.cell(position, col, value)._style = style
    choices = w['choices']; choice_cols = {c.value: c.column for c in choices[1]}
    source_type = s.cell(find('Source_of_Population_Data'), cols['type']).value
    source_list = source_type.split()[1]
    if not any(choices.cell(i, choice_cols['list_name']).value == source_list and choices.cell(i, choice_cols['name']).value == 'cdd_census_census_update' for i in range(2, choices.max_row + 1)):
        row = choices.max_row + 1
        for key, value in [('list_name', source_list), ('name', 'cdd_census_census_update'), ('label', 'CDD Census/Census Update')]:
            cell = choices.cell(row, choice_cols[key], value)
            cell._style = copy(choices.cell(2, choice_cols[key])._style)
    settings = w['settings']; cols = {c.value: c.column for c in settings[1]}
    settings.cell(2, cols['version'], '202611162255')
    settings.cell(2, cols['form_title'], 'Amehnities Geo Microplanning · Settlement Evidence · v2026.11.16f')
    return w

def update_workbook(w):
    s = w['survey']
    headers = [c.value for c in s[1]]
    rows = [dict(zip(headers, r)) for r in s.iter_rows(min_row=2, values_only=True)]
    by = {r['name']: r for r in rows if r.get('name')}
    if 'settlement_schema_version' in by:
        return finalize_workbook(w)
    first = next(i for i,r in enumerate(rows) if r.get('name') == 'group_eg0ly91')
    last = next(i for i,r in enumerate(rows) if r.get('name') == 'group_lz4vz64') + 2
    block = rows[first:last+1]
    names = {r['name'] for r in block if r.get('name')}
    names.add('Source_of_Population_Data')
    def translated(value):
        if not isinstance(value, str): return value
        return re.sub(r'\$\{([^}]+)\}', lambda m: '${settlement_'+m[1]+'}' if m[1] in names else m[0], value)
    def row(**kw): return {h:kw.get(h) for h in headers}
    additions = [
        row(type='calculate', name='settlement_schema_version', calculation="'details_v1'"),
        row(type='note', name='settlement_evidence_note', label='Settlement evidence · ${Settlement_Name}', hint='Record only residents and households of this settlement. Do not repeat the entire community population.'),
        row(type='text', name='settlement_mai_unguwa', label='Settlement leader / Mai Unguwa'),
        row(type='text', name='settlement_leader_phone', label='Settlement leader phone number'),
        {**by['Source_of_Population_Data'], 'name':'settlement_Source_of_Population_Data'},
    ]
    for original in block:
        r = {k:translated(v) for k,v in original.items()}
        if r.get('name'): r['name'] = 'settlement_'+r['name']
        if r.get('type') in ('integer',) or r.get('name') in ['settlement_Type_of_Terrain','settlement_Accessibility','settlement_Security_Clearance']:
            r['required'] = 'true'
        additions.append(r)
    # Total is not in the contiguous age/disability/CDD block's calculation order.
    # It is cloned there already, retaining the standard/Trachoma conditional sum.
    additions.append(row(type='integer', name='settlement_pwd_total', label='Total persons with disabilities (unique people)', required='true', constraint='. >= 0 and . <= ${settlement_Total_Population}', constraint_message='Enter a non-negative count no larger than the settlement population.', hint='Count each person once; a person may appear in more than one disability type.'))
    for r in additions:
        if (r.get('name') or '').startswith('settlement_') and r.get('type') == 'integer' and not r.get('constraint'):
            r['constraint'] = '. >= 0'
            r['constraint_message'] = 'Enter a non-negative whole number; use 0 only when confirmed.'
    start = next(i for i,r in enumerate(rows) if r.get('name') == 'settlement_repeat')
    end = next(i for i in range(start+1,len(rows)) if rows[i]['type'] == 'end_repeat')
    rows[end:end] = additions
    # Community measures describe community-only entries; settlement entries are
    # summed by the dashboard, never added to an inclusive community census.
    for r in rows:
        if r.get('name') in ['group_ra96m39','group_eh6ih14','group_jq2fc22','group_pi0rq96','Number_of_Households','Total_Population','trachoma_checkbox']:
            old = r.get('relevant')
            r['relevant'] = "${Has_Settlements} = 'no'" + (f' and ({old})' if old else '')
    s.delete_rows(2,s.max_row)
    for r in rows:
        s.append([r.get(h) for h in headers])
        for cell in s[s.max_row]:
            cell._style = copy(s.cell(1,cell.column)._style)
            cell.alignment = openpyxl.styles.Alignment(vertical='top', wrap_text=True)
    settings=w['settings']; cols={c.value:c.column for c in settings[1]}
    settings.cell(2,cols['version'],'202611162207')
    settings.cell(2,cols['form_title'],'Amehnities Geo Microplanning · Settlement Evidence · v2026.11.16d')
    return finalize_workbook(w)

if __name__ == '__main__':
    import sys
    update_workbook(openpyxl.load_workbook(sys.argv[1])).save(sys.argv[2])