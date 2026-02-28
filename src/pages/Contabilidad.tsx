import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { contabilidadApi, type AcctEntity, type AcctCategory, type AcctPaymentAccount, type AcctTransaction, type BalanceRow, type PygRow, type AccountBalanceRow } from '../lib/contabilidadApi';
import {
  DollarSign,
  Plus,
  Edit,
  Trash2,
  X,
  BookOpen,
  BarChart3,
  Settings,
  Building2,
  Tag,
  CreditCard,
  Upload,
  Merge,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type MainTab = 'libro' | 'balance' | 'config';
type ConfigTab = 'entities' | 'categories' | 'accounts';

const PERIOD_PRESETS = [
  { id: 'all', label: 'Todo el tiempo' },
  { id: 'this-year', label: 'Este año' },
  { id: 'last-year', label: 'Año pasado' },
  { id: 'this-month', label: 'Este mes' },
  { id: 'last-month', label: 'Mes pasado' },
] as const;

function DateRangePicker({
  start,
  end,
  onStartChange,
  onEndChange,
  onPreset,
}: {
  start: string;
  end: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onPreset: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  const fmt = (s: string) => {
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : format(d, 'd MMM yyyy', { locale: es });
  };
  const badgeText = !start && !end
    ? 'Todo el tiempo'
    : start && end
      ? `${fmt(start)} – ${fmt(end)}`
      : start
        ? `Desde ${fmt(start)}`
        : end
          ? `Hasta ${fmt(end)}`
          : 'Seleccionar período';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 shadow-sm"
      >
        <Calendar className="w-4 h-4 text-gray-500" />
        <span>{badgeText}</span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 p-4 bg-white rounded-xl shadow-lg border border-gray-200">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {PERIOD_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onPreset(p.id); setOpen(false); }}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="pt-2 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => onStartChange(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
                  <input
                    type="date"
                    value={end}
                    onChange={(e) => onEndChange(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ConfigDetailSortBy = 'date' | 'entity' | 'category' | 'description' | 'account' | 'amount';

function ConfigDetailTable({
  transactions,
  showEntity = true,
  showCategory = true,
  onEditTransaction,
}: {
  transactions: AcctTransaction[];
  showEntity?: boolean;
  showCategory?: boolean;
  onEditTransaction?: (t: AcctTransaction) => void;
}) {
  const [sortBy, setSortBy] = useState<ConfigDetailSortBy>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (col: ConfigDetailSortBy) => {
    const isSame = sortBy === col;
    const newOrder = isSame ? (sortOrder === 'asc' ? 'desc' : 'asc') : (col === 'date' || col === 'amount' ? 'desc' : 'asc');
    setSortBy(col);
    setSortOrder(newOrder);
  };

  const sorted = [...transactions].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'date') {
      cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
    } else if (sortBy === 'entity') {
      cmp = (a.entity_name ?? '').localeCompare(b.entity_name ?? '', 'es');
    } else if (sortBy === 'category') {
      cmp = (a.category_name ?? '').localeCompare(b.category_name ?? '', 'es');
    } else if (sortBy === 'description') {
      cmp = (a.description ?? '').localeCompare(b.description ?? '', 'es');
    } else if (sortBy === 'account') {
      cmp = (a.payment_account_name ?? '').localeCompare(b.payment_account_name ?? '', 'es');
    } else {
      cmp = (a.amount ?? 0) - (b.amount ?? 0);
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  const SortBtn = ({ col, label }: { col: ConfigDetailSortBy; label: string }) => (
    <button type="button" onClick={() => handleSort(col)} className="flex items-center gap-1 hover:text-indigo-600">
      {label}
      {sortBy === col && (sortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />)}
    </button>
  );

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-600 border-b">
          <th className="py-2 pr-4"><SortBtn col="date" label="Fecha" /></th>
          {showEntity && <th className="py-2 pr-4"><SortBtn col="entity" label="Proyecto" /></th>}
          {showCategory && <th className="py-2 pr-4"><SortBtn col="category" label="Categoría" /></th>}
          <th className="py-2 pr-4"><SortBtn col="description" label="Descripción" /></th>
          <th className="py-2 pr-4"><SortBtn col="account" label="Cuenta" /></th>
          <th className="py-2 text-right"><SortBtn col="amount" label="Monto" /></th>
          {onEditTransaction && <th className="py-2 w-10"></th>}
        </tr>
      </thead>
      <tbody>
        {sorted.map((t) => (
          <tr key={t.id} className="border-b border-gray-100 last:border-0">
            <td className="py-2 pr-4">{format(new Date(t.date), 'dd/MM/yyyy', { locale: es })}</td>
            {showEntity && <td className="py-2 pr-4">{t.entity_name ?? '—'}</td>}
            {showCategory && <td className="py-2 pr-4">{t.category_name ?? '—'}</td>}
            <td className="py-2 pr-4 max-w-[200px] truncate">{t.description || '—'}</td>
            <td className="py-2 pr-4">{t.payment_account_name ?? '—'}</td>
            <td className={`py-2 text-right font-medium ${(t.amount ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {(t.amount ?? 0) >= 0 ? '+' : ''}{(t.amount ?? 0).toLocaleString(t.currency === 'COP' ? 'es-CO' : 'en-US', { minimumFractionDigits: t.currency === 'COP' ? 0 : 2 })} {t.currency || 'USD'}
            </td>
            {onEditTransaction && (
              <td className="py-2">
                <button type="button" onClick={() => onEditTransaction(t)} className="text-indigo-600 hover:text-indigo-800 p-1" title="Editar"><Edit className="w-4 h-4 inline" /></button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PygDetailPanel({
  transactions,
  onEditTransaction,
}: {
  transactions: AcctTransaction[];
  onEditTransaction?: (t: AcctTransaction) => void;
}) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Meses únicos ascendentes (izq a der)
  const months = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      set.add(format(new Date(t.date), 'yyyy-MM', { locale: es }));
    }
    return Array.from(set).sort();
  }, [transactions]);

  // Agrupar por categoría
  const byCategory = React.useMemo(() => {
    const map = new Map<string, AcctTransaction[]>();
    for (const t of transactions) {
      const k = t.category_name || 'Sin categoría';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    return map;
  }, [transactions]);

  const categories = Array.from(byCategory.keys()).sort((a, b) => {
    const sumA = byCategory.get(a)!.reduce((s, t) => s + Math.abs(t.amount ?? 0), 0);
    const sumB = byCategory.get(b)!.reduce((s, t) => s + Math.abs(t.amount ?? 0), 0);
    return sumB - sumA;
  });

  const getMonthSums = (list: AcctTransaction[]) => {
    const ing: Record<string, { usd: number; cop: number }> = {};
    const sal: Record<string, { usd: number; cop: number }> = {};
    for (const m of months) {
      ing[m] = { usd: 0, cop: 0 };
      sal[m] = { usd: 0, cop: 0 };
    }
    for (const t of list) {
      const m = format(new Date(t.date), 'yyyy-MM', { locale: es });
      const c = t.currency || 'USD';
      const amt = t.amount ?? 0;
      if (amt > 0) {
        if (c === 'USD') ing[m].usd += amt;
        else ing[m].cop += amt;
      } else {
        if (c === 'USD') sal[m].usd += Math.abs(amt);
        else sal[m].cop += Math.abs(amt);
      }
    }
    return { ing, sal };
  };

  const fmt = (n: number, curr: 'usd' | 'cop') =>
    curr === 'usd' ? n.toLocaleString('en-US', { minimumFractionDigits: 2 }) : n.toLocaleString('es-CO', { minimumFractionDigits: 0 });

  const totals = React.useMemo(() => {
    const { ing, sal } = getMonthSums(transactions);
    let totIngUsd = 0, totIngCop = 0, totSalUsd = 0, totSalCop = 0;
    for (const m of months) {
      totIngUsd += ing[m].usd;
      totIngCop += ing[m].cop;
      totSalUsd += sal[m].usd;
      totSalCop += sal[m].cop;
    }
    return { totIngUsd, totIngCop, totSalUsd, totSalCop, balanceUsd: totIngUsd - totSalUsd, balanceCop: totIngCop - totSalCop };
  }, [transactions, months]);

  const hasCop = transactions.some((t) => (t.currency || 'USD') === 'COP');
  const colsPerMonth = hasCop ? 4 : 2;
  const colsTotal = hasCop ? 4 : 2;

  if (transactions.length === 0) {
    return <div className="text-sm text-gray-500 py-2">No hay transacciones en este período.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[600px]">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-700 sticky left-0 bg-gray-50 z-10 w-[1%] max-w-[160px]">Categoría</th>
            {months.map((m) => {
              const [y, mo] = m.split('-');
              const label = format(new Date(parseInt(y, 10), parseInt(mo, 10) - 1, 1), 'MMM yy', { locale: es });
              return (
                <th key={m} colSpan={colsPerMonth} className="px-1 py-2 text-center font-medium text-gray-700 border-l">
                  {label}
                </th>
              );
            })}
            <th colSpan={colsTotal} className="px-1 py-2 text-center font-medium text-gray-700 border-l bg-gray-100">Total</th>
          </tr>
          <tr className="bg-gray-50">
            <th className="px-3 py-1 text-xs text-gray-500 sticky left-0 bg-gray-50 z-10"></th>
            {months.map((m) => (
              <React.Fragment key={m}>
                <th className="px-1 py-1 text-right text-xs text-emerald-600 w-16 border-l">Ing</th>
                <th className="px-1 py-1 text-right text-xs text-red-600 w-16">Sal</th>
                {hasCop && (
                  <>
                    <th className="px-1 py-1 text-right text-xs text-emerald-600 w-16 border-l border-gray-200">Ing</th>
                    <th className="px-1 py-1 text-right text-xs text-red-600 w-16">Sal</th>
                  </>
                )}
              </React.Fragment>
            ))}
            <th className="px-1 py-1 text-right text-xs text-emerald-600 w-16 border-l">Ing</th>
            <th className="px-1 py-1 text-right text-xs text-red-600 w-16">Sal</th>
            {hasCop && (
              <>
                <th className="px-1 py-1 text-right text-xs text-emerald-600 w-16 border-l border-gray-200">Ing</th>
                <th className="px-1 py-1 text-right text-xs text-red-600 w-16">Sal</th>
              </>
            )}
          </tr>
          <tr className="bg-gray-50 text-xs text-gray-500">
            <th className="px-3 py-1 sticky left-0 bg-gray-50 z-10"></th>
            {months.flatMap((m) => [
              <th key={`${m}-u1`} className="px-1 py-0.5 text-right border-l">USD</th>,
              <th key={`${m}-u2`} className="px-1 py-0.5 text-right">USD</th>,
              ...(hasCop ? [<th key={`${m}-c1`} className="px-1 py-0.5 text-right border-l">COP</th>, <th key={`${m}-c2`} className="px-1 py-0.5 text-right">COP</th>] : []),
            ])}
            <th className="px-1 py-0.5 text-right border-l">USD</th>
            <th className="px-1 py-0.5 text-right">USD</th>
            {hasCop && (
              <>
                <th className="px-1 py-0.5 text-right border-l">COP</th>
                <th className="px-1 py-0.5 text-right">COP</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => {
            const items = byCategory.get(cat)!;
            const { ing, sal } = getMonthSums(items);
            const isExpanded = expandedCategories.has(cat);
            return (
              <React.Fragment key={cat}>
                <tr
                  onClick={() => toggleCategory(cat)}
                  className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer select-none group"
                >
                  <td className="px-3 py-2 font-medium sticky left-0 bg-white group-hover:bg-gray-50">
                    <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />}
                      {cat}
                    </span>
                  </td>
                  {months.map((m) => (
                    <React.Fragment key={m}>
                      <td className="px-1 py-2 text-right text-emerald-600 border-l">{ing[m].usd ? fmt(ing[m].usd, 'usd') : '—'}</td>
                      <td className="px-1 py-2 text-right text-red-600">{sal[m].usd ? fmt(sal[m].usd, 'usd') : '—'}</td>
                      {hasCop && (
                        <>
                          <td className="px-1 py-2 text-right text-emerald-600 border-l">{ing[m].cop ? fmt(ing[m].cop, 'cop') : '—'}</td>
                          <td className="px-1 py-2 text-right text-red-600">{sal[m].cop ? fmt(sal[m].cop, 'cop') : '—'}</td>
                        </>
                      )}
                    </React.Fragment>
                  ))}
                  <td className="px-1 py-2 text-right text-emerald-600 border-l font-medium">
                    {fmt(months.reduce((s, m) => s + (ing[m]?.usd ?? 0), 0), 'usd')}
                  </td>
                  <td className="px-1 py-2 text-right text-red-600 font-medium">
                    {fmt(months.reduce((s, m) => s + (sal[m]?.usd ?? 0), 0), 'usd')}
                  </td>
                  {hasCop && (
                    <>
                      <td className="px-1 py-2 text-right text-emerald-600 border-l font-medium">
                        {fmt(months.reduce((s, m) => s + (ing[m]?.cop ?? 0), 0), 'cop')}
                      </td>
                      <td className="px-1 py-2 text-right text-red-600 font-medium">
                        {fmt(months.reduce((s, m) => s + (sal[m]?.cop ?? 0), 0), 'cop')}
                      </td>
                    </>
                  )}
                </tr>
                {isExpanded &&
                  items.map((t) => {
                    const m = format(new Date(t.date), 'yyyy-MM', { locale: es });
                    const amt = t.amount ?? 0;
                    const isPos = amt > 0;
                    const curr = t.currency || 'USD';
                    return (
                      <tr key={t.id} className="border-t border-gray-50 bg-gray-50/50">
                        <td className="px-3 py-1.5 pl-8 text-gray-600 sticky left-0 bg-gray-50/50" onClick={(e) => e.stopPropagation()}>
                          <span className="flex items-center gap-2 truncate max-w-[140px]">
                            {format(new Date(t.date), 'dd MMM', { locale: es })} — {t.description || 'Sin descripción'}
                            {onEditTransaction && (
                              <button type="button" onClick={() => onEditTransaction(t)} className="text-indigo-600 hover:text-indigo-800 p-0.5 shrink-0" title="Editar"><Edit className="w-3.5 h-3.5 inline" /></button>
                            )}
                          </span>
                        </td>
                        {months.map((mo) => (
                          <React.Fragment key={mo}>
                            {mo === m ? (
                              <>
                                <td className={`px-1 py-1.5 text-right text-sm ${isPos ? 'text-emerald-600' : 'text-gray-400'}`}>{isPos && curr === 'USD' ? fmt(amt, 'usd') : '—'}</td>
                                <td className={`px-1 py-1.5 text-right text-sm ${!isPos ? 'text-red-600' : 'text-gray-400'}`}>{!isPos && curr === 'USD' ? fmt(Math.abs(amt), 'usd') : '—'}</td>
                                {hasCop && (
                                  <>
                                    <td className={`px-1 py-1.5 text-right text-sm border-l ${isPos ? 'text-emerald-600' : 'text-gray-400'}`}>{isPos && curr === 'COP' ? fmt(amt, 'cop') : '—'}</td>
                                    <td className={`px-1 py-1.5 text-right text-sm ${!isPos ? 'text-red-600' : 'text-gray-400'}`}>{!isPos && curr === 'COP' ? fmt(Math.abs(amt), 'cop') : '—'}</td>
                                  </>
                                )}
                              </>
                            ) : (
                              <>
                                <td className="px-1 py-1.5 text-right text-gray-300">—</td>
                                <td className="px-1 py-1.5 text-right text-gray-300">—</td>
                                {hasCop && (
                                  <>
                                    <td className="px-1 py-1.5 text-right text-gray-300 border-l">—</td>
                                    <td className="px-1 py-1.5 text-right text-gray-300">—</td>
                                  </>
                                )}
                              </>
                            )}
                          </React.Fragment>
                        ))}
                        <td colSpan={colsTotal} className="px-1 py-1.5 border-l" />
                      </tr>
                    );
                  })}
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot className="bg-gray-100 font-semibold">
          <tr>
            <td className="px-3 py-2 sticky left-0 bg-gray-100">Total mes</td>
            {months.map((m) => {
              const { ing, sal } = getMonthSums(transactions.filter((t) => format(new Date(t.date), 'yyyy-MM', { locale: es }) === m));
              return (
                <React.Fragment key={m}>
                  <td className="px-1 py-2 text-right text-emerald-700 border-l">{ing[m].usd ? fmt(ing[m].usd, 'usd') : '—'}</td>
                  <td className="px-1 py-2 text-right text-red-700">{sal[m].usd ? fmt(sal[m].usd, 'usd') : '—'}</td>
                  {hasCop && (
                    <>
                      <td className="px-1 py-2 text-right text-emerald-700 border-l">{ing[m].cop ? fmt(ing[m].cop, 'cop') : '—'}</td>
                      <td className="px-1 py-2 text-right text-red-700">{sal[m].cop ? fmt(sal[m].cop, 'cop') : '—'}</td>
                    </>
                  )}
                </React.Fragment>
              );
            })}
            <td className="px-1 py-2 text-right text-emerald-700 border-l">{fmt(totals.totIngUsd, 'usd')}</td>
            <td className="px-1 py-2 text-right text-red-700">{fmt(totals.totSalUsd, 'usd')}</td>
            {hasCop && (
              <>
                <td className="px-1 py-2 text-right text-emerald-700 border-l">{fmt(totals.totIngCop, 'cop')}</td>
                <td className="px-1 py-2 text-right text-red-700">{fmt(totals.totSalCop, 'cop')}</td>
              </>
            )}
          </tr>
          <tr className="bg-indigo-50">
            <td className="px-3 py-2 sticky left-0 bg-indigo-50 font-medium">Balance global</td>
            {months.map((m) => {
              const { ing, sal } = getMonthSums(transactions.filter((t) => format(new Date(t.date), 'yyyy-MM', { locale: es }) === m));
              const balUsd = ing[m].usd - sal[m].usd;
              const balCop = ing[m].cop - sal[m].cop;
              return (
                <React.Fragment key={m}>
                  <td colSpan={2} className={`px-1 py-2 text-right font-medium border-l ${balUsd >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {balUsd >= 0 ? '+' : ''}{fmt(balUsd, 'usd')} USD
                  </td>
                  {hasCop && (
                    <td colSpan={2} className={`px-1 py-2 text-right font-medium ${balCop >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {balCop >= 0 ? '+' : ''}{fmt(balCop, 'cop')} COP
                    </td>
                  )}
                </React.Fragment>
              );
            })}
            <td colSpan={2} className={`px-1 py-2 text-right font-medium border-l ${totals.balanceUsd >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {totals.balanceUsd >= 0 ? '+' : ''}{fmt(totals.balanceUsd, 'usd')} USD
            </td>
            {hasCop && (
              <td colSpan={2} className={`px-1 py-2 text-right font-medium ${totals.balanceCop >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {totals.balanceCop >= 0 ? '+' : ''}{fmt(totals.balanceCop, 'cop')} COP
              </td>
            )}
          </tr>
          <tr className="bg-amber-50">
            <td className="px-3 py-2 sticky left-0 bg-amber-50 font-medium">Pendiente por liquidar</td>
            {months.map((m) => (
              <td key={m} colSpan={colsPerMonth} className="px-1 py-2 text-center text-gray-400 border-l text-xs">—</td>
            ))}
            <td colSpan={colsTotal} className="px-1 py-2 border-l">
              <span className={`font-medium ${totals.balanceUsd >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {totals.balanceUsd >= 0 ? '+' : ''}{fmt(totals.balanceUsd, 'usd')} USD
              </span>
              {hasCop && totals.balanceCop !== 0 && (
                <span className={`ml-2 font-medium ${totals.balanceCop >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {totals.balanceCop >= 0 ? '+' : ''}{fmt(totals.balanceCop, 'cop')} COP
                </span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function Contabilidad() {
  const { isAdmin, user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<MainTab>('libro');
  const [configTab, setConfigTab] = useState<ConfigTab>('entities');

  const [entities, setEntities] = useState<AcctEntity[]>([]);
  const [categories, setCategories] = useState<AcctCategory[]>([]);
  const [accounts, setAccounts] = useState<AcctPaymentAccount[]>([]);
  const [transactions, setTransactions] = useState<AcctTransaction[]>([]);
  const [balanceData, setBalanceData] = useState<{ rows: BalanceRow[]; total_usd: number; total_cop: number } | null>(null);
  const [pygData, setPygData] = useState<{ rows: PygRow[]; total_usd: { ingresos: number; gastos: number; resultado: number }; total_cop: { ingresos: number; gastos: number; resultado: number } } | null>(null);
  const [accountBalancesData, setAccountBalancesData] = useState<{ rows: AccountBalanceRow[]; total_usd: number; total_cop: number } | null>(null);
  const [balanceView, setBalanceView] = useState<'balance' | 'pyg' | 'accounts'>('balance');

  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');

  const [filterStart, setFilterStart] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [filterEnd, setFilterEnd] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterEntity, setFilterEntity] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterAccount, setFilterAccount] = useState('');

  const [balanceStart, setBalanceStart] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [balanceEnd, setBalanceEnd] = useState(() => new Date().toISOString().split('T')[0]);

  const [currentEntity, setCurrentEntity] = useState<Partial<AcctEntity>>({ name: '', type: 'project', sort_order: 0 });
  const [currentCategory, setCurrentCategory] = useState<Partial<AcctCategory>>({ name: '', type: 'expense', parent_id: null });
  const [currentAccount, setCurrentAccount] = useState<Partial<AcctPaymentAccount>>({ name: '', currency: 'USD' });
  const [currentTransaction, setCurrentTransaction] = useState<Partial<AcctTransaction>>({
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    currency: 'USD',
    type: 'expense',
    entity_id: null,
    category_id: null,
    payment_account_id: '',
    description: '',
  });
  const [error, setError] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; entities: number; categories: number; accounts: number } | null>(null);
  const [mergeSourceEntity, setMergeSourceEntity] = useState<AcctEntity | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeSourceCategory, setMergeSourceCategory] = useState<AcctCategory | null>(null);
  const [mergeCategoryTargetId, setMergeCategoryTargetId] = useState('');
  const [sortDateOrder, setSortDateOrder] = useState<'asc' | 'desc'>('desc');
  const [pygExpandedEntity, setPygExpandedEntity] = useState<string | null>(null);
  const [pygSortBy, setPygSortBy] = useState<'entity' | 'ing_usd' | 'gastos_usd' | 'resultado_usd' | 'ing_cop' | 'gastos_cop' | 'resultado_cop'>('resultado_usd');
  const [pygSortOrder, setPygSortOrder] = useState<'asc' | 'desc'>('desc');
  const [pygProjectsOnly, setPygProjectsOnly] = useState(true);
  const [pygDetailTransactions, setPygDetailTransactions] = useState<AcctTransaction[]>([]);
  const [pygDetailLoading, setPygDetailLoading] = useState(false);
  const [configEntityExpanded, setConfigEntityExpanded] = useState<string | null>(null);
  const [configCategoryExpanded, setConfigCategoryExpanded] = useState<string | null>(null);
  const [categorySortBy, setCategorySortBy] = useState<'name' | 'transactions'>('transactions');
  const [categorySortOrder, setCategorySortOrder] = useState<'asc' | 'desc'>('desc');
  const [entitySortBy, setEntitySortBy] = useState<'name' | 'type'>('name');
  const [entitySortOrder, setEntitySortOrder] = useState<'asc' | 'desc'>('asc');
  const [configDetailTransactions, setConfigDetailTransactions] = useState<AcctTransaction[]>([]);
  const [configDetailLoading, setConfigDetailLoading] = useState(false);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsPageSize, setTransactionsPageSize] = useState(25);
  const [showSelectAllModal, setShowSelectAllModal] = useState(false);
  const [categorySearchFilter, setCategorySearchFilter] = useState('');
  const [modalForTransaction, setModalForTransaction] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    fetchEntities();
    fetchCategories();
    fetchAccounts();
  }, [isAdmin]);

  useEffect(() => {
    if (activeTab === 'config') {
      setConfigEntityExpanded(null);
      setConfigCategoryExpanded(null);
      setConfigDetailTransactions([]);
    }
  }, [activeTab, configTab]);

  useEffect(() => {
    setTransactionsPage(1);
  }, [filterStart, filterEnd, filterEntity, filterCategory, filterAccount]);

  useEffect(() => {
    if (!showModal) {
      setCategorySearchFilter('');
      setModalForTransaction(false);
    }
  }, [showModal]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab === 'libro') fetchTransactions();
    if (activeTab === 'balance') {
      if (balanceView === 'balance') fetchBalance();
      else if (balanceView === 'pyg') fetchPyg();
      else fetchAccountBalances();
    }
  }, [isAdmin, activeTab, balanceView, filterStart, filterEnd, filterEntity, filterCategory, filterAccount, balanceStart, balanceEnd, pygProjectsOnly]);

  async function fetchEntities() {
    try {
      const data = await contabilidadApi.getEntities();
      setEntities(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar entidades');
    }
  }
  async function fetchCategories() {
    try {
      const data = await contabilidadApi.getCategories();
      setCategories(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar categorías');
    }
  }
  async function fetchAccounts() {
    try {
      const data = await contabilidadApi.getPaymentAccounts();
      setAccounts(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar cuentas');
    }
  }
  async function fetchTransactions() {
    setLoading(true);
    try {
      const params: { start?: string; end?: string; entity_id?: string; category_id?: string; payment_account_id?: string } = {};
      if (filterStart) params.start = filterStart;
      if (filterEnd) params.end = filterEnd;
      if (filterEntity) params.entity_id = filterEntity;
      if (filterCategory) params.category_id = filterCategory;
      if (filterAccount) params.payment_account_id = filterAccount;
      const data = await contabilidadApi.getTransactions(params);
      setTransactions(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar transacciones');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }
  async function fetchBalance() {
    setLoading(true);
    try {
      const params: { start?: string; end?: string } = {};
      if (balanceStart) params.start = balanceStart;
      if (balanceEnd) params.end = balanceEnd;
      const data = await contabilidadApi.getBalance(params);
      setBalanceData(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar balance');
      setBalanceData(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPyg() {
    setLoading(true);
    try {
      const params: { start?: string; end?: string; projects_only?: boolean } = {};
      if (balanceStart) params.start = balanceStart;
      if (balanceEnd) params.end = balanceEnd;
      params.projects_only = pygProjectsOnly;
      const data = await contabilidadApi.getPyg(params);
      setPygData(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar P&G');
      setPygData(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPygDetail(entityId: string | null) {
    if (!entityId) return;
    setPygDetailLoading(true);
    try {
      const params: { start?: string; end?: string; entity_id?: string } = {};
      if (balanceStart) params.start = balanceStart;
      if (balanceEnd) params.end = balanceEnd;
      params.entity_id = entityId;
      const data = await contabilidadApi.getTransactions(params);
      setPygDetailTransactions(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar detalle');
      setPygDetailTransactions([]);
    } finally {
      setPygDetailLoading(false);
    }
  }

  function togglePygExpand(row: PygRow) {
    const key = row.entity_id ?? 'sin-asignar';
    if (pygExpandedEntity === key) {
      setPygExpandedEntity(null);
      setPygDetailTransactions([]);
    } else {
      setPygExpandedEntity(key);
      fetchPygDetail(row.entity_id ?? null);
    }
  }

  async function fetchConfigDetail(type: 'entity' | 'category', id: string) {
    setConfigDetailLoading(true);
    try {
      const params = type === 'entity' ? { entity_id: id } : { category_id: id };
      const data = await contabilidadApi.getTransactions(params);
      setConfigDetailTransactions(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar detalle');
      setConfigDetailTransactions([]);
    } finally {
      setConfigDetailLoading(false);
    }
  }

  function toggleConfigEntityExpand(e: AcctEntity) {
    if (configEntityExpanded === e.id) {
      setConfigEntityExpanded(null);
      setConfigDetailTransactions([]);
    } else {
      setConfigEntityExpanded(e.id);
      setConfigCategoryExpanded(null);
      fetchConfigDetail('entity', e.id);
    }
  }

  function toggleConfigCategoryExpand(c: AcctCategory) {
    if (configCategoryExpanded === c.id) {
      setConfigCategoryExpanded(null);
      setConfigDetailTransactions([]);
    } else {
      setConfigCategoryExpanded(c.id);
      setConfigEntityExpanded(null);
      fetchConfigDetail('category', c.id);
    }
  }

  async function fetchAccountBalances() {
    setLoading(true);
    try {
      const data = await contabilidadApi.getAccountBalances();
      setAccountBalancesData(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar balance de cuentas');
      setAccountBalancesData(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEntity(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (modalMode === 'create') {
        await contabilidadApi.createEntity(
          { name: currentEntity.name!, type: currentEntity.type!, sort_order: currentEntity.sort_order ?? 0 },
          currentUser?.id
        );
        toast.success('Entidad creada');
      } else {
        const res = await contabilidadApi.updateEntity(
          currentEntity.id!,
          { name: (currentEntity.name ?? '').trim(), type: currentEntity.type, sort_order: currentEntity.sort_order },
          currentUser?.id
        );
        const merged = (res as { _merged?: boolean; merged_count?: number })._merged;
        toast.success(merged ? `Entidad fusionada (${(res as { merged_count?: number }).merged_count ?? 0} transacciones reasignadas)` : 'Entidad actualizada');
      }
      setShowModal(false);
      setCurrentEntity({ name: '', type: 'project', sort_order: 0 });
      fetchEntities();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }
  async function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (modalMode === 'create') {
        await contabilidadApi.createCategory(
          { name: currentCategory.name!, type: currentCategory.type!, parent_id: currentCategory.parent_id ?? null },
          currentUser?.id
        );
        toast.success('Categoría creada');
      } else {
        const res = await contabilidadApi.updateCategory(
          currentCategory.id!,
          { name: (currentCategory.name ?? '').trim(), type: currentCategory.type, parent_id: currentCategory.parent_id ?? null },
          currentUser?.id
        );
        const merged = (res as { _merged?: boolean; merged_count?: number })._merged;
        toast.success(merged ? `Categoría fusionada (${(res as { merged_count?: number }).merged_count ?? 0} transacciones reasignadas)` : 'Categoría actualizada');
      }
      setShowModal(false);
      setCurrentCategory({ name: '', type: 'expense', parent_id: null });
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }
  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (modalMode === 'create') {
        await contabilidadApi.createPaymentAccount(
          { name: currentAccount.name!, currency: currentAccount.currency ?? 'USD' },
          currentUser?.id
        );
        toast.success('Cuenta creada');
      } else {
        await contabilidadApi.updatePaymentAccount(
          currentAccount.id!,
          { name: currentAccount.name, currency: currentAccount.currency ?? 'USD' },
          currentUser?.id
        );
        toast.success('Cuenta actualizada');
      }
      setShowModal(false);
      setCurrentAccount({ name: '', currency: 'USD' });
      fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }
  async function handleSaveTransaction(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (modalMode === 'create') {
        await contabilidadApi.createTransaction(
          {
            date: currentTransaction.date!,
            amount: Number(currentTransaction.amount),
            currency: currentTransaction.currency ?? 'USD',
            type: currentTransaction.type!,
            entity_id: currentTransaction.entity_id || null,
            category_id: currentTransaction.category_id || null,
            payment_account_id: currentTransaction.payment_account_id!,
            description: currentTransaction.description ?? '',
          },
          currentUser?.id
        );
        toast.success('Transacción creada');
      } else {
        await contabilidadApi.updateTransaction(
          currentTransaction.id!,
          {
            date: currentTransaction.date,
            amount: Number(currentTransaction.amount),
            currency: currentTransaction.currency ?? 'USD',
            type: currentTransaction.type,
            entity_id: currentTransaction.entity_id ?? null,
            category_id: currentTransaction.category_id ?? null,
            payment_account_id: currentTransaction.payment_account_id,
            description: currentTransaction.description ?? '',
          },
          currentUser?.id
        );
        toast.success('Transacción actualizada');
      }
      setShowModal(false);
      setCurrentTransaction({
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        currency: 'USD',
        type: 'expense',
        entity_id: null,
        category_id: null,
        payment_account_id: '',
        description: '',
      });
      fetchTransactions();
      if (modalForTransaction && configEntityExpanded) fetchConfigDetail('entity', configEntityExpanded);
      if (modalForTransaction && configCategoryExpanded) fetchConfigDetail('category', configCategoryExpanded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function handleDeleteEntity(id: string) {
    if (!window.confirm('¿Eliminar esta entidad?')) return;
    try {
      await contabilidadApi.deleteEntity(id, currentUser?.id);
      toast.success('Entidad eliminada');
      fetchEntities();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar');
    }
  }

  async function handleMergeEntity() {
    if (!mergeSourceEntity || !mergeTargetId || mergeTargetId === mergeSourceEntity.id) {
      toast.error('Selecciona una entidad destino diferente');
      return;
    }
    try {
      const result = await contabilidadApi.mergeEntity(mergeSourceEntity.id, mergeTargetId, currentUser?.id);
      toast.success(`${result.merged} transacciones reasignadas. Entidad "${mergeSourceEntity.name}" fusionada.`);
      setMergeSourceEntity(null);
      setMergeTargetId('');
      fetchEntities();
      fetchTransactions();
      if (activeTab === 'balance') fetchBalance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al fusionar');
    }
  }
  async function handleDeleteCategory(id: string) {
    if (!window.confirm('¿Eliminar esta categoría?')) return;
    try {
      await contabilidadApi.deleteCategory(id, currentUser?.id);
      toast.success('Categoría eliminada');
      fetchCategories();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar');
    }
  }

  async function handleMergeCategory() {
    if (!mergeSourceCategory || !mergeCategoryTargetId || mergeCategoryTargetId === mergeSourceCategory.id) {
      toast.error('Selecciona una categoría destino diferente');
      return;
    }
    try {
      const result = await contabilidadApi.mergeCategory(mergeSourceCategory.id, mergeCategoryTargetId, currentUser?.id);
      toast.success(`${result.merged} transacciones reasignadas. Categoría "${mergeSourceCategory.name}" fusionada.`);
      setMergeSourceCategory(null);
      setMergeCategoryTargetId('');
      fetchCategories();
      fetchTransactions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al fusionar');
    }
  }
  async function handleDeleteAccount(id: string) {
    if (!window.confirm('¿Eliminar esta cuenta?')) return;
    try {
      await contabilidadApi.deletePaymentAccount(id, currentUser?.id);
      toast.success('Cuenta eliminada');
      fetchAccounts();
    } catch (e) {
      toast.error('Error al eliminar');
    }
  }
  async function handleDeleteTransaction(id: string) {
    if (!window.confirm('¿Eliminar esta transacción?')) return;
    try {
      await contabilidadApi.deleteTransaction(id, currentUser?.id);
      toast.success('Transacción eliminada');
      fetchTransactions();
    } catch (e) {
      toast.error('Error al eliminar');
    }
  }

  async function handleDeleteSelected() {
    const ids = Array.from(selectedTransactionIds).filter((id) => transactions.some((t) => t.id === id));
    if (ids.length === 0) return;
    if (!window.confirm(`¿Eliminar ${ids.length} transacción(es) seleccionada(s)?`)) return;
    try {
      await Promise.all(ids.map((id) => contabilidadApi.deleteTransaction(id, currentUser?.id)));
      toast.success(`${ids.length} transacción(es) eliminada(s)`);
      setSelectedTransactionIds(new Set());
      fetchTransactions();
    } catch (e) {
      toast.error('Error al eliminar');
    }
  }

  function toggleSelectTransaction(id: string) {
    setSelectedTransactionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sortedTransactions = React.useMemo(
    () =>
      [...transactions].sort((a, b) => {
        const da = new Date(a.date).getTime();
        const db = new Date(b.date).getTime();
        return sortDateOrder === 'desc' ? db - da : da - db;
      }),
    [transactions, sortDateOrder]
  );

  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / transactionsPageSize));
  const paginatedTransactions = sortedTransactions.slice(
    (transactionsPage - 1) * transactionsPageSize,
    transactionsPage * transactionsPageSize
  );

  const allOnPageSelected = paginatedTransactions.length > 0 && paginatedTransactions.every((t) => selectedTransactionIds.has(t.id));
  const allTotalSelected = sortedTransactions.length > 0 && sortedTransactions.every((t) => selectedTransactionIds.has(t.id));
  const hasMultiplePages = sortedTransactions.length > transactionsPageSize;

  function handleSelectAllClick() {
    if (allTotalSelected) {
      setSelectedTransactionIds(new Set());
      return;
    }
    if (hasMultiplePages) {
      setShowSelectAllModal(true);
    } else {
      setSelectedTransactionIds(new Set(paginatedTransactions.map((t) => t.id)));
    }
  }

  function selectAllPage() {
    setSelectedTransactionIds(new Set(paginatedTransactions.map((t) => t.id)));
    setShowSelectAllModal(false);
  }

  function selectAllTotal() {
    setSelectedTransactionIds(new Set(sortedTransactions.map((t) => t.id)));
    setShowSelectAllModal(false);
  }

  async function handleImportCsv() {
    if (!importCsvText.trim()) {
      toast.error('Pega el contenido del CSV');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const result = await contabilidadApi.importCsv(importCsvText, { default_currency: 'USD' }, currentUser?.id);
      setImportResult(result);
      toast.success(`Importadas ${result.created} transacciones`);
      fetchEntities();
      fetchCategories();
      fetchAccounts();
      fetchTransactions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al importar');
    } finally {
      setImporting(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h2 className="text-lg font-medium text-yellow-800">Acceso restringido</h2>
          <p className="text-yellow-700">Solo administradores pueden acceder a la contabilidad.</p>
        </div>
      </div>
    );
  }

  const mainTabs = [
    { id: 'libro' as MainTab, label: 'Libro mayor', icon: BookOpen },
    { id: 'balance' as MainTab, label: 'Balance', icon: BarChart3 },
    { id: 'config' as MainTab, label: 'Configuración', icon: Settings },
  ];

  const configTabs = [
    { id: 'entities' as ConfigTab, label: 'Entidades', icon: Building2 },
    { id: 'categories' as ConfigTab, label: 'Categorías', icon: Tag },
    { id: 'accounts' as ConfigTab, label: 'Cuentas de pago', icon: CreditCard },
  ];

  const now = new Date();
  const year = now.getFullYear();
  const applyPeriodPreset = (preset: string, target: 'libro' | 'balance') => {
    const setStart = target === 'libro' ? setFilterStart : setBalanceStart;
    const setEnd = target === 'libro' ? setFilterEnd : setBalanceEnd;
    switch (preset) {
      case 'all':
        setStart('');
        setEnd('');
        break;
      case 'this-year':
        setStart(`${year}-01-01`);
        setEnd(now.toISOString().split('T')[0]);
        break;
      case 'last-year':
        setStart(`${year - 1}-01-01`);
        setEnd(`${year - 1}-12-31`);
        break;
      case 'this-month':
        setStart(new Date(year, now.getMonth(), 1).toISOString().split('T')[0]);
        setEnd(now.toISOString().split('T')[0]);
        break;
      case 'last-month':
        const lastMonth = now.getMonth() - 1;
        const lastMonthYear = lastMonth < 0 ? year - 1 : year;
        const lastMonthNum = lastMonth < 0 ? 11 : lastMonth;
        setStart(new Date(lastMonthYear, lastMonthNum, 1).toISOString().split('T')[0]);
        setEnd(new Date(lastMonthYear, lastMonthNum + 1, 0).toISOString().split('T')[0]);
        break;
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <DollarSign className="w-7 h-7" />
            Contabilidad
          </h1>
          <p className="text-gray-600 mt-1">Libro mayor, balance por entidad y utilidad distribuible</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {mainTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 -mb-px ${
              activeTab === t.id ? 'border-indigo-600 text-indigo-600 font-medium' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'libro' && (
        <div>
          <div className="flex flex-wrap gap-4 mb-4 items-end">
            <DateRangePicker
              start={filterStart}
              end={filterEnd}
              onStartChange={setFilterStart}
              onEndChange={setFilterEnd}
              onPreset={(id) => applyPeriodPreset(id, 'libro')}
            />
            <div>
              <label className="block text-sm text-gray-600 mb-1">Entidad</label>
              <select
                value={filterEntity}
                onChange={(e) => setFilterEntity(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm min-w-[160px]"
              >
                <option value="">Todas</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Categoría</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm min-w-[160px]"
              >
                <option value="">Todas</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Cuenta</label>
              <select
                value={filterAccount}
                onChange={(e) => setFilterAccount(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm min-w-[160px]"
              >
                <option value="">Todas</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            {selectedTransactionIds.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200 flex items-center gap-2"
              >
                <Trash2 className="w-5 h-5" />
                Borrar {selectedTransactionIds.size} seleccionada(s)
              </button>
            )}
            <button
              onClick={() => setShowImportModal(true)}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-2"
            >
              <Upload className="w-5 h-5" />
              Importar CSV
            </button>
            <button
              onClick={() => {
                if (accounts.length === 0) {
                  toast.error('Crea al menos una cuenta de pago en Configuración');
                  return;
                }
                setCurrentTransaction({
                  date: new Date().toISOString().split('T')[0],
                  amount: 0,
                  currency: 'USD',
                  type: 'expense',
                  entity_id: null,
                  category_id: null,
                  payment_account_id: accounts[0]?.id ?? '',
                  description: '',
                });
                setModalMode('create');
                setShowModal(true);
              }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Nueva transacción
            </button>
          </div>

          {loading ? (
            <div className="animate-pulse h-48 bg-gray-200 rounded-lg" />
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allTotalSelected || allOnPageSelected}
                        onChange={handleSelectAllClick}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">
                      <button
                        onClick={() => setSortDateOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
                        className="flex items-center gap-1 hover:text-indigo-600"
                      >
                        Fecha
                        {sortDateOrder === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Tipo</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Entidad</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Categoría</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Descripción</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Cuenta</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-700">Monto</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTransactions.map((t) => (
                    <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedTransactionIds.has(t.id)}
                          onChange={() => toggleSelectTransaction(t.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-6 py-3">{format(new Date(t.date), 'dd/MM/yyyy', { locale: es })}</td>
                      <td className="px-6 py-3 capitalize">{t.type}</td>
                      <td className="px-6 py-3">{t.entity_name ?? '—'}</td>
                      <td className="px-6 py-3">{t.category_name ?? '—'}</td>
                      <td className="px-6 py-3 max-w-[200px] truncate">{t.description || '—'}</td>
                      <td className="px-6 py-3">{t.payment_account_name ?? '—'}</td>
                      <td className={`px-6 py-3 text-right font-medium ${t.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {t.amount >= 0 ? '+' : ''}{t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {t.currency ?? 'USD'}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button onClick={() => { setCurrentTransaction(t); setModalMode('edit'); setShowModal(true); }} className="text-indigo-600 hover:text-indigo-800 p-1"><Edit className="w-4 h-4 inline" /></button>
                        <button onClick={() => handleDeleteTransaction(t.id)} className="text-red-600 hover:text-red-800 p-1 ml-1"><Trash2 className="w-4 h-4 inline" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {transactions.length === 0 ? (
                <div className="p-12 text-center text-gray-500">No hay transacciones en el período seleccionado.</div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-t border-gray-100 bg-gray-50 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">Filas por página:</span>
                    <select
                      value={transactionsPageSize}
                      onChange={(e) => {
                        setTransactionsPageSize(Number(e.target.value));
                        setTransactionsPage(1);
                      }}
                      className="px-2 py-1 border rounded text-gray-700"
                    >
                      {[10, 25, 50, 100, 200].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <span className="text-gray-500">
                      {((transactionsPage - 1) * transactionsPageSize) + 1}–{Math.min(transactionsPage * transactionsPageSize, sortedTransactions.length)} de {sortedTransactions.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setTransactionsPage((p) => Math.max(1, p - 1))}
                      disabled={transactionsPage <= 1}
                      className="px-3 py-1 rounded border bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Anterior
                    </button>
                    <span className="px-2 text-gray-600">
                      Página {transactionsPage} de {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTransactionsPage((p) => Math.min(totalPages, p + 1))}
                      disabled={transactionsPage >= totalPages}
                      className="px-3 py-1 rounded border bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'balance' && (
        <div>
          <div className="flex flex-wrap gap-4 mb-4 items-end">
            <div className="flex gap-2">
              <button
                onClick={() => setBalanceView('balance')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${balanceView === 'balance' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Balance
              </button>
              <button
                onClick={() => setBalanceView('pyg')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${balanceView === 'pyg' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                P&G por proyecto
              </button>
              <button
                onClick={() => setBalanceView('accounts')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${balanceView === 'accounts' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Balance de cuentas
              </button>
            </div>
            {balanceView !== 'accounts' && (
              <DateRangePicker
                start={balanceStart}
                end={balanceEnd}
                onStartChange={setBalanceStart}
                onEndChange={setBalanceEnd}
                onPreset={(id) => applyPeriodPreset(id, 'balance')}
              />
            )}
            {balanceView === 'pyg' && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pygProjectsOnly}
                  onChange={(e) => setPygProjectsOnly(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Solo proyectos (excluir Hotmart, Fondo libre, etc.)
              </label>
            )}
            {balanceView === 'accounts' && (
              <p className="text-sm text-gray-500">Saldo total acumulado (sin filtro de fechas)</p>
            )}
          </div>

          {loading ? (
            <div className="animate-pulse h-48 bg-gray-200 rounded-lg" />
          ) : balanceView === 'accounts' && accountBalancesData ? (
            (() => {
              const hasCopAccounts = accountBalancesData.total_cop !== 0 || accountBalancesData.rows.some((r) => r.cop !== 0);
              return (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Cuenta</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-700">USD</th>
                    {hasCopAccounts && <th className="px-6 py-3 text-right font-medium text-gray-700">COP</th>}
                  </tr>
                </thead>
                <tbody>
                  {accountBalancesData.rows.map((r) => (
                    <tr key={r.payment_account_id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium">{r.account_name}</td>
                      <td className={`px-6 py-3 text-right font-medium ${r.usd >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {r.usd >= 0 ? '+' : ''}{r.usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      {hasCopAccounts && (
                        <td className={`px-6 py-3 text-right font-medium ${r.cop >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {r.cop >= 0 ? '+' : ''}{r.cop.toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 font-semibold">
                  <tr>
                    <td className="px-6 py-3">Total</td>
                    <td className={`px-6 py-3 text-right ${accountBalancesData.total_usd >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {accountBalancesData.total_usd >= 0 ? '+' : ''}{accountBalancesData.total_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                    </td>
                    {hasCopAccounts && (
                      <td className={`px-6 py-3 text-right ${accountBalancesData.total_cop >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {accountBalancesData.total_cop >= 0 ? '+' : ''}{accountBalancesData.total_cop.toLocaleString('es-CO', { minimumFractionDigits: 0 })} COP
                      </td>
                    )}
                  </tr>
                </tfoot>
              </table>
              {accountBalancesData.rows.length === 0 && (
                <div className="p-12 text-center text-gray-500">No hay movimientos en las cuentas.</div>
              )}
            </div>
            );
            })()
          ) : balanceView === 'pyg' && pygData ? (
            (() => {
              const hasCopPyg = pygData.total_cop.ingresos !== 0 || pygData.total_cop.gastos !== 0 || pygData.total_cop.resultado !== 0 ||
                pygData.rows.some((r) => r.cop.ingresos !== 0 || r.cop.gastos !== 0 || r.cop.resultado !== 0);
              const sortedPygRows = [...pygData.rows].sort((a, b) => {
                let cmp = 0;
                if (pygSortBy === 'entity') {
                  cmp = (a.entity_name ?? '').localeCompare(b.entity_name ?? '', 'es');
                } else if (pygSortBy === 'ing_usd') cmp = a.usd.ingresos - b.usd.ingresos;
                else if (pygSortBy === 'gastos_usd') cmp = a.usd.gastos - b.usd.gastos;
                else if (pygSortBy === 'resultado_usd') cmp = a.usd.resultado - b.usd.resultado;
                else if (pygSortBy === 'ing_cop') cmp = a.cop.ingresos - b.cop.ingresos;
                else if (pygSortBy === 'gastos_cop') cmp = a.cop.gastos - b.cop.gastos;
                else cmp = a.cop.resultado - b.cop.resultado;
                return pygSortOrder === 'asc' ? cmp : -cmp;
              });
              const handlePygSort = (col: typeof pygSortBy) => {
                const isSame = pygSortBy === col;
                const newOrder = isSame ? (pygSortOrder === 'asc' ? 'desc' : 'asc') : (col === 'entity' ? 'asc' : 'desc');
                setPygSortBy(col);
                setPygSortOrder(newOrder);
              };
              const PygSortBtn = ({ col, label }: { col: typeof pygSortBy; label: string }) => (
                <button type="button" onClick={() => handlePygSort(col)} className="flex items-center gap-1 hover:text-indigo-600 w-full justify-end">
                  {label}
                  {pygSortBy === col && (pygSortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />)}
                </button>
              );
              return (
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Proyecto / Entidad</th>
                    <th colSpan={3} className="px-2 py-3 text-center font-medium text-gray-700 border-l">USD</th>
                    {hasCopPyg && <th colSpan={3} className="px-2 py-3 text-center font-medium text-gray-700 border-l">COP</th>}
                  </tr>
                  <tr className="bg-gray-50">
                    <th>
                      <button type="button" onClick={() => handlePygSort('entity')} className="flex items-center gap-1 hover:text-indigo-600">
                        Proyecto
                        {pygSortBy === 'entity' && (pygSortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />)}
                      </button>
                    </th>
                    <th className="px-2 py-1 text-right text-xs font-medium text-gray-500"><PygSortBtn col="ing_usd" label="Ingresos" /></th>
                    <th className="px-2 py-1 text-right text-xs font-medium text-gray-500"><PygSortBtn col="gastos_usd" label="Gastos" /></th>
                    <th className="px-2 py-1 text-right text-xs font-medium text-gray-500"><PygSortBtn col="resultado_usd" label="Resultado" /></th>
                    {hasCopPyg && (
                      <>
                        <th className="px-2 py-1 text-right text-xs font-medium text-gray-500 border-l"><PygSortBtn col="ing_cop" label="Ingresos" /></th>
                        <th className="px-2 py-1 text-right text-xs font-medium text-gray-500"><PygSortBtn col="gastos_cop" label="Gastos" /></th>
                        <th className="px-2 py-1 text-right text-xs font-medium text-gray-500"><PygSortBtn col="resultado_cop" label="Resultado" /></th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedPygRows.map((r) => {
                    const rowKey = r.entity_id ?? 'sin-asignar';
                    const isExpanded = pygExpandedEntity === rowKey;
                    const isThisRowDetail = pygExpandedEntity === rowKey;
                    return (
                      <React.Fragment key={rowKey}>
                        <tr
                          onClick={() => togglePygExpand(r)}
                          className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer select-none"
                        >
                          <td className="px-6 py-3 font-medium">
                            <span className="inline-flex items-center gap-1">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                              )}
                              {r.entity_name}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-right text-emerald-600">{r.usd.ingresos.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td className="px-2 py-3 text-right text-red-600">{r.usd.gastos.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td className={`px-2 py-3 text-right font-medium ${r.usd.resultado >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {r.usd.resultado >= 0 ? '+' : ''}{r.usd.resultado.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          {hasCopPyg && (
                            <>
                              <td className="px-2 py-3 text-right text-emerald-600 border-l">{r.cop.ingresos.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                              <td className="px-2 py-3 text-right text-red-600">{r.cop.gastos.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                              <td className={`px-2 py-3 text-right font-medium ${r.cop.resultado >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {r.cop.resultado >= 0 ? '+' : ''}{r.cop.resultado.toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                              </td>
                            </>
                          )}
                        </tr>
                        {isThisRowDetail && (
                          <tr className="border-t border-gray-100 bg-gray-50/80">
                            <td colSpan={hasCopPyg ? 7 : 4} className="px-6 py-4">
                              {pygDetailLoading ? (
                                <div className="text-sm text-gray-500 py-4">Cargando detalle…</div>
                              ) : pygDetailTransactions.length === 0 ? (
                                <div className="text-sm text-gray-500 py-2">No hay transacciones en este período.</div>
                              ) : (
                                <PygDetailPanel
                                  transactions={pygDetailTransactions}
                                  onEditTransaction={(t) => { setCurrentTransaction(t); setModalMode('edit'); setModalForTransaction(true); setShowModal(true); }}
                                />
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-100 font-semibold">
                  <tr>
                    <td className="px-6 py-3">Total</td>
                    <td className="px-2 py-3 text-right text-emerald-700">{pygData.total_usd.ingresos.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className="px-2 py-3 text-right text-red-700">{pygData.total_usd.gastos.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className={`px-2 py-3 text-right ${pygData.total_usd.resultado >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {pygData.total_usd.resultado >= 0 ? '+' : ''}{pygData.total_usd.resultado.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    {hasCopPyg && (
                      <>
                        <td className="px-2 py-3 text-right text-emerald-700 border-l">{pygData.total_cop.ingresos.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                        <td className="px-2 py-3 text-right text-red-700">{pygData.total_cop.gastos.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                        <td className={`px-2 py-3 text-right ${pygData.total_cop.resultado >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {pygData.total_cop.resultado >= 0 ? '+' : ''}{pygData.total_cop.resultado.toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                        </td>
                      </>
                    )}
                  </tr>
                </tfoot>
              </table>
              {pygData.rows.length === 0 && (
                <div className="p-12 text-center text-gray-500">No hay movimientos en el período seleccionado.</div>
              )}
            </div>
            );
            })()
          ) : balanceData ? (
            (() => {
              const hasCopBalance = balanceData.total_cop !== 0 || balanceData.rows.some((r) => r.cop !== 0);
              return (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Entidad</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-700">USD</th>
                    {hasCopBalance && <th className="px-6 py-3 text-right font-medium text-gray-700">COP</th>}
                  </tr>
                </thead>
                <tbody>
                  {balanceData.rows.map((r) => (
                    <tr key={r.entity_id ?? 'sin-asignar'} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium">{r.entity_name}</td>
                      <td className={`px-6 py-3 text-right font-medium ${r.usd >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {r.usd >= 0 ? '+' : ''}{r.usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      {hasCopBalance && (
                        <td className={`px-6 py-3 text-right font-medium ${r.cop >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {r.cop >= 0 ? '+' : ''}{r.cop.toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 font-semibold">
                  <tr>
                    <td className="px-6 py-3">Total general</td>
                    <td className={`px-6 py-3 text-right ${balanceData.total_usd >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {balanceData.total_usd >= 0 ? '+' : ''}{balanceData.total_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                    </td>
                    {hasCopBalance && (
                      <td className={`px-6 py-3 text-right ${balanceData.total_cop >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {balanceData.total_cop >= 0 ? '+' : ''}{balanceData.total_cop.toLocaleString('es-CO', { minimumFractionDigits: 0 })} COP
                      </td>
                    )}
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-indigo-700">Utilidad distribuible</td>
                    <td className="px-6 py-3 text-right text-indigo-700 font-bold">
                      {balanceData.total_usd >= 0 ? '+' : ''}{balanceData.total_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                    </td>
                    {hasCopBalance && (
                      <td className="px-6 py-3 text-right text-indigo-700 font-bold">
                        {balanceData.total_cop >= 0 ? '+' : ''}{balanceData.total_cop.toLocaleString('es-CO', { minimumFractionDigits: 0 })} COP
                      </td>
                    )}
                  </tr>
                </tfoot>
              </table>
              {balanceData.rows.length === 0 && (
                <div className="p-12 text-center text-gray-500">No hay movimientos en el período seleccionado.</div>
              )}
            </div>
            );
            })()
          ) : (
            <div className="p-12 text-center text-gray-500">Error al cargar los datos.</div>
          )}
        </div>
      )}

      {activeTab === 'config' && (
        <div>
          <div className="flex gap-2 mb-6">
            {configTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setConfigTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  configTab === t.id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>

          {configTab === 'entities' && (
            <div>
              <button
                onClick={() => { setCurrentEntity({ name: '', type: 'project', sort_order: 0 }); setModalMode('create'); setShowModal(true); }}
                className="mb-4 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Nueva entidad
              </button>
              <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-gray-700">
                        <button
                          type="button"
                          onClick={() => {
                            const isSame = entitySortBy === 'name';
                            setEntitySortBy('name');
                            setEntitySortOrder(isSame ? (entitySortOrder === 'asc' ? 'desc' : 'asc') : 'asc');
                          }}
                          className="flex items-center gap-1 hover:text-indigo-600"
                        >
                          Nombre
                          {entitySortBy === 'name' && (entitySortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />)}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left font-medium text-gray-700">
                        <button
                          type="button"
                          onClick={() => {
                            const isSame = entitySortBy === 'type';
                            setEntitySortBy('type');
                            setEntitySortOrder(isSame ? (entitySortOrder === 'asc' ? 'desc' : 'asc') : 'asc');
                          }}
                          className="flex items-center gap-1 hover:text-indigo-600"
                        >
                          Tipo
                          {entitySortBy === 'type' && (entitySortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />)}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-right font-medium text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...entities]
                      .sort((a, b) => {
                        if (entitySortBy === 'name') {
                          const cmp = (a.name ?? '').localeCompare(b.name ?? '', 'es');
                          return entitySortOrder === 'asc' ? cmp : -cmp;
                        }
                        const cmp = (a.type ?? '').localeCompare(b.type ?? '', 'es');
                        return entitySortOrder === 'asc' ? cmp : -cmp;
                      })
                      .map((e) => (
                      <React.Fragment key={e.id}>
                        <tr
                          onClick={() => toggleConfigEntityExpand(e)}
                          className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer select-none"
                        >
                          <td className="px-6 py-3">
                            <span className="inline-flex items-center gap-1">
                              {configEntityExpanded === e.id ? (
                                <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                              )}
                              {e.name}
                            </span>
                          </td>
                          <td className="px-6 py-3 capitalize">{e.type}</td>
                          <td className="px-6 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                            <button onClick={() => { setMergeSourceEntity(e); setMergeTargetId(''); }} className="text-amber-600 hover:text-amber-800 p-1" title="Fusionar en otra entidad"><Merge className="w-4 h-4 inline" /></button>
                            <button onClick={() => { setCurrentEntity(e); setModalMode('edit'); setShowModal(true); }} className="text-indigo-600 hover:text-indigo-800 p-1 ml-1"><Edit className="w-4 h-4 inline" /></button>
                            <button onClick={() => handleDeleteEntity(e.id)} className="text-red-600 hover:text-red-800 p-1 ml-1"><Trash2 className="w-4 h-4 inline" /></button>
                          </td>
                        </tr>
                        {configEntityExpanded === e.id && (
                          <tr className="border-t border-gray-100 bg-gray-50/80">
                            <td colSpan={3} className="px-6 py-4">
                              {configDetailLoading ? (
                                <div className="text-sm text-gray-500 py-4">Cargando…</div>
                              ) : configDetailTransactions.length === 0 ? (
                                <div className="text-sm text-gray-500 py-2">No hay transacciones.</div>
                              ) : (
                                <ConfigDetailTable transactions={configDetailTransactions} showEntity={false} showCategory onEditTransaction={(t) => { setCurrentTransaction(t); setModalMode('edit'); setModalForTransaction(true); setShowModal(true); }} />
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {configTab === 'categories' && (
            <div>
              <button
                onClick={() => { setCurrentCategory({ name: '', type: 'expense', parent_id: null }); setModalMode('create'); setShowModal(true); }}
                className="mb-4 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Nueva categoría
              </button>
              <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-gray-700">
                        <button
                          type="button"
                          onClick={() => {
                            setCategorySortBy('name');
                            setCategorySortOrder((o) => (categorySortBy === 'name' ? (o === 'asc' ? 'desc' : 'asc') : 'asc'));
                          }}
                          className="flex items-center gap-1 hover:text-indigo-600"
                        >
                          Nombre
                          {categorySortBy === 'name' && (categorySortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />)}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left font-medium text-gray-700">Tipo</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-700">
                        <button
                          type="button"
                          onClick={() => {
                            setCategorySortBy('transactions');
                            setCategorySortOrder((o) => (categorySortBy === 'transactions' ? (o === 'asc' ? 'desc' : 'asc') : 'desc'));
                          }}
                          className="flex items-center gap-1 ml-auto hover:text-indigo-600"
                        >
                          Transacciones
                          {categorySortBy === 'transactions' && (categorySortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />)}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-right font-medium text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...categories]
                      .sort((a, b) => {
                        if (categorySortBy === 'name') {
                          const cmp = (a.name ?? '').localeCompare(b.name ?? '', 'es');
                          return categorySortOrder === 'asc' ? cmp : -cmp;
                        }
                        const ta = a.transaction_count ?? 0;
                        const tb = b.transaction_count ?? 0;
                        return categorySortOrder === 'asc' ? ta - tb : tb - ta;
                      })
                      .map((c) => (
                      <React.Fragment key={c.id}>
                        <tr
                          onClick={() => toggleConfigCategoryExpand(c)}
                          className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer select-none"
                        >
                          <td className="px-6 py-3">
                            <span className="inline-flex items-center gap-1">
                              {configCategoryExpanded === c.id ? (
                                <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                              )}
                              {c.name}
                            </span>
                          </td>
                          <td className="px-6 py-3 capitalize">{c.type}</td>
                          <td className="px-6 py-3 text-right text-gray-600">{(c.transaction_count ?? 0).toLocaleString()}</td>
                          <td className="px-6 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                            <button onClick={() => { setMergeSourceCategory(c); setMergeCategoryTargetId(''); }} className="text-amber-600 hover:text-amber-800 p-1" title="Fusionar en otra categoría"><Merge className="w-4 h-4 inline" /></button>
                            <button onClick={() => { setCurrentCategory(c); setModalMode('edit'); setShowModal(true); }} className="text-indigo-600 hover:text-indigo-800 p-1 ml-1"><Edit className="w-4 h-4 inline" /></button>
                            <button onClick={() => handleDeleteCategory(c.id)} className="text-red-600 hover:text-red-800 p-1 ml-1"><Trash2 className="w-4 h-4 inline" /></button>
                          </td>
                        </tr>
                        {configCategoryExpanded === c.id && (
                          <tr className="border-t border-gray-100 bg-gray-50/80">
                            <td colSpan={4} className="px-6 py-4">
                              {configDetailLoading ? (
                                <div className="text-sm text-gray-500 py-4">Cargando…</div>
                              ) : configDetailTransactions.length === 0 ? (
                                <div className="text-sm text-gray-500 py-2">No hay transacciones.</div>
                              ) : (
                                <ConfigDetailTable transactions={configDetailTransactions} showEntity showCategory={false} onEditTransaction={(t) => { setCurrentTransaction(t); setModalMode('edit'); setModalForTransaction(true); setShowModal(true); }} />
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {configTab === 'accounts' && (
            <div>
              <button
                onClick={() => { setCurrentAccount({ name: '', currency: 'USD' }); setModalMode('create'); setShowModal(true); }}
                className="mb-4 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Nueva cuenta
              </button>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-gray-700">Nombre</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-700">Moneda</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-6 py-3">{a.name}</td>
                        <td className="px-6 py-3">{a.currency ?? 'USD'}</td>
                        <td className="px-6 py-3 text-right">
                          <button onClick={() => { setCurrentAccount(a); setModalMode('edit'); setShowModal(true); }} className="text-indigo-600 hover:text-indigo-800 p-1"><Edit className="w-4 h-4 inline" /></button>
                          <button onClick={() => handleDeleteAccount(a.id)} className="text-red-600 hover:text-red-800 p-1 ml-1"><Trash2 className="w-4 h-4 inline" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {showSelectAllModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-4">
            <h3 className="font-semibold text-lg mb-3">Seleccionar transacciones</h3>
            <p className="text-gray-600 text-sm mb-4">
              ¿Seleccionar solo las de esta página o todas las transacciones filtradas?
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={selectAllPage}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-left"
              >
                Solo esta página ({paginatedTransactions.length})
              </button>
              <button
                type="button"
                onClick={selectAllTotal}
                className="w-full px-4 py-2 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-left"
              >
                Todas ({sortedTransactions.length})
              </button>
              <button
                type="button"
                onClick={() => setShowSelectAllModal(false)}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 mt-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-semibold text-lg">
                {(activeTab === 'libro' || modalForTransaction) && (modalMode === 'create' ? 'Nueva transacción' : 'Editar transacción')}
                {activeTab === 'config' && !modalForTransaction && configTab === 'entities' && (modalMode === 'create' ? 'Nueva entidad' : 'Editar entidad')}
                {activeTab === 'config' && !modalForTransaction && configTab === 'categories' && (modalMode === 'create' ? 'Nueva categoría' : 'Editar categoría')}
                {activeTab === 'config' && !modalForTransaction && configTab === 'accounts' && (modalMode === 'create' ? 'Nueva cuenta' : 'Editar cuenta')}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={
              (activeTab === 'libro' || modalForTransaction) ? handleSaveTransaction :
              configTab === 'entities' ? handleSaveEntity :
              configTab === 'categories' ? handleSaveCategory :
              handleSaveAccount
            } className="p-4 space-y-4">
              {error && <div className="text-red-600 text-sm">{error}</div>}

              {(activeTab === 'libro' || modalForTransaction) && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                    <input
                      type="date"
                      value={currentTransaction.date ? format(new Date(currentTransaction.date), 'yyyy-MM-dd') : ''}
                      onChange={(e) => setCurrentTransaction((p) => ({ ...p, date: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
                    <input type="number" step="0.01" value={currentTransaction.amount ?? 0} onChange={(e) => setCurrentTransaction((p) => ({ ...p, amount: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
                    <select value={currentTransaction.currency ?? 'USD'} onChange={(e) => setCurrentTransaction((p) => ({ ...p, currency: e.target.value }))} className="w-full px-3 py-2 border rounded-lg">
                      <option value="USD">USD</option>
                      <option value="COP">COP</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                    <select value={currentTransaction.type ?? 'expense'} onChange={(e) => setCurrentTransaction((p) => ({ ...p, type: e.target.value as 'income' | 'expense' | 'transfer' }))} className="w-full px-3 py-2 border rounded-lg">
                      <option value="income">Ingreso</option>
                      <option value="expense">Gasto</option>
                      <option value="transfer">Transferencia</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Entidad</label>
                    <select value={currentTransaction.entity_id ?? ''} onChange={(e) => setCurrentTransaction((p) => ({ ...p, entity_id: e.target.value || null }))} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">Sin asignar</option>
                      {entities.map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                    <input
                      type="text"
                      placeholder="Buscar categoría..."
                      value={categorySearchFilter}
                      onChange={(e) => setCategorySearchFilter(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg mb-2"
                    />
                    <div className="border rounded-lg max-h-40 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => setCurrentTransaction((p) => ({ ...p, category_id: null }))}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 block ${!currentTransaction.category_id ? 'bg-indigo-50 text-indigo-700' : ''}`}
                      >
                        Sin categoría
                      </button>
                      {categories
                        .filter((c) => (c.name ?? '').toLowerCase().includes(categorySearchFilter.toLowerCase()))
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setCurrentTransaction((p) => ({ ...p, category_id: c.id }))}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 block ${currentTransaction.category_id === c.id ? 'bg-indigo-50 text-indigo-700' : ''}`}
                          >
                            {c.name}
                          </button>
                        ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta de pago</label>
                    <select value={currentTransaction.payment_account_id ?? ''} onChange={(e) => setCurrentTransaction((p) => ({ ...p, payment_account_id: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" required>
                      <option value="">Seleccionar</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                    <input type="text" value={currentTransaction.description ?? ''} onChange={(e) => setCurrentTransaction((p) => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                </>
              )}

              {activeTab === 'config' && !modalForTransaction && configTab === 'entities' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                    <input type="text" value={currentEntity.name ?? ''} onChange={(e) => setCurrentEntity((p) => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                    <select value={currentEntity.type ?? 'project'} onChange={(e) => setCurrentEntity((p) => ({ ...p, type: e.target.value as 'project' | 'agency' | 'internal' }))} className="w-full px-3 py-2 border rounded-lg">
                      <option value="project">Proyecto</option>
                      <option value="agency">Agencia</option>
                      <option value="internal">Interno</option>
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'config' && !modalForTransaction && configTab === 'categories' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                    <input type="text" value={currentCategory.name ?? ''} onChange={(e) => setCurrentCategory((p) => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                    <select value={currentCategory.type ?? 'expense'} onChange={(e) => setCurrentCategory((p) => ({ ...p, type: e.target.value as 'income' | 'expense' }))} className="w-full px-3 py-2 border rounded-lg">
                      <option value="income">Ingreso</option>
                      <option value="expense">Gasto</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subcategoría de</label>
                    <select value={currentCategory.parent_id ?? ''} onChange={(e) => setCurrentCategory((p) => ({ ...p, parent_id: e.target.value || null }))} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">Ninguna</option>
                      {categories.filter((c) => c.id !== currentCategory.id).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'config' && !modalForTransaction && configTab === 'accounts' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                    <input type="text" value={currentAccount.name ?? ''} onChange={(e) => setCurrentAccount((p) => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
                    <select value={currentAccount.currency ?? 'USD'} onChange={(e) => setCurrentAccount((p) => ({ ...p, currency: e.target.value }))} className="w-full px-3 py-2 border rounded-lg">
                      <option value="USD">USD</option>
                      <option value="COP">COP</option>
                    </select>
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-4">
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700">Guardar</button>
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mergeSourceCategory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-semibold text-lg">Fusionar categoría</h3>
              <button onClick={() => { setMergeSourceCategory(null); setMergeCategoryTargetId(''); }} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-3">
                Todas las transacciones de <strong>{mergeSourceCategory.name}</strong> se reasignarán a la categoría que elijas. La categoría actual se eliminará.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fusionar en</label>
              <select
                value={mergeCategoryTargetId}
                onChange={(e) => setMergeCategoryTargetId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">— Selecciona categoría destino —</option>
                {categories.filter((x) => x.id !== mergeSourceCategory.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button onClick={() => { setMergeSourceCategory(null); setMergeCategoryTargetId(''); }} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={handleMergeCategory} disabled={!mergeCategoryTargetId} className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed">
                Fusionar
              </button>
            </div>
          </div>
        </div>
      )}

      {mergeSourceEntity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-semibold text-lg">Fusionar entidad</h3>
              <button onClick={() => { setMergeSourceEntity(null); setMergeTargetId(''); }} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-3">
                Todas las transacciones de <strong>{mergeSourceEntity.name}</strong> se reasignarán a la entidad que elijas. La entidad actual se eliminará.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fusionar en</label>
              <select
                value={mergeTargetId}
                onChange={(e) => setMergeTargetId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">— Selecciona entidad destino —</option>
                {entities.filter((x) => x.id !== mergeSourceEntity.id).map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button onClick={() => { setMergeSourceEntity(null); setMergeTargetId(''); }} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={handleMergeEntity} disabled={!mergeTargetId} className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed">
                Fusionar
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-semibold text-lg">Importar CSV desde Excel</h3>
              <button onClick={() => { setShowImportModal(false); setImportCsvText(''); setImportResult(null); }} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <p className="text-sm text-gray-600 mb-2">
                Pega el contenido del CSV exportado desde Excel o selecciona un archivo. Debe tener columnas FECHA, PROYECTO y columnas de cuentas (BANCOLOMBIA, PAYO JSD, etc.).
              </p>
              <div className="mb-2">
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const r = new FileReader();
                      r.onload = () => setImportCsvText(String(r.result ?? ''));
                      r.readAsText(f, 'UTF-8');
                    }
                    e.target.value = '';
                  }}
                  className="text-sm"
                />
              </div>
              <p className="text-xs text-gray-500 mb-2">Montos &gt; 100.000 se importan en COP; el resto en USD.</p>
              <textarea
                value={importCsvText}
                onChange={(e) => setImportCsvText(e.target.value)}
                placeholder="Pega aquí el CSV..."
                className="w-full h-48 px-3 py-2 border rounded-lg font-mono text-sm"
                disabled={importing}
              />
              {importResult && (
                <div className="mt-3 p-3 bg-emerald-50 rounded-lg text-sm text-emerald-800">
                  <strong>Importación completada:</strong> {importResult.created} transacciones, {importResult.entities} entidades, {importResult.accounts} cuentas, {importResult.categories} categorías. {importResult.skipped > 0 && `${importResult.skipped} filas omitidas.`}
                </div>
              )}
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button onClick={() => { setShowImportModal(false); setImportCsvText(''); setImportResult(null); }} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cerrar</button>
              <button onClick={handleImportCsv} disabled={importing || !importCsvText.trim()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {importing ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
