import { memo, useId, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Landmark, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { BANKING_TEXT_MAX, bankNameKey, bankNameSchema, mergeBankNames, nigerianAccountNumberError } from '@/lib/microplanning/banking';

interface Props {
  kind: 'CDD' | 'FLHF';
  accountName: string;
  accountNumber: string;
  bank: string;
  banks: string[];
  onChange: (field: 'account_name' | 'account_number' | 'bank', value: string) => void;
  onAddBank: (name: string) => string;
}

const MicroplanBankingFields = memo(({ kind, accountName, accountNumber, bank, banks, onChange, onAddBank }: Props) => {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(60);
  const options = useMemo(() => mergeBankNames(banks, bank ? [bank] : []), [banks, bank]);
  const filtered = useMemo(() => options.filter(name => name.toLowerCase().includes(search.trim().toLowerCase())), [options, search]);
  const custom = bankNameSchema.safeParse(search);
  const canAdd = custom.success && !options.some(name => bankNameKey(name) === bankNameKey(custom.data));
  const error = nigerianAccountNumberError(accountNumber);
  const select = (value: string) => { onChange('bank', value); setOpen(false); setSearch(''); setLimit(60); };

  return <>
    <div className="col-span-full flex items-center gap-2 border-t border-border pt-3 mt-1">
      <Landmark className="h-4 w-4 text-primary" aria-hidden="true" />
      <h3 className="text-xs font-semibold">{kind} banking details <span className="font-normal text-muted-foreground">· Optional</span></h3>
    </div>
    <div className="microplan-field min-w-0 space-y-1">
      <Label htmlFor={`${id}-name`} className="text-xs font-medium text-muted-foreground">{kind} Account Name</Label>
      <Input id={`${id}-name`} value={accountName} onChange={e => onChange('account_name', e.target.value)} maxLength={BANKING_TEXT_MAX} autoComplete="off" placeholder="Account holder name" className="h-8 text-xs" />
    </div>
    <div className="microplan-field min-w-0 space-y-1">
      <Label htmlFor={`${id}-number`} className="text-xs font-medium text-muted-foreground">{kind} Account Number</Label>
      <Input id={`${id}-number`} value={accountNumber} onChange={e => onChange('account_number', e.target.value)} type="text" inputMode="numeric" maxLength={10} pattern="[0-9]{10}" autoComplete="off" spellCheck={false} placeholder="10-digit account number" aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className="h-8 text-xs tabular-nums" />
      {error && <p id={`${id}-error`} role="status" className="text-xs text-destructive">{error}</p>}
    </div>
    <div className="microplan-field min-w-0 space-y-1">
      <Label id={`${id}-bank-label`} className="text-xs font-medium text-muted-foreground">{kind} Bank</Label>
      <div className="flex min-w-0 gap-1">
        <Popover open={open} onOpenChange={value => { setOpen(value); if (!value) { setSearch(''); setLimit(60); } }}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-labelledby={`${id}-bank-label`} className="h-8 min-w-0 flex-1 justify-between px-2 text-xs font-normal">
              <span className={`min-w-0 truncate text-left ${bank ? 'text-foreground' : 'text-muted-foreground'}`}>{bank || 'Select bank'}</span>
              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="z-[10000] w-[360px] max-w-[calc(100vw-2rem)] p-0">
            <Command shouldFilter={false}>
              <CommandInput aria-label={`Search ${kind} banks`} placeholder="Search or add bank…" value={search} onValueChange={value => { setSearch(value); setLimit(60); }} maxLength={BANKING_TEXT_MAX} />
              <CommandList className="max-h-[280px]" onScroll={event => { const list = event.currentTarget; if (list.scrollHeight - list.scrollTop - list.clientHeight < 80) setLimit(current => Math.min(filtered.length, current + 60)); }}>
                {!filtered.length && !canAdd && <CommandEmpty>No bank found.</CommandEmpty>}
                {canAdd && <CommandGroup><CommandItem value={`add-${search}`} onSelect={() => { if (custom.success) select(onAddBank(custom.data)); }} className="min-h-11 text-primary">
                  <Plus className="mr-2 h-4 w-4 shrink-0" /><span className="break-words">Add “{search.trim()}”</span>
                </CommandItem></CommandGroup>}
                {!!filtered.length && <CommandGroup>{filtered.slice(0, limit).map(name => <CommandItem key={name} value={name} onSelect={() => select(name)} className="min-h-11 text-xs">
                  <Check className={`mr-2 h-4 w-4 shrink-0 text-primary ${bank === name ? 'opacity-100' : 'opacity-0'}`} /><span className="break-words">{name}</span>
                </CommandItem>)}</CommandGroup>}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {bank && <Button type="button" variant="ghost" size="icon" aria-label={`Clear ${kind} bank`} title={`Clear ${kind} bank`} className="h-8 w-8 shrink-0" onClick={() => onChange('bank', '')}><X className="h-3.5 w-3.5" /></Button>}
      </div>
    </div>
  </>;
});
MicroplanBankingFields.displayName = 'MicroplanBankingFields';
export default MicroplanBankingFields;