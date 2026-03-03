import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { contabilidadApi, type AcctClient, type AcctEntity, type AcctCategory, type AcctPaymentAccount, type AcctTransaction, type BalanceRow, type PygRow, type PygRowByClient, type AccountBalanceRow, type AcctChartAccount, type AcctJournalEntry, type AcctJournalEntryLine, type LedgerLine, type ImportPreviewItem, type ImportPreviewResponse, type ImportBatch, type PygMatrixResponse } from '../lib/contabilidadApi';
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
  UserPlus,
  Calendar,
  Search,
  Users,
  FileText,
  Eye,
  CheckCircle2,
  Info,
  History,
  RotateCcw,
  Landmark,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type MainTab = 'libro' | 'balance' | 'config' | 'asientos';
type AsientosTab = 'chart' | 'entries' | 'trial';
type ConfigTab = 'clients' | 'entities' | 'categories' | 'accounts';

const PERIOD_PRESETS = [
  { id: 'all', label: 'Todo el tiempo' },
  { id: 'this-year', label: 'Este año' },
  { id: 'last-year', label: 'Año pasado' },
  { id: 'this-month', label: 'Este mes' },
  { id: 'last-month', label: 'Mes pasado' },
] as const;

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  ingreso: { label: 'Ingreso', color: 'bg-emerald-100 text-emerald-800' },
  gasto: { label: 'Gasto', color: 'bg-rose-100 text-rose-800' },
  traslado_bancos: { label: 'Traslado bancos', color: 'bg-blue-100 text-blue-800' },
  traslado_utilidades: { label: 'Traslado utilidades', color: 'bg-violet-100 text-violet-800' },
  reparto: { label: 'Pago socio', color: 'bg-amber-100 text-amber-800' },
};

const CLASE_LABELS: Record<string, string> = {
  '1': 'Activos',
  '2': 'Pasivos',
  '3': 'Patrimonio',
  '4': 'Ingresos',
  '5': 'Gastos',
};

const GRUPO_LABELS: Record<string, string> = {
  '11': 'Disponibles',
  '12': 'Inversiones',
  '13': 'Deudores',
  '21': 'Obligaciones financieras',
  '22': 'Proveedores',
  '31': 'Capital',
  '36': 'Reservas y utilidades',
  '41': 'Ingresos operacionales',
  '51': 'Gastos administrativos',
  '52': 'Gastos de ventas',
  '53': 'Gastos financieros',
};

type ChartTreeNode = {
  key: string;
  code: string;
  label: string;
  account: AcctChartAccount | null;
  children: ChartTreeNode[];
  depth: number;
};

function buildChartTree(accounts: AcctChartAccount[]): ChartTreeNode[] {
  const byCode = new Map<string, AcctChartAccount>();
  for (const a of accounts) {
    byCode.set(a.code, a);
    const num = a.code.replace(/\D/g, '');
    if (num && num !== a.code) byCode.set(num, a);
  }

  const roots = new Map<string, ChartTreeNode>();

  const getOrCreate = (prefix: string, depth: number): ChartTreeNode => {
    const acc = byCode.get(prefix) ?? null;
    const isClase = prefix.length === 1;
    const isGrupo = prefix.length === 2;
    let label = acc?.name ?? '';
    if (!label && isClase) label = CLASE_LABELS[prefix] ?? `Clase ${prefix}`;
    if (!label && isGrupo) label = GRUPO_LABELS[prefix] ?? `Grupo ${prefix}`;
    if (!label) label = prefix;
    return {
      key: prefix,
      code: prefix,
      label,
      account: acc,
      children: [],
      depth,
    };
  };

  const ensurePath = (segments: string[]): ChartTreeNode => {
    let node: ChartTreeNode | null = null;
    for (let i = 0; i < segments.length; i++) {
      const prefix = segments[i];
      if (i === 0) {
        if (!roots.has(prefix)) roots.set(prefix, getOrCreate(prefix, 1));
        node = roots.get(prefix)!;
      } else {
        const parent = node!;
        let child = parent.children.find((c) => c.key === prefix);
        if (!child) {
          child = getOrCreate(prefix, i + 1);
          parent.children.push(child);
        }
        node = child;
      }
    }
    return node!;
  };

  for (const a of accounts.sort((x, y) => x.code.localeCompare(y.code))) {
    const code = a.code.replace(/\D/g, '');
    if (!code) continue;
    const segments: string[] = [];
    if (code.length >= 1) segments.push(code.slice(0, 1));
    if (code.length >= 2) segments.push(code.slice(0, 2));
    if (code.length >= 4) segments.push(code.slice(0, 4));
    else if (code.length === 3) segments.push(code);
    if (code.length > 4) segments.push(code);
    const node = ensurePath(segments);
    if (node.key === code || node.key === a.code) {
      node.account = a;
      node.label = a.name;
    }
  }

  return Array.from(roots.values()).sort((a, b) => a.code.localeCompare(b.code));
}

function ChartAccountsTree({
  accounts,
  onEdit,
  onDelete,
}: {
  accounts: AcctChartAccount[];
  onEdit: (a: AcctChartAccount) => void;
  onDelete: (a: AcctChartAccount) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['1', '2', '3', '4', '5']));
  const tree = buildChartTree(accounts);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderNode = (node: ChartTreeNode, indent: number) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.key);
    const isVirtual = !node.account;

    return (
      <React.Fragment key={node.key}>
        <div
          className={`flex items-center gap-2 py-2 px-4 border-b border-gray-100 hover:bg-gray-50/80 transition-colors ${indent > 0 ? '' : 'bg-gray-50/50'}`}
          style={{ paddingLeft: `${12 + indent * 24}px` }}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggle(node.key)}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-gray-200 text-gray-500"
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
            ) : (
              <span className="w-4" />
            )}
          </button>
          <span className={`font-mono text-sm min-w-[5rem] ${isVirtual ? 'text-gray-500 font-medium' : 'text-gray-800'}`}>
            {node.account?.code ?? node.code}
          </span>
          <span className={`flex-1 min-w-0 truncate ${isVirtual ? 'text-gray-600' : 'text-gray-900'}`}>
            {node.account?.name ?? (node.label || node.code)}
          </span>
          {node.account && (
            <>
              <span className="text-xs px-2 py-0.5 rounded text-gray-500 bg-gray-100">
                {({ asset: 'Activo', liability: 'Pasivo', equity: 'Patrimonio', income: 'Ingreso', expense: 'Gasto' } as Record<string, string>)[node.account.type] ?? node.account.type}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => onEdit(node.account!)}
                  className="p-1.5 rounded hover:bg-indigo-100 text-indigo-600"
                  title="Editar"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(node.account!)}
                  className="p-1.5 rounded hover:bg-red-100 text-red-600"
                  title="Eliminar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
        {hasChildren && isExpanded && node.children.map((child) => renderNode(child, indent + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="divide-y divide-gray-100">
      <div className="flex items-center gap-2 py-3 px-4 bg-gray-50 border-b border-gray-200 font-medium text-sm text-gray-600">
        <span className="w-6" />
        <span className="w-16">Código</span>
        <span className="flex-1">Nombre</span>
        <span className="w-20" />
        <span className="w-16 text-right">Acciones</span>
      </div>
      {tree.map((node) => renderNode(node, 0))}
    </div>
  );
}

function ImportPreviewRow({ item }: { item: ImportPreviewItem }) {
  const t = TIPO_LABELS[item.tipo] || { label: item.tipo, color: 'bg-gray-100 text-gray-800' };
  const montoStr = item.monto > 0 ? `+${item.monto.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : item.monto.toLocaleString(undefined, { minimumFractionDigits: 2 });
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
      <td className="px-3 py-2 text-gray-500">{item.rowIndex}</td>
      <td className="px-3 py-2">{item.fecha}</td>
      <td className="px-3 py-2">{item.cuenta || '-'}</td>
      <td className="px-3 py-2">
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${t.color}`}>{t.label}</span>
      </td>
      <td className="px-3 py-2">{item.proyecto}</td>
      <td className="px-3 py-2">{item.descripcion.slice(0, 40)}{item.descripcion.length > 40 ? '…' : ''}</td>
      <td className="px-3 py-2 text-right font-mono">{item.monto !== 0 ? `${montoStr} ${item.currency}` : '-'}</td>
      <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px]">{item.explicacion}</td>
    </tr>
  );
}

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

function LedgerLineTable({
  lines,
  onEditEntry,
  onDeleteEntry,
}: {
  lines: LedgerLine[];
  onEditEntry?: (journalEntryId: string) => void;
  onDeleteEntry?: (journalEntryId: string) => void;
}) {
  const firstEntryIds = React.useMemo(() => {
    const s = new Set<string>();
    return new Set(lines.filter((l) => { if (s.has(l.journal_entry_id)) return false; s.add(l.journal_entry_id); return true; }).map((l) => l.journal_entry_id));
  }, [lines]);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-600 border-b">
          <th className="py-2 pr-4">Fecha</th>
          <th className="py-2 pr-4">Cuenta</th>
          <th className="py-2 pr-4">Entidad</th>
          <th className="py-2 pr-4">Descripción</th>
          <th className="py-2 text-right pr-4">Débito</th>
          <th className="py-2 text-right pr-4">Crédito</th>
          <th className="py-2 pr-2">Moneda</th>
          {(onEditEntry || onDeleteEntry) && <th className="py-2 w-20"></th>}
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
            <td className="py-2 pr-4">{l.date ? format(new Date(l.date), 'dd/MM/yyyy', { locale: es }) : '—'}</td>
            <td className="py-2 pr-4">{l.account_code} {l.account_name}</td>
            <td className="py-2 pr-4">{l.entity_name ?? '—'}</td>
            <td className="py-2 pr-4 max-w-[200px] truncate">{l.description || '—'}</td>
            <td className="py-2 text-right pr-4 text-gray-700">{l.debit > 0 ? l.debit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
            <td className="py-2 text-right pr-4 text-gray-700">{l.credit > 0 ? l.credit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
            <td className="py-2 pr-2">{l.currency ?? 'USD'}</td>
            {(onEditEntry || onDeleteEntry) && firstEntryIds.has(l.journal_entry_id) && (
              <td className="py-2">
                {onEditEntry && <button type="button" onClick={() => onEditEntry(l.journal_entry_id)} className="text-indigo-600 hover:text-indigo-800 p-1" title="Editar asiento"><Edit className="w-4 h-4 inline" /></button>}
                {onDeleteEntry && <button type="button" onClick={() => onDeleteEntry(l.journal_entry_id)} className="text-red-600 hover:text-red-800 p-1 ml-1" title="Eliminar asiento"><Trash2 className="w-4 h-4 inline" /></button>}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ledgerLinesToTransactionLike(lines: LedgerLine[]): Array<AcctTransaction & { journal_entry_id?: string }> {
  return lines.map((l) => {
    const amt = l.account_type === 'income' ? (l.credit - l.debit) : l.account_type === 'expense' ? -(l.debit - l.credit) : (l.debit - l.credit);
    return {
      id: l.id,
      date: l.date ?? '',
      amount: amt,
      currency: l.currency,
      type: amt >= 0 ? 'income' : 'expense',
      entity_id: l.entity_id,
      entity_name: l.entity_name,
      category_name: l.account_name,
      payment_account_name: l.account_code,
      description: l.description,
      payment_account_id: '',
      journal_entry_id: l.journal_entry_id,
    } as AcctTransaction & { journal_entry_id?: string };
  });
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
            <th className="px-3 py-2 text-left font-medium text-gray-700 sticky left-0 bg-gray-50 z-10 min-w-[260px]">Categoría</th>
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
            <th className="px-3 py-1 sticky left-0 bg-gray-50 z-10 min-w-[260px]"></th>
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
                  <td className="px-3 py-2 font-medium sticky left-0 bg-white group-hover:bg-gray-50 align-top min-w-[260px]">
                    <span className="inline-flex items-start gap-1 min-w-[220px] max-w-[320px]">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" /> : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />}
                      <span className="break-words leading-tight line-clamp-2">{cat}</span>
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
                        <td className="px-3 py-1.5 pl-8 text-gray-600 sticky left-0 bg-gray-50/50 align-top min-w-[260px]" onClick={(e) => e.stopPropagation()}>
                          <span className="flex items-start gap-2 min-w-[220px] max-w-[320px]">
                            <span className="break-words leading-tight line-clamp-2">{format(new Date(t.date), 'dd MMM', { locale: es })} — {t.description || 'Sin descripción'}</span>
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
  const [configTab, setConfigTab] = useState<ConfigTab>('clients');

  const [clients, setClients] = useState<AcctClient[]>([]);
  const [entities, setEntities] = useState<AcctEntity[]>([]);
  const [categories, setCategories] = useState<AcctCategory[]>([]);
  const [accounts, setAccounts] = useState<AcctPaymentAccount[]>([]);
  const [transactions, setTransactions] = useState<AcctTransaction[]>([]);
  const [ledgerLines, setLedgerLines] = useState<LedgerLine[]>([]);
  const [balanceData, setBalanceData] = useState<{ rows: BalanceRow[]; total_usd: number; total_cop: number } | null>(null);
  const [pygData, setPygData] = useState<{ rows: PygRow[]; total_usd: { ingresos: number; gastos: number; resultado: number }; total_cop: { ingresos: number; gastos: number; resultado: number } } | null>(null);
  const [pygByClientData, setPygByClientData] = useState<{ rows: PygRowByClient[]; total_usd: { ingresos: number; gastos: number; resultado: number }; total_cop: { ingresos: number; gastos: number; resultado: number } } | null>(null);
  const [accountBalancesData, setAccountBalancesData] = useState<{ rows: AccountBalanceRow[]; total_usd: number; total_cop: number } | null>(null);
  const [balanceView, setBalanceView] = useState<'balance' | 'pyg' | 'pyg_client' | 'pyg_matrix' | 'pyg_matrix_client' | 'accounts' | 'liquidacion'>('pyg_matrix');

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
  const [filterSearch, setFilterSearch] = useState('');

  const [balanceStart, setBalanceStart] = useState(() => '2025-01-01');
  const [balanceEnd, setBalanceEnd] = useState(() => '2026-12-31');

  const [currentClient, setCurrentClient] = useState<Partial<AcctClient>>({ name: '', sort_order: 0 });
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
  const [showImportHistoryModal, setShowImportHistoryModal] = useState(false);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [rollbackLoading, setRollbackLoading] = useState<string | null>(null);
  const [importCsvText, setImportCsvText] = useState('');
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [importPreviewData, setImportPreviewData] = useState<ImportPreviewResponse | null>(null);
  const [importPreviewLoading, setImportPreviewLoading] = useState(false);
  const [importPreviewFilter, setImportPreviewFilter] = useState<string>('all');
  const [importCategoryMapping, setImportCategoryMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; entities: number; categories: number; accounts: number } | null>(null);
  const [mergeSourceEntity, setMergeSourceEntity] = useState<AcctEntity | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeSourceCategory, setMergeSourceCategory] = useState<AcctCategory | null>(null);
  const [mergeCategoryTargetId, setMergeCategoryTargetId] = useState('');
  const [sortDateOrder, setSortDateOrder] = useState<'asc' | 'desc'>('desc');
  const [pygSortBy, setPygSortBy] = useState<'entity' | 'ing_usd' | 'gastos_usd' | 'resultado_usd' | 'ing_cop' | 'gastos_cop' | 'resultado_cop'>('resultado_usd');
  const [pygSortOrder, setPygSortOrder] = useState<'asc' | 'desc'>('desc');
  const [pygClientSortBy, setPygClientSortBy] = useState<'client' | 'ing_usd' | 'gastos_usd' | 'resultado_usd' | 'ing_cop' | 'gastos_cop' | 'resultado_cop'>('resultado_usd');
  const [pygClientSortOrder, setPygClientSortOrder] = useState<'asc' | 'desc'>('desc');
  const [pygClientHideNoClient, setPygClientHideNoClient] = useState(false);
  const [pygProjectsOnly, setPygProjectsOnly] = useState(true);
  const [pygMatrixData, setPygMatrixData] = useState<PygMatrixResponse | null>(null);
  const [pygMatrixClientData, setPygMatrixClientData] = useState<PygMatrixResponse | null>(null);
  const [pygMatrixCurrency, setPygMatrixCurrency] = useState<'usd' | 'cop'>('usd');
  const [pygMatrixHideAdmin, setPygMatrixHideAdmin] = useState(false);
  const [pygFilterClient, setPygFilterClient] = useState('');
  const [pygDetailTransactions, setPygDetailTransactions] = useState<AcctTransaction[]>([]);
  const [pygDetailLedgerLines, setPygDetailLedgerLines] = useState<LedgerLine[]>([]);
  const [pygDetailLoading, setPygDetailLoading] = useState(false);
  const [configEntityExpanded, setConfigEntityExpanded] = useState<string | null>(null);
  const [configCategoryExpanded, setConfigCategoryExpanded] = useState<string | null>(null);
  const [categorySortBy, setCategorySortBy] = useState<'name' | 'transactions'>('transactions');
  const [categorySortOrder, setCategorySortOrder] = useState<'asc' | 'desc'>('desc');
  const [entitySortBy, setEntitySortBy] = useState<'name' | 'type'>('name');
  const [entitySortOrder, setEntitySortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set());
  const [bulkAssignClientId, setBulkAssignClientId] = useState('');
  const [bulkAssignLoading, setBulkAssignLoading] = useState(false);
  const [configDetailTransactions, setConfigDetailTransactions] = useState<AcctTransaction[]>([]);
  const [configDetailLedgerLines, setConfigDetailLedgerLines] = useState<LedgerLine[]>([]);
  const [configDetailLoading, setConfigDetailLoading] = useState(false);
  const [editingJournalEntryId, setEditingJournalEntryId] = useState<string | null>(null);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsPageSize, setTransactionsPageSize] = useState(25);
  const [categorySearchFilter, setCategorySearchFilter] = useState('');
  const [modalForTransaction, setModalForTransaction] = useState(false);
  const [showCreateCategoryInTransaction, setShowCreateCategoryInTransaction] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [configSearch, setConfigSearch] = useState('');
  const [asientosTab, setAsientosTab] = useState<AsientosTab>('chart');
  const [chartAccounts, setChartAccounts] = useState<AcctChartAccount[]>([]);
  const [journalEntries, setJournalEntries] = useState<AcctJournalEntry[]>([]);
  const [trialBalanceData, setTrialBalanceData] = useState<{ rows: { account_code: string; account_name: string; account_type: string; debit: number; credit: number; balance: number }[]; total_debit: number; total_credit: number } | null>(null);
  const [asientosStart, setAsientosStart] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [asientosEnd, setAsientosEnd] = useState(() => new Date().toISOString().split('T')[0]);
  const [showChartAccountModal, setShowChartAccountModal] = useState(false);
  const [showJournalEntryModal, setShowJournalEntryModal] = useState(false);
  const [currentChartAccount, setCurrentChartAccount] = useState<Partial<AcctChartAccount>>({ code: '', name: '', type: 'expense' });
  const [currentJournalEntry, setCurrentJournalEntry] = useState<{ date: string; description: string; reference: string; lines: Array<{ account_id: string; entity_id: string | null; debit: number; credit: number; description: string }> }>({
    date: new Date().toISOString().split('T')[0],
    description: '',
    reference: '',
    lines: [{ account_id: '', entity_id: null, debit: 0, credit: 0, description: '' }, { account_id: '', entity_id: null, debit: 0, credit: 0, description: '' }],
  });
  const [liquidarEntity, setLiquidarEntity] = useState<BalanceRow | null>(null);
  const [reponerEntity, setReponerEntity] = useState<BalanceRow | null>(null);
  const [showRepartirModal, setShowRepartirModal] = useState(false);
  const [repartirItems, setRepartirItems] = useState<Array<{ socio: string; amount_usd: number; amount_cop: number }>>([{ socio: '', amount_usd: 0, amount_cop: 0 }]);
  const [detalleLiquidacionEntity, setDetalleLiquidacionEntity] = useState<BalanceRow | null>(null);
  const [detalleLiquidacionLines, setDetalleLiquidacionLines] = useState<LedgerLine[]>([]);
  const [detalleLiquidacionLoading, setDetalleLiquidacionLoading] = useState(false);
  const [liquidarLoading, setLiquidarLoading] = useState(false);
  const [reponerLoading, setReponerLoading] = useState(false);
  const [repartirLoading, setRepartirLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    fetchClients();
    fetchEntities();
    fetchCategories();
    fetchAccounts();
  }, [isAdmin]);

  useEffect(() => {
    if (activeTab === 'config') {
      setConfigEntityExpanded(null);
      setConfigCategoryExpanded(null);
      setConfigDetailTransactions([]);
      setShowModal(false);
    }
  }, [activeTab, configTab]);

  const filteredClients = React.useMemo(() => {
    if (!configSearch.trim()) return clients;
    const q = configSearch.trim().toLowerCase();
    return clients.filter((c) => (c.name ?? '').toLowerCase().includes(q));
  }, [clients, configSearch]);

  const filteredEntities = React.useMemo(() => {
    if (!configSearch.trim()) return entities;
    const q = configSearch.trim().toLowerCase();
    return entities.filter((e) => {
      const name = (e.name ?? '').toLowerCase();
      const clientName = (e.client_id ? clients.find((c) => c.id === e.client_id)?.name ?? '' : '').toLowerCase();
      const type = (e.type ?? '').toLowerCase();
      return name.includes(q) || clientName.includes(q) || type.includes(q);
    });
  }, [entities, clients, configSearch]);

  const sortedEntities = React.useMemo(() => {
    return [...filteredEntities].sort((a, b) => {
      if (entitySortBy === 'name') {
        const cmp = (a.name ?? '').localeCompare(b.name ?? '', 'es');
        return entitySortOrder === 'asc' ? cmp : -cmp;
      }
      const cmp = (a.type ?? '').localeCompare(b.type ?? '', 'es');
      return entitySortOrder === 'asc' ? cmp : -cmp;
    });
  }, [filteredEntities, entitySortBy, entitySortOrder]);

  const filteredCategories = React.useMemo(() => {
    if (!configSearch.trim()) return categories;
    const q = configSearch.trim().toLowerCase();
    return categories.filter((c) =>
      (c.name ?? '').toLowerCase().includes(q) || (c.type ?? '').toLowerCase().includes(q)
    );
  }, [categories, configSearch]);

  const filteredAccounts = React.useMemo(() => {
    if (!configSearch.trim()) return accounts;
    const q = configSearch.trim().toLowerCase();
    return accounts.filter((a) =>
      (a.name ?? '').toLowerCase().includes(q) || (a.currency ?? '').toLowerCase().includes(q)
    );
  }, [accounts, configSearch]);

  useEffect(() => {
    setTransactionsPage(1);
  }, [filterStart, filterEnd, filterEntity, filterCategory, filterAccount, filterSearch]);

  useEffect(() => {
    if (!showModal) {
      setCategorySearchFilter('');
      setModalForTransaction(false);
      setShowCreateCategoryInTransaction(false);
      setNewCategoryName('');
    }
  }, [showModal]);

  useEffect(() => {
    if (configTab !== 'entities') setSelectedEntityIds(new Set());
  }, [configTab]);

  useEffect(() => {
    if (!detalleLiquidacionEntity) {
      setDetalleLiquidacionLines([]);
      return;
    }
    let cancelled = false;
    setDetalleLiquidacionLoading(true);
    contabilidadApi
      .getLedgerLines({
        start: balanceStart,
        end: balanceEnd,
        entity_id: detalleLiquidacionEntity.entity_id == null ? '__null__' : detalleLiquidacionEntity.entity_id,
      })
      .then((data) => {
        if (!cancelled) setDetalleLiquidacionLines(data);
      })
      .catch((e) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Error al cargar registros');
          setDetalleLiquidacionLines([]);
        }
      })
      .finally(() => {
        if (!cancelled) setDetalleLiquidacionLoading(false);
      });
    return () => { cancelled = true; };
  }, [detalleLiquidacionEntity, balanceStart, balanceEnd]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab === 'libro') {
      fetchLedgerLines();
      fetchChartAccounts();
    }
    if (activeTab === 'balance') {
      if (balanceView === 'balance' || balanceView === 'liquidacion') fetchBalance();
      else if (balanceView === 'pyg') fetchPyg();
      else if (balanceView === 'pyg_client') fetchPygByClient();
      else if (balanceView === 'pyg_matrix') fetchPygMatrix();
      else if (balanceView === 'pyg_matrix_client') fetchPygMatrixByClient();
      else fetchAccountBalances();
    }
    if (activeTab === 'asientos') {
      fetchChartAccounts();
      if (asientosTab === 'entries') fetchJournalEntries();
      if (asientosTab === 'trial') fetchTrialBalance();
    }
  }, [isAdmin, activeTab, balanceView, asientosTab, filterStart, filterEnd, filterEntity, filterCategory, filterAccount, balanceStart, balanceEnd, pygProjectsOnly, pygFilterClient, asientosStart, asientosEnd, entities]);

  async function fetchClients() {
    try {
      const data = await contabilidadApi.getClients();
      setClients(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar clientes');
    }
  }
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
  async function fetchLedgerLines() {
    setLoading(true);
    try {
      const params: { start?: string; end?: string; entity_id?: string; account_id?: string; category_id?: string } = {};
      if (filterStart) params.start = filterStart;
      if (filterEnd) params.end = filterEnd;
      if (filterEntity) params.entity_id = filterEntity;
      if (filterAccount) params.account_id = filterAccount;
      if (filterCategory) params.category_id = filterCategory;
      const data = await contabilidadApi.getLedgerLines(params);
      setLedgerLines(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar libro mayor');
      setLedgerLines([]);
    } finally {
      setLoading(false);
    }
  }
  async function fetchBalance() {
    setLoading(true);
    try {
      const params: { start?: string; end?: string; liquidacion?: boolean; excluir_contables?: boolean } = {};
      if (balanceStart) params.start = balanceStart;
      if (balanceEnd) params.end = balanceEnd;
      if (balanceView === 'liquidacion') params.liquidacion = true;
      // Balance = movimientos no contables (excluir SALIDA/INGRESO CONTABLE). Liquidación los incluye.
      if (balanceView === 'balance') params.excluir_contables = true;
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
      if (pygFilterClient) params.client_id = pygFilterClient;
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

  async function fetchPygByClient() {
    setLoading(true);
    try {
      const params: { start?: string; end?: string } = {};
      if (balanceStart) params.start = balanceStart;
      if (balanceEnd) params.end = balanceEnd;
      const data = await contabilidadApi.getPygByClient(params);
      setPygByClientData(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar P&G por cliente');
      setPygByClientData(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPygMatrix() {
    setLoading(true);
    try {
      const params: { start?: string; end?: string; projects_only?: boolean; entity_ids?: string } = {};
      if (balanceStart) params.start = balanceStart;
      if (balanceEnd) params.end = balanceEnd;
      if (pygProjectsOnly) params.projects_only = true;
      if (pygFilterClient) params.entity_ids = entities.filter((e) => e.client_id === pygFilterClient).map((e) => e.id).join(',');
      const data = await contabilidadApi.getPygMatrix(params);
      setPygMatrixData(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar P&G Matrix');
      setPygMatrixData(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPygMatrixByClient() {
    setLoading(true);
    try {
      const params: { start?: string; end?: string; client_ids?: string } = {};
      if (balanceStart) params.start = balanceStart;
      if (balanceEnd) params.end = balanceEnd;
      if (pygFilterClient) params.client_ids = pygFilterClient;
      const data = await contabilidadApi.getPygMatrixByClient(params);
      setPygMatrixClientData(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar P&G Matrix por cliente');
      setPygMatrixClientData(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchChartAccounts() {
    try {
      const data = await contabilidadApi.getChartAccounts();
      setChartAccounts(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar plan de cuentas');
      setChartAccounts([]);
    }
  }

  async function fetchJournalEntries() {
    try {
      const data = await contabilidadApi.getJournalEntries({ start: asientosStart, end: asientosEnd });
      setJournalEntries(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar asientos');
      setJournalEntries([]);
    }
  }

  async function fetchTrialBalance() {
    try {
      const data = await contabilidadApi.getTrialBalance({ start: asientosStart, end: asientosEnd });
      setTrialBalanceData(data);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar balance de comprobación');
      setTrialBalanceData(null);
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
      const data = await contabilidadApi.getLedgerLines(params);
      setPygDetailLedgerLines(data);
      setPygDetailTransactions(ledgerLinesToTransactionLike(data));
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar detalle');
      setPygDetailLedgerLines([]);
      setPygDetailTransactions([]);
    } finally {
      setPygDetailLoading(false);
    }
  }

  async function fetchPygDetailByClient(clientId: string | null) {
    if (!clientId) return;
    setPygDetailLoading(true);
    try {
      const params: { start?: string; end?: string; client_id?: string } = {};
      if (balanceStart) params.start = balanceStart;
      if (balanceEnd) params.end = balanceEnd;
      params.client_id = clientId;
      const data = await contabilidadApi.getLedgerLines(params);
      setPygDetailLedgerLines(data);
      setPygDetailTransactions(ledgerLinesToTransactionLike(data));
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar detalle');
      setPygDetailLedgerLines([]);
      setPygDetailTransactions([]);
    } finally {
      setPygDetailLoading(false);
    }
  }

  const [pygCellModal, setPygCellModal] = useState<{ colId: string; colName: string; rowKey: string; rowLabel: string; group: 'A' | 'B' | 'C'; byClient: boolean } | null>(null);
  const [pygCellLines, setPygCellLines] = useState<LedgerLine[]>([]);
  const [pygCellLoading, setPygCellLoading] = useState(false);

  async function openPygCellModal(colId: string, colName: string, rowKey: string, rowLabel: string, byClient: boolean) {
    if (colId === '__total__') return;
    const groupMap: Record<string, 'A' | 'B' | 'C'> = {
      ingresos: 'A',
      costos_directos: 'B',
      gastos_indirectos: 'C',
    };
    const group = groupMap[rowKey];
    if (!group) return;
    setPygCellModal({ colId, colName, rowKey, rowLabel, group, byClient });
    setPygCellLoading(true);
    setPygCellLines([]);
    try {
      const params: { start: string; end: string; pyg_group: 'A' | 'B' | 'C'; entity_id?: string | null; client_id?: string } = {
        start: balanceStart || '',
        end: balanceEnd || '',
        pyg_group: group,
      };
      if (byClient) params.client_id = colId === '__null__' ? '' : colId;
      else params.entity_id = colId === '__null__' ? null : colId;
      const data = await contabilidadApi.getPygCellLines(params);
      setPygCellLines(data);
    } catch {
      setPygCellLines([]);
    }
    setPygCellLoading(false);
  }

  const [pygDetailModalEntity, setPygDetailModalEntity] = useState<PygRow | null>(null);
  const [pygDetailModalClient, setPygDetailModalClient] = useState<PygRowByClient | null>(null);

  function openPygDetailModal(row: PygRow) {
    setPygDetailModalClient(null);
    setPygDetailModalEntity(row);
    fetchPygDetail(row.entity_id ?? null);
  }

  function openPygClientDetailModal(row: PygRowByClient) {
    setPygDetailModalEntity(null);
    setPygDetailModalClient(row);
    fetchPygDetailByClient(row.client_id ?? null);
  }

  async function fetchConfigDetail(type: 'entity' | 'category', id: string) {
    setConfigDetailLoading(true);
    try {
      const params = type === 'entity' ? { entity_id: id } : { category_id: id };
      const data = await contabilidadApi.getLedgerLines(params);
      setConfigDetailLedgerLines(data);
      setConfigDetailTransactions(ledgerLinesToTransactionLike(data));
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar detalle');
      setConfigDetailLedgerLines([]);
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

  async function handleSaveClient(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (modalMode === 'create') {
        await contabilidadApi.createClient(
          { name: currentClient.name!, sort_order: currentClient.sort_order ?? 0 },
          currentUser?.id
        );
        toast.success('Cliente creado');
      } else {
        await contabilidadApi.updateClient(
          currentClient.id!,
          { name: (currentClient.name ?? '').trim(), sort_order: currentClient.sort_order },
          currentUser?.id
        );
        toast.success('Cliente actualizado');
      }
      setShowModal(false);
      setCurrentClient({ name: '', sort_order: 0 });
      fetchClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }
  async function handleDeleteClient(id: string) {
    if (!window.confirm('¿Eliminar este cliente? Las entidades quedarán sin cliente asignado.')) return;
    try {
      await contabilidadApi.deleteClient(id, currentUser?.id);
      toast.success('Cliente eliminado');
      fetchClients();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar');
    }
  }
  async function handleSaveEntity(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (modalMode === 'create') {
        await contabilidadApi.createEntity(
          { name: currentEntity.name!, type: currentEntity.type!, client_id: currentEntity.client_id || null, sort_order: currentEntity.sort_order ?? 0 },
          currentUser?.id
        );
        toast.success('Entidad creada');
      } else {
        const res = await contabilidadApi.updateEntity(
          currentEntity.id!,
          { name: (currentEntity.name ?? '').trim(), type: currentEntity.type, client_id: currentEntity.client_id ?? null, sort_order: currentEntity.sort_order },
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
  async function handleBulkAssignClient() {
    if (!bulkAssignClientId || selectedEntityIds.size === 0) return;
    setBulkAssignLoading(true);
    try {
      const ids = Array.from(selectedEntityIds);
      for (const id of ids) {
        const ent = entities.find((e) => e.id === id);
        if (!ent) continue;
        await contabilidadApi.updateEntity(
          id,
          { name: ent.name ?? '', type: ent.type, client_id: bulkAssignClientId || null, sort_order: ent.sort_order },
          currentUser?.id
        );
      }
      toast.success(`${ids.length} entidad(es) actualizada(s)`);
      setSelectedEntityIds(new Set());
      setBulkAssignClientId('');
      fetchEntities();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setBulkAssignLoading(false);
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
  async function handleCreateCategoryFromTransaction() {
    const name = newCategoryName.trim();
    if (!name) {
      toast.error('Escribe el nombre de la categoría');
      return;
    }
    try {
      const type = (currentTransaction.type === 'income' ? 'income' : 'expense') as 'income' | 'expense';
      const cat = await contabilidadApi.createCategory(
        { name, type, parent_id: null },
        currentUser?.id
      );
      await fetchCategories();
      setCurrentTransaction((p) => ({ ...p, category_id: cat.id }));
      setNewCategoryName('');
      setShowCreateCategoryInTransaction(false);
      toast.success('Categoría creada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear');
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

  const sortedLedgerLines = React.useMemo(() => {
    let list = [...ledgerLines];
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase();
      list = list.filter(
        (l) =>
          (l.description || '').toLowerCase().includes(q) ||
          (l.entity_name || '').toLowerCase().includes(q) ||
          (l.account_name || '').toLowerCase().includes(q) ||
          (l.account_code || '').toLowerCase().includes(q) ||
          (l.debit?.toString() ?? '').includes(q) ||
          (l.credit?.toString() ?? '').includes(q)
      );
    }
    return list.sort((a, b) => {
      const da = (a.date ? new Date(a.date).getTime() : 0);
      const db = (b.date ? new Date(b.date).getTime() : 0);
      return sortDateOrder === 'desc' ? db - da : da - db;
    });
  }, [ledgerLines, sortDateOrder, filterSearch]);

  const totalPages = Math.max(1, Math.ceil(sortedLedgerLines.length / transactionsPageSize));
  const paginatedLedgerLines = sortedLedgerLines.slice(
    (transactionsPage - 1) * transactionsPageSize,
    transactionsPage * transactionsPageSize
  );

  async function handleEditJournalEntry(entryId: string) {
    try {
      const entry = await contabilidadApi.getJournalEntry(entryId);
      const lines = (entry.lines ?? []).map((l) => ({
        account_id: l.account_id,
        entity_id: l.entity_id ?? null,
        debit: l.debit ?? 0,
        credit: l.credit ?? 0,
        description: l.description ?? '',
      }));
      setCurrentJournalEntry({
        date: entry.date ? new Date(entry.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        description: entry.description ?? '',
        reference: entry.reference ?? '',
        lines: lines.length >= 2 ? lines : [...lines, { account_id: '', entity_id: null, debit: 0, credit: 0, description: '' }],
      });
      setEditingJournalEntryId(entryId);
      setShowJournalEntryModal(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar asiento');
    }
  }

  async function handleDeleteJournalEntry(entryId: string) {
    if (!confirm('¿Eliminar este asiento? Esta acción no se puede deshacer.')) return;
    try {
      await contabilidadApi.deleteJournalEntry(entryId, currentUser?.id);
      toast.success('Asiento eliminado');
      fetchLedgerLines();
      if (asientosTab === 'entries') fetchJournalEntries();
      fetchTrialBalance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar');
    }
  }

  async function handleImportPreview() {
    if (!importCsvText.trim()) {
      toast.error('Pega el contenido del CSV');
      return;
    }
    setImportPreviewLoading(true);
    setImportPreviewData(null);
    try {
      const data = await contabilidadApi.importPreview(importCsvText, { default_currency: 'USD' });
      setImportPreviewData(data);
      setImportCategoryMapping({});
      setImportStep('preview');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al analizar el CSV');
    } finally {
      setImportPreviewLoading(false);
    }
  }

  async function handleImportCsv() {
    if (!importCsvText.trim()) {
      toast.error('Pega el contenido del CSV');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const mapping = Object.fromEntries(
        Object.entries(importCategoryMapping).filter(([from, to]) => to && to !== from)
      );
      const result = await contabilidadApi.importCsv(
        importCsvText,
        { default_currency: 'USD', category_mapping: Object.keys(mapping).length > 0 ? mapping : undefined },
        currentUser?.id
      );
      setImportResult(result);
      setImportStep('done');
      toast.success(`Importados ${result.created} asientos`);
      fetchEntities();
      fetchCategories();
      fetchAccounts();
      fetchChartAccounts();
      fetchLedgerLines();
      fetchImportBatches();
      if (balanceView === 'balance' || balanceView === 'liquidacion') fetchBalance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al importar');
    } finally {
      setImporting(false);
    }
  }

  async function fetchImportBatches() {
    try {
      const data = await contabilidadApi.getImportBatches();
      setImportBatches(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar historial');
      setImportBatches([]);
    }
  }

  async function handleRollback(batchId: string) {
    if (!window.confirm('¿Revertir esta importación? Se eliminarán todos los asientos, cuentas, categorías, entidades y cuentas de pago creados. Esta acción no se puede deshacer.')) return;
    setRollbackLoading(batchId);
    try {
      const res = await contabilidadApi.rollbackImport(batchId);
      toast.success(`${res.rolled_back} asientos revertidos`);
      await fetchImportBatches();
      if (activeTab === 'libro') fetchLedgerLines();
      else if (activeTab === 'balance') {
        if (balanceView === 'pyg_matrix') fetchPygMatrix();
        else if (balanceView === 'pyg_matrix_client') fetchPygMatrixByClient();
        else if (balanceView === 'accounts') fetchAccountBalances();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al revertir');
    } finally {
      setRollbackLoading(null);
    }
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportCsvText('');
    setImportResult(null);
    setImportPreviewData(null);
    setImportStep('upload');
    setImportPreviewFilter('all');
    setImportCategoryMapping({});
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
    { id: 'asientos' as MainTab, label: 'Asientos (partida doble)', icon: FileText },
    { id: 'config' as MainTab, label: 'Configuración', icon: Settings },
  ];

  const configTabs = [
    { id: 'clients' as ConfigTab, label: 'Clientes', icon: Users },
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
            <button
              type="button"
              onClick={() => setSortDateOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
              className="flex items-center gap-1 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
            >
              Fecha {sortDateOrder === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
            </button>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Buscar</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder="Descripción, entidad, categoría..."
                  className="pl-9 pr-3 py-2 border rounded-lg text-sm min-w-[160px]"
                />
              </div>
            </div>
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
              <label className="block text-sm text-gray-600 mb-1">Cuenta contable</label>
              <select
                value={filterAccount}
                onChange={(e) => setFilterAccount(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm min-w-[160px]"
              >
                <option value="">Todas</option>
                {chartAccounts.filter((a) => !a.is_header).map((a) => (
                  <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowImportModal(true)}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-2"
            >
              <Upload className="w-5 h-5" />
              Importar CSV
            </button>
            <button
              onClick={() => { setShowImportHistoryModal(true); fetchImportBatches(); }}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-2"
            >
              <History className="w-5 h-5" />
              Historial de importaciones
            </button>
            <button
              onClick={() => {
                const nonHeader = chartAccounts.filter((a) => !a.is_header);
                setCurrentJournalEntry({
                  date: new Date().toISOString().split('T')[0],
                  description: '',
                  reference: '',
                  lines: [
                    { account_id: nonHeader[0]?.id ?? '', entity_id: null, debit: 0, credit: 0, description: '' },
                    { account_id: nonHeader[1]?.id ?? '', entity_id: null, debit: 0, credit: 0, description: '' },
                  ],
                });
                setEditingJournalEntryId(null);
                setShowJournalEntryModal(true);
              }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Nuevo asiento
            </button>
          </div>

          {loading ? (
            <div className="animate-pulse h-48 bg-gray-200 rounded-lg" />
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <LedgerLineTable
                  lines={paginatedLedgerLines}
                  onEditEntry={handleEditJournalEntry}
                  onDeleteEntry={handleDeleteJournalEntry}
                />
              </div>
              {ledgerLines.length === 0 ? (
                <div className="p-12 text-center text-gray-500">No hay movimientos en el período seleccionado. Importa un CSV o crea un asiento.</div>
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
                      {((transactionsPage - 1) * transactionsPageSize) + 1}–{Math.min(transactionsPage * transactionsPageSize, sortedLedgerLines.length)} de {sortedLedgerLines.length}
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
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="inline-flex p-1 bg-gray-100 rounded-xl gap-0.5 overflow-x-auto">
              {[
                { id: 'pyg_matrix', label: 'P&G por proyecto', icon: BarChart3 },
                { id: 'pyg_matrix_client', label: 'P&G por cliente', icon: Users },
                { id: 'liquidacion', label: 'Liquidación', icon: CheckCircle2 },
                { id: 'accounts', label: 'Cuentas', icon: CreditCard },
                { id: 'balance', label: 'Balance', icon: DollarSign },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setBalanceView(id as typeof balanceView)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    balanceView === id
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {balanceView !== 'accounts' && (
                <DateRangePicker
                  start={balanceStart}
                  end={balanceEnd}
                  onStartChange={setBalanceStart}
                  onEndChange={setBalanceEnd}
                  onPreset={(id) => applyPeriodPreset(id, 'balance')}
                />
              )}
              {(balanceView === 'pyg_matrix' || balanceView === 'pyg_matrix_client') && (
                <>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Moneda</span>
                    <div className="flex rounded-md p-0.5 bg-white shadow-sm ring-1 ring-gray-200">
                      <button
                        onClick={() => setPygMatrixCurrency('usd')}
                        className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                          pygMatrixCurrency === 'usd'
                            ? 'bg-indigo-600 text-white'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        USD
                      </button>
                      <button
                        onClick={() => setPygMatrixCurrency('cop')}
                        className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                          pygMatrixCurrency === 'cop'
                            ? 'bg-indigo-600 text-white'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        COP
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pygMatrixHideAdmin}
                      onChange={(e) => setPygMatrixHideAdmin(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Ocultar "No asignado"
                  </label>
                </>
              )}
              {balanceView === 'pyg_matrix' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">Cliente</label>
                    <select
                      value={pygFilterClient}
                      onChange={(e) => setPygFilterClient(e.target.value)}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm min-w-[140px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">Todos</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pygProjectsOnly}
                      onChange={(e) => setPygProjectsOnly(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Solo proyectos
                  </label>
                </>
              )}
              {balanceView === 'pyg_matrix_client' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Cliente</label>
                  <select
                    value={pygFilterClient}
                    onChange={(e) => setPygFilterClient(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm min-w-[140px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Todos</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {balanceView === 'accounts' && (
                <p className="text-sm text-gray-500">Saldo acumulado (sin filtro de fechas)</p>
              )}
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="animate-pulse p-8 space-y-4">
                <div className="h-10 bg-gray-200 rounded-lg w-1/3" />
                <div className="h-64 bg-gray-100 rounded-lg" />
              </div>
            </div>
          ) : balanceView === 'accounts' && accountBalancesData ? (
            (() => {
              const hasCopAccounts = accountBalancesData.total_cop !== 0 || accountBalancesData.rows.some((r) => r.cop !== 0);
              return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold text-gray-800">Cuenta</th>
                    <th className="px-6 py-4 text-right font-semibold text-gray-800">USD</th>
                    {hasCopAccounts && <th className="px-6 py-4 text-right font-semibold text-gray-800">COP</th>}
                  </tr>
                </thead>
                <tbody>
                  {accountBalancesData.rows.map((r) => (
                    <tr key={r.payment_account_id} className="border-t border-gray-100 hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-800">{r.account_name}</td>
                      <td className={`px-6 py-3 text-right tabular-nums font-medium ${r.usd >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {r.usd >= 0 ? '+' : ''}{r.usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      {hasCopAccounts && (
                        <td className={`px-6 py-3 text-right tabular-nums font-medium ${r.cop >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {r.cop >= 0 ? '+' : ''}{r.cop.toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 border-t-2 border-gray-200 font-semibold">
                  <tr>
                    <td className="px-6 py-4 text-gray-900">Total</td>
                    <td className={`px-6 py-4 text-right tabular-nums ${accountBalancesData.total_usd >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {accountBalancesData.total_usd >= 0 ? '+' : ''}{accountBalancesData.total_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                    </td>
                    {hasCopAccounts && (
                      <td className={`px-6 py-4 text-right tabular-nums ${accountBalancesData.total_cop >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {accountBalancesData.total_cop >= 0 ? '+' : ''}{accountBalancesData.total_cop.toLocaleString('es-CO', { minimumFractionDigits: 0 })} COP
                      </td>
                    )}
                  </tr>
                </tfoot>
              </table>
              {accountBalancesData.rows.length === 0 && (
                <div className="p-16 text-center">
                  <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No hay movimientos en las cuentas.</p>
                </div>
              )}
            </div>
            );
            })()
          ) : balanceView === 'pyg_matrix' && pygMatrixData ? (
            (() => {
              const cols = pygMatrixHideAdmin
                ? pygMatrixData.columns.filter((c) => c.id !== '__null__')
                : pygMatrixData.columns;
              const fmt = (n: number, isPct: boolean) =>
                isPct ? `${n}%` : (n >= 0 ? '+' : '') + (pygMatrixCurrency === 'usd' ? n.toLocaleString('en-US', { minimumFractionDigits: 2 }) : n.toLocaleString('es-CO', { minimumFractionDigits: 0 }));
              const getVal = (cells: Record<string, { usd: number; cop: number }>, colId: string) => {
                const c = cells[colId];
                return c ? (pygMatrixCurrency === 'usd' ? c.usd : c.cop) : 0;
              };
              const isPct = (key: string) => key.includes('margen') || key.includes('pct');
              const isUtilidad = (key: string) => key.includes('utilidad');
              const isSection = (key: string) => ['ingresos', 'utilidad_bruta', 'utilidad_operativa'].includes(key);
              return (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead className="bg-gray-50/80">
                        <tr>
                          <th className="px-5 py-4 text-left font-semibold text-gray-800 sticky left-0 bg-gray-50/95 z-10 min-w-[240px] backdrop-blur-sm">
                            <span className="flex items-center gap-2">
                              Concepto
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-medium">{pygMatrixCurrency.toUpperCase()}</span>
                            </span>
                          </th>
                          {cols.map((c) => (
                            <th key={c.id} className={`px-4 py-4 text-right font-medium whitespace-nowrap ${c.id === '__total__' ? 'text-indigo-700 bg-indigo-50/80 sticky right-0 z-10' : 'text-gray-700'}`}>{c.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pygMatrixData.rows.map((row) => (
                          <tr
                            key={row.key}
                            className={`border-t border-gray-100 hover:bg-gray-50/80 transition-colors group ${
                              isSection(row.key) ? 'border-t-2 border-gray-200' : ''
                            } ${isUtilidad(row.key) ? 'bg-gray-50/50' : ''}`}
                          >
                            <td className={`px-5 py-3 sticky left-0 z-[1] min-w-[240px] group-hover:bg-gray-50/80 ${
                              isUtilidad(row.key) ? 'bg-gray-50/50 font-semibold text-gray-900' : 'bg-white text-gray-700'
                            }`}>
                              {row.label}
                            </td>
                            {cols.map((c) => {
                              const v = getVal(row.cells, c.id);
                              const pct = isPct(row.key);
                              const isTotal = c.id === '__total__';
                              const isClickable = !isTotal && ['ingresos', 'costos_directos', 'gastos_indirectos'].includes(row.key);
                              return (
                                <td
                                  key={c.id}
                                  className={`px-4 py-3 text-right tabular-nums group-hover:bg-gray-50/80 ${
                                    isTotal ? 'font-semibold sticky right-0 z-[1]' : ''
                                  } ${isTotal ? (isUtilidad(row.key) ? 'bg-gray-50/50' : 'bg-white') : ''} ${pct ? 'text-gray-600' : v >= 0 ? 'text-emerald-600' : 'text-red-600'} ${
                                    isTotal && isUtilidad(row.key) ? (v >= 0 ? 'text-emerald-700' : 'text-red-700') : ''
                                  } ${isClickable ? 'cursor-pointer hover:bg-indigo-50/80 hover:underline' : ''}`}
                                  onClick={isClickable ? () => openPygCellModal(c.id, c.name, row.key, row.label, false) : undefined}
                                >
                                  {pct ? (v !== 0 ? fmt(v, true) : '—') : fmt(v, false)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {pygMatrixData.rows.length === 0 && (
                    <div className="p-16 text-center">
                      <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">No hay movimientos en el período.</p>
                      <p className="text-sm text-gray-400 mt-1">Ajusta el rango de fechas o los filtros.</p>
                    </div>
                  )}
                </div>
              );
            })()
          ) : balanceView === 'pyg_matrix_client' && pygMatrixClientData ? (
            (() => {
              const cols = pygMatrixHideAdmin
                ? pygMatrixClientData.columns.filter((c) => c.id !== '__null__')
                : pygMatrixClientData.columns;
              const fmt = (n: number, isPct: boolean) =>
                isPct ? `${n}%` : (n >= 0 ? '+' : '') + (pygMatrixCurrency === 'usd' ? n.toLocaleString('en-US', { minimumFractionDigits: 2 }) : n.toLocaleString('es-CO', { minimumFractionDigits: 0 }));
              const getVal = (cells: Record<string, { usd: number; cop: number }>, colId: string) => {
                const c = cells[colId];
                return c ? (pygMatrixCurrency === 'usd' ? c.usd : c.cop) : 0;
              };
              const isPct = (key: string) => key.includes('margen') || key.includes('pct');
              const isUtilidad = (key: string) => key.includes('utilidad');
              const isSection = (key: string) => ['ingresos', 'utilidad_bruta', 'utilidad_operativa'].includes(key);
              return (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead className="bg-gray-50/80">
                        <tr>
                          <th className="px-5 py-4 text-left font-semibold text-gray-800 sticky left-0 bg-gray-50/95 z-10 min-w-[240px] backdrop-blur-sm">
                            <span className="flex items-center gap-2">
                              Concepto
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-medium">{pygMatrixCurrency.toUpperCase()}</span>
                            </span>
                          </th>
                          {cols.map((c) => (
                            <th key={c.id} className={`px-4 py-4 text-right font-medium whitespace-nowrap ${c.id === '__total__' ? 'text-indigo-700 bg-indigo-50/80 sticky right-0 z-10' : 'text-gray-700'}`}>{c.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pygMatrixClientData.rows.map((row) => (
                          <tr
                            key={row.key}
                            className={`border-t border-gray-100 hover:bg-gray-50/80 transition-colors group ${
                              isSection(row.key) ? 'border-t-2 border-gray-200' : ''
                            } ${isUtilidad(row.key) ? 'bg-gray-50/50' : ''}`}
                          >
                            <td className={`px-5 py-3 sticky left-0 z-[1] min-w-[240px] group-hover:bg-gray-50/80 ${
                              isUtilidad(row.key) ? 'bg-gray-50/50 font-semibold text-gray-900' : 'bg-white text-gray-700'
                            }`}>
                              {row.label}
                            </td>
                            {cols.map((c) => {
                              const v = getVal(row.cells, c.id);
                              const pct = isPct(row.key);
                              const isTotal = c.id === '__total__';
                              const isClickable = !isTotal && ['ingresos', 'costos_directos', 'gastos_indirectos'].includes(row.key);
                              return (
                                <td
                                  key={c.id}
                                  className={`px-4 py-3 text-right tabular-nums group-hover:bg-gray-50/80 ${
                                    isTotal ? 'font-semibold sticky right-0 z-[1]' : ''
                                  } ${isTotal ? (isUtilidad(row.key) ? 'bg-gray-50/50' : 'bg-white') : ''} ${pct ? 'text-gray-600' : v >= 0 ? 'text-emerald-600' : 'text-red-600'} ${
                                    isTotal && isUtilidad(row.key) ? (v >= 0 ? 'text-emerald-700' : 'text-red-700') : ''
                                  } ${isClickable ? 'cursor-pointer hover:bg-indigo-50/80 hover:underline' : ''}`}
                                  onClick={isClickable ? () => openPygCellModal(c.id, c.name, row.key, row.label, true) : undefined}
                                >
                                  {pct ? (v !== 0 ? fmt(v, true) : '—') : fmt(v, false)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {pygMatrixClientData.rows.length === 0 && (
                    <div className="p-16 text-center">
                      <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">No hay movimientos en el período.</p>
                      <p className="text-sm text-gray-400 mt-1">Ajusta el rango de fechas o los filtros.</p>
                    </div>
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
                    return (
                      <React.Fragment key={rowKey}>
                        <tr
                          onClick={() => openPygDetailModal(r)}
                          className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer select-none"
                        >
                          <td className="px-6 py-3 font-medium">
                            <span className="inline-flex items-center gap-1">
                              <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
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
          ) : balanceView === 'pyg_client' && pygByClientData ? (
            (() => {
              const hasCopPygClient = pygByClientData.total_cop.ingresos !== 0 || pygByClientData.total_cop.gastos !== 0 || pygByClientData.total_cop.resultado !== 0 ||
                pygByClientData.rows.some((r) => r.cop.ingresos !== 0 || r.cop.gastos !== 0 || r.cop.resultado !== 0);
              const baseRows = pygClientHideNoClient
                ? pygByClientData.rows.filter((r) => r.client_id != null)
                : pygByClientData.rows;
              const sortedPygClientRows = [...baseRows].sort((a, b) => {
                let cmp = 0;
                if (pygClientSortBy === 'client') {
                  cmp = (a.client_name ?? '').localeCompare(b.client_name ?? '', 'es');
                } else if (pygClientSortBy === 'ing_usd') cmp = a.usd.ingresos - b.usd.ingresos;
                else if (pygClientSortBy === 'gastos_usd') cmp = a.usd.gastos - b.usd.gastos;
                else if (pygClientSortBy === 'resultado_usd') cmp = a.usd.resultado - b.usd.resultado;
                else if (pygClientSortBy === 'ing_cop') cmp = a.cop.ingresos - b.cop.ingresos;
                else if (pygClientSortBy === 'gastos_cop') cmp = a.cop.gastos - b.cop.gastos;
                else cmp = a.cop.resultado - b.cop.resultado;
                return pygClientSortOrder === 'asc' ? cmp : -cmp;
              });
              const displayTotals = pygClientHideNoClient
                ? sortedPygClientRows.reduce(
                    (acc, r) => ({
                      usd: { ingresos: acc.usd.ingresos + r.usd.ingresos, gastos: acc.usd.gastos + r.usd.gastos, resultado: acc.usd.resultado + r.usd.resultado },
                      cop: { ingresos: acc.cop.ingresos + r.cop.ingresos, gastos: acc.cop.gastos + r.cop.gastos, resultado: acc.cop.resultado + r.cop.resultado },
                    }),
                    { usd: { ingresos: 0, gastos: 0, resultado: 0 }, cop: { ingresos: 0, gastos: 0, resultado: 0 } }
                  )
                : { usd: pygByClientData.total_usd, cop: pygByClientData.total_cop };
              const handlePygClientSort = (col: typeof pygClientSortBy) => {
                const isSame = pygClientSortBy === col;
                const newOrder = isSame ? (pygClientSortOrder === 'asc' ? 'desc' : 'asc') : (col === 'client' ? 'asc' : 'desc');
                setPygClientSortBy(col);
                setPygClientSortOrder(newOrder);
              };
              const PygClientSortBtn = ({ col, label }: { col: typeof pygClientSortBy; label: string }) => (
                <button type="button" onClick={() => handlePygClientSort(col)} className="flex items-center gap-1 hover:text-indigo-600 w-full justify-end">
                  {label}
                  {pygClientSortBy === col && (pygClientSortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />)}
                </button>
              );
              return (
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Cliente</th>
                    <th colSpan={3} className="px-2 py-3 text-center font-medium text-gray-700 border-l">USD</th>
                    {hasCopPygClient && <th colSpan={3} className="px-2 py-3 text-center font-medium text-gray-700 border-l">COP</th>}
                  </tr>
                  <tr className="bg-gray-50">
                    <th>
                      <button type="button" onClick={() => handlePygClientSort('client')} className="flex items-center gap-1 hover:text-indigo-600">
                        Cliente
                        {pygClientSortBy === 'client' && (pygClientSortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />)}
                      </button>
                    </th>
                    <th className="px-2 py-1 text-right text-xs font-medium text-gray-500"><PygClientSortBtn col="ing_usd" label="Ingresos" /></th>
                    <th className="px-2 py-1 text-right text-xs font-medium text-gray-500"><PygClientSortBtn col="gastos_usd" label="Gastos" /></th>
                    <th className="px-2 py-1 text-right text-xs font-medium text-gray-500"><PygClientSortBtn col="resultado_usd" label="Resultado" /></th>
                    {hasCopPygClient && (
                      <>
                        <th className="px-2 py-1 text-right text-xs font-medium text-gray-500 border-l"><PygClientSortBtn col="ing_cop" label="Ingresos" /></th>
                        <th className="px-2 py-1 text-right text-xs font-medium text-gray-500 border-l"><PygClientSortBtn col="gastos_cop" label="Gastos" /></th>
                        <th className="px-2 py-1 text-right text-xs font-medium text-gray-500 border-l"><PygClientSortBtn col="resultado_cop" label="Resultado" /></th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedPygClientRows.map((r) => {
                    const rowKey = r.client_id ?? 'sin-cliente';
                    const isClickable = !!r.client_id;
                    return (
                      <tr
                        key={rowKey}
                        onClick={() => isClickable && openPygClientDetailModal(r)}
                        className={`border-t border-gray-100 hover:bg-gray-50 ${isClickable ? 'cursor-pointer select-none' : ''}`}
                      >
                        <td className="px-6 py-3 font-medium">
                          <span className="inline-flex items-center gap-1">
                            {isClickable && <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />}
                            {r.client_name}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-right text-emerald-600">{r.usd.ingresos.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className="px-2 py-3 text-right text-red-600">{r.usd.gastos.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className={`px-2 py-3 text-right font-medium ${r.usd.resultado >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {r.usd.resultado >= 0 ? '+' : ''}{r.usd.resultado.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        {hasCopPygClient && (
                          <>
                            <td className="px-2 py-3 text-right text-emerald-600 border-l">{r.cop.ingresos.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                            <td className="px-2 py-3 text-right text-red-600">{r.cop.gastos.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                            <td className={`px-2 py-3 text-right font-medium ${r.cop.resultado >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {r.cop.resultado >= 0 ? '+' : ''}{r.cop.resultado.toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-100 font-semibold">
                  <tr>
                    <td className="px-6 py-3">Total</td>
                    <td className="px-2 py-3 text-right text-emerald-700">{displayTotals.usd.ingresos.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className="px-2 py-3 text-right text-red-700">{displayTotals.usd.gastos.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className={`px-2 py-3 text-right ${displayTotals.usd.resultado >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {displayTotals.usd.resultado >= 0 ? '+' : ''}{displayTotals.usd.resultado.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    {hasCopPygClient && (
                      <>
                        <td className="px-2 py-3 text-right text-emerald-700 border-l">{displayTotals.cop.ingresos.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                        <td className="px-2 py-3 text-right text-red-700">{displayTotals.cop.gastos.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</td>
                        <td className={`px-2 py-3 text-right ${displayTotals.cop.resultado >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {displayTotals.cop.resultado >= 0 ? '+' : ''}{displayTotals.cop.resultado.toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                        </td>
                      </>
                    )}
                  </tr>
                </tfoot>
              </table>
              {sortedPygClientRows.length === 0 && (
                <div className="p-12 text-center text-gray-500">No hay movimientos en el período seleccionado. Asigna clientes a las entidades para ver el P&G por cliente.</div>
              )}
            </div>
            );
            })()
          ) : balanceView === 'liquidacion' && balanceData ? (
            (() => {
              const hasCopBalance = balanceData.total_cop !== 0 || balanceData.rows.some((r) => r.cop !== 0);
              const totalDisplay = (r: BalanceRow) => {
                if (hasCopBalance && r.cop !== 0) return `${r.usd >= 0 ? '+' : ''}${r.usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD / ${r.cop >= 0 ? '+' : ''}${r.cop.toLocaleString('es-CO', { minimumFractionDigits: 0 })} COP`;
                return `${r.usd >= 0 ? '+' : ''}${r.usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
              };
              const fondoLibreRow = balanceData.rows.find((r) => (r.entity_name || '').toUpperCase() === 'FONDO LIBRE');
              const otherRows = balanceData.rows.filter((r) => (r.entity_name || '').toUpperCase() !== 'FONDO LIBRE');
              return (
            <div className="space-y-4">
              {/* Card FONDO LIBRE — hub central */}
              {fondoLibreRow && (
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 shadow-xl border border-indigo-500/20">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15)_0%,transparent_50%)]" />
                  <div className="relative px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-white/15 backdrop-blur-sm">
                        <Landmark className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white tracking-tight">FONDO LIBRE</h3>
                        <p className="text-indigo-200 text-sm mt-0.5">
                          Hub central • Los proyectos liquidan aquí • AGENCIA X se repone desde aquí
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`text-2xl sm:text-3xl font-bold tabular-nums ${(fondoLibreRow.usd >= 0 && fondoLibreRow.cop >= 0) ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {totalDisplay(fondoLibreRow)}
                      </div>
                      <button
                        type="button"
                        onClick={() => setDetalleLiquidacionEntity(fondoLibreRow)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        Ver detalle
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-amber-50/80 border-b border-amber-100 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-amber-800">
                    <strong>Proyectos:</strong> Liquidar los positivos → FONDO LIBRE. Reponer AGENCIA X si está en negativo.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setRepartirItems([{ socio: '', amount_usd: 0, amount_cop: 0 }]); setShowRepartirModal(true); }}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                  >
                    Repartir a socios
                  </button>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-gray-700">Proyecto</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-700">TOTALES</th>
                      <th className="px-6 py-3 w-40"></th>
                    </tr>
                  </thead>
                  <tbody>
                  {otherRows.map((r) => {
                    const isLiquidado = Math.abs(r.usd) < 0.01 && Math.abs(r.cop) < 0.01;
                    const canLiquidar = (r.usd > 0 || r.cop > 0) && r.entity_id && r.entity_name !== 'Sin asignar';
                    const isAgenciaX = (r.entity_name || '').toUpperCase() === 'AGENCIA X';
                    const canReponer = isAgenciaX && (r.usd < -0.01 || r.cop < -0.01) && r.entity_id;
                    return (
                    <tr key={r.entity_id ?? 'sin-asignar'} className={`border-t border-gray-100 hover:bg-gray-50 ${isLiquidado ? 'bg-emerald-50/50' : ''}`}>
                      <td className="px-6 py-3 font-medium flex items-center gap-2">
                        {r.entity_name}
                        {isLiquidado && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Liquidado
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setDetalleLiquidacionEntity(r)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 hover:text-indigo-600"
                          title="Ver registros del saldo"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ver detalle
                        </button>
                      </td>
                      <td className={`px-6 py-3 text-right font-medium tabular-nums ${r.usd >= 0 && r.cop >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {totalDisplay(r)}
                      </td>
                      <td className="px-6 py-3 flex gap-2">
                        {canLiquidar && (
                          <button
                            type="button"
                            onClick={() => setLiquidarEntity(r)}
                            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                          >
                            Liquidar
                          </button>
                        )}
                        {canReponer && (
                          <button
                            type="button"
                            onClick={() => setReponerEntity(r)}
                            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                          >
                            Reponer
                          </button>
                        )}
                      </td>
                    </tr>
                  );})}
                </tbody>
                <tfoot className="bg-gray-100 font-semibold">
                  <tr>
                    <td className="px-6 py-3">Total general</td>
                    <td className={`px-6 py-3 text-right ${balanceData.total_usd + (hasCopBalance ? balanceData.total_cop / 4000 : 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {balanceData.total_usd >= 0 ? '+' : ''}{balanceData.total_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                      {hasCopBalance && balanceData.total_cop !== 0 && (
                        <span className="ml-2">{balanceData.total_cop >= 0 ? '+' : ''}{balanceData.total_cop.toLocaleString('es-CO', { minimumFractionDigits: 0 })} COP</span>
                      )}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              {otherRows.length === 0 && !fondoLibreRow && (
                <div className="p-12 text-center text-gray-500">No hay movimientos en el período seleccionado.</div>
              )}
              {otherRows.length === 0 && fondoLibreRow && (
                <div className="p-8 text-center text-gray-500">Solo FONDO LIBRE tiene saldo en este período.</div>
              )}
            </div>
            </div>
            );
            })()
          ) : balanceData ? (
            (() => {
              const rowsSinFondo = balanceData.rows.filter((r) => (r.entity_name || '').toUpperCase() !== 'FONDO LIBRE');
              const totalUsdSinFondo = rowsSinFondo.reduce((s, r) => s + r.usd, 0);
              const totalCopSinFondo = rowsSinFondo.reduce((s, r) => s + r.cop, 0);
              const hasCopBalance = totalCopSinFondo !== 0 || rowsSinFondo.some((r) => r.cop !== 0);
              return (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Entidad</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-700">USD</th>
                    {hasCopBalance && <th className="px-6 py-3 text-right font-medium text-gray-700">COP</th>}
                    <th className="px-6 py-3 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {rowsSinFondo.map((r) => (
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
                      <td className="px-6 py-3">
                        <button
                          type="button"
                          onClick={() => setDetalleLiquidacionEntity(r)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 hover:text-indigo-600"
                          title="Ver registros del saldo"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 font-semibold">
                  <tr>
                    <td className="px-6 py-3">Total general</td>
                    <td className={`px-6 py-3 text-right ${totalUsdSinFondo >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {totalUsdSinFondo >= 0 ? '+' : ''}{totalUsdSinFondo.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                    </td>
                    {hasCopBalance && (
                      <td className={`px-6 py-3 text-right ${totalCopSinFondo >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {totalCopSinFondo >= 0 ? '+' : ''}{totalCopSinFondo.toLocaleString('es-CO', { minimumFractionDigits: 0 })} COP
                      </td>
                    )}
                    <td></td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-indigo-700">Utilidad distribuible</td>
                    <td className="px-6 py-3 text-right text-indigo-700 font-bold">
                      {totalUsdSinFondo >= 0 ? '+' : ''}{totalUsdSinFondo.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                    </td>
                    {hasCopBalance && (
                      <td className="px-6 py-3 text-right text-indigo-700 font-bold">
                        {totalCopSinFondo >= 0 ? '+' : ''}{totalCopSinFondo.toLocaleString('es-CO', { minimumFractionDigits: 0 })} COP
                      </td>
                    )}
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              {rowsSinFondo.length === 0 && (
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
          <div className="flex flex-wrap gap-4 mb-6 items-center">
            <div className="flex gap-2">
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
            <div className="flex flex-1 min-w-[200px] max-w-xs items-center gap-2">
              <Search className="w-5 h-5 text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder={
                  configTab === 'clients' ? 'Buscar clientes...' :
                  configTab === 'entities' ? 'Buscar entidades...' :
                  configTab === 'categories' ? 'Buscar categorías...' :
                  'Buscar cuentas...'
                }
                value={configSearch}
                onChange={(e) => setConfigSearch(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-lg text-sm"
              />
              {configSearch && (
                <button
                  type="button"
                  onClick={() => setConfigSearch('')}
                  className="text-gray-500 hover:text-gray-700 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {configTab === 'clients' && (
            <div>
              <button
                onClick={() => { setCurrentClient({ name: '', sort_order: 0 }); setModalMode('create'); setShowModal(true); }}
                className="mb-4 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Nuevo cliente
              </button>
              <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[400px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-gray-700">Nombre</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((c) => (
                      <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium">{c.name}</td>
                        <td className="px-6 py-3 text-right">
                          <button onClick={() => { setCurrentClient(c); setModalMode('edit'); setShowModal(true); }} className="text-indigo-600 hover:text-indigo-800 p-1"><Edit className="w-4 h-4 inline" /></button>
                          <button onClick={() => handleDeleteClient(c.id)} className="text-red-600 hover:text-red-800 p-1 ml-1"><Trash2 className="w-4 h-4 inline" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredClients.length === 0 && (
                  <div className="p-8 text-center text-gray-500">
                    {configSearch ? 'No hay clientes que coincidan con la búsqueda.' : 'No hay clientes. Crea uno para agrupar entidades y filtrar P&G por cliente.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {configTab === 'entities' && (
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => { setCurrentEntity({ name: '', type: 'project', sort_order: 0 }); setModalMode('create'); setShowModal(true); }}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Nueva entidad
                </button>
                {selectedEntityIds.size > 0 && (
                  <div className="flex items-center gap-3 flex-wrap bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2">
                    <span className="text-sm font-medium text-indigo-800">{selectedEntityIds.size} seleccionada(s)</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={bulkAssignClientId}
                        onChange={(e) => setBulkAssignClientId(e.target.value)}
                        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white"
                      >
                        <option value="">Elegir cliente…</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleBulkAssignClient}
                        disabled={!bulkAssignClientId || bulkAssignLoading}
                        className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 text-sm"
                      >
                        <UserPlus className="w-4 h-4" />
                        {bulkAssignLoading ? 'Asignando…' : 'Asignar cliente'}
                      </button>
                    </div>
                    <button
                      onClick={() => setSelectedEntityIds(new Set())}
                      className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                    >
                      Deseleccionar
                    </button>
                  </div>
                )}
              </div>
              <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-700 w-12">
                        <button
                          type="button"
                          onClick={() => {
                            const allSelected = sortedEntities.length > 0 && sortedEntities.every((e) => selectedEntityIds.has(e.id!));
                            if (allSelected) {
                              setSelectedEntityIds((prev) => {
                                const next = new Set(prev);
                                sortedEntities.forEach((e) => next.delete(e.id!));
                                return next;
                              });
                            } else {
                              setSelectedEntityIds((prev) => {
                                const next = new Set(prev);
                                sortedEntities.forEach((e) => next.add(e.id!));
                                return next;
                              });
                            }
                          }}
                          className="flex items-center gap-1 hover:text-indigo-600"
                          title={sortedEntities.every((e) => selectedEntityIds.has(e.id!)) ? 'Deseleccionar todas' : 'Seleccionar todas visibles'}
                        >
                          <input
                            type="checkbox"
                            checked={sortedEntities.length > 0 && sortedEntities.every((e) => selectedEntityIds.has(e.id!))}
                            readOnly
                            className="rounded border-gray-300"
                          />
                        </button>
                      </th>
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
                      <th className="px-6 py-3 text-left font-medium text-gray-700">Cliente</th>
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
                    {sortedEntities.map((e) => (
                      <React.Fragment key={e.id}>
                        <tr
                          onClick={() => toggleConfigEntityExpand(e)}
                          className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer select-none"
                        >
                          <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedEntityIds.has(e.id!)}
                              onChange={(ev) => {
                                ev.stopPropagation();
                                setSelectedEntityIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(e.id!)) next.delete(e.id!);
                                  else next.add(e.id!);
                                  return next;
                                });
                              }}
                              className="rounded border-gray-300"
                            />
                          </td>
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
                          <td className="px-6 py-3 text-gray-600">{e.client_id ? (clients.find((c) => c.id === e.client_id)?.name ?? '—') : '—'}</td>
                          <td className="px-6 py-3 capitalize">{e.type}</td>
                          <td className="px-6 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                            <button onClick={() => { setMergeSourceEntity(e); setMergeTargetId(''); }} className="text-amber-600 hover:text-amber-800 p-1" title="Fusionar en otra entidad"><Merge className="w-4 h-4 inline" /></button>
                            <button onClick={() => { setCurrentEntity(e); setModalMode('edit'); setShowModal(true); }} className="text-indigo-600 hover:text-indigo-800 p-1 ml-1"><Edit className="w-4 h-4 inline" /></button>
                            <button onClick={() => handleDeleteEntity(e.id)} className="text-red-600 hover:text-red-800 p-1 ml-1"><Trash2 className="w-4 h-4 inline" /></button>
                          </td>
                        </tr>
                        {configEntityExpanded === e.id && (
                          <tr className="border-t border-gray-100 bg-gray-50/80">
                            <td colSpan={5} className="px-6 py-4">
                              {configDetailLoading ? (
                                <div className="text-sm text-gray-500 py-4">Cargando…</div>
                              ) : configDetailTransactions.length === 0 ? (
                                <div className="text-sm text-gray-500 py-2">No hay transacciones.</div>
                              ) : (
                                <ConfigDetailTable transactions={configDetailTransactions} showEntity={false} showCategory onEditTransaction={(t) => {
                    const jeId = (t as AcctTransaction & { journal_entry_id?: string }).journal_entry_id;
                    if (jeId) handleEditJournalEntry(jeId);
                    else { setCurrentTransaction(t); setModalMode('edit'); setModalForTransaction(true); setShowModal(true); }
                  }} />
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
                {filteredEntities.length === 0 && (
                  <div className="p-8 text-center text-gray-500">
                    {configSearch ? 'No hay entidades que coincidan con la búsqueda.' : 'No hay entidades.'}
                  </div>
                )}
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
                    {[...filteredCategories]
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
                                <ConfigDetailTable transactions={configDetailTransactions} showEntity showCategory={false} onEditTransaction={(t) => {
                    const jeId = (t as AcctTransaction & { journal_entry_id?: string }).journal_entry_id;
                    if (jeId) handleEditJournalEntry(jeId);
                    else { setCurrentTransaction(t); setModalMode('edit'); setModalForTransaction(true); setShowModal(true); }
                  }} />
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
                {filteredCategories.length === 0 && (
                  <div className="p-8 text-center text-gray-500">
                    {configSearch ? 'No hay categorías que coincidan con la búsqueda.' : 'No hay categorías.'}
                  </div>
                )}
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
                    {filteredAccounts.map((a) => (
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
                {filteredAccounts.length === 0 && (
                  <div className="p-8 text-center text-gray-500">
                    {configSearch ? 'No hay cuentas que coincidan con la búsqueda.' : 'No hay cuentas de pago.'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'asientos' && (
        <div>
          <div className="flex flex-wrap gap-4 mb-6 items-center">
            <div className="flex gap-2">
              <button
                onClick={() => setAsientosTab('chart')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${asientosTab === 'chart' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Plan de cuentas
              </button>
              <button
                onClick={() => setAsientosTab('entries')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${asientosTab === 'entries' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Asientos
              </button>
              <button
                onClick={() => setAsientosTab('trial')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${asientosTab === 'trial' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Balance de comprobación
              </button>
            </div>
            {(asientosTab === 'entries' || asientosTab === 'trial') && (
              <DateRangePicker
                start={asientosStart}
                end={asientosEnd}
                onStartChange={setAsientosStart}
                onEndChange={setAsientosEnd}
                onPreset={(id) => {
                  const setStart = setAsientosStart;
                  const setEnd = setAsientosEnd;
                  const now = new Date();
                  const year = now.getFullYear();
                  switch (id) {
                    case 'all': setStart(''); setEnd(''); break;
                    case 'this-year': setStart(`${year}-01-01`); setEnd(now.toISOString().split('T')[0]); break;
                    case 'last-year': setStart(`${year - 1}-01-01`); setEnd(`${year - 1}-12-31`); break;
                    case 'this-month':
                      setStart(new Date(year, now.getMonth(), 1).toISOString().split('T')[0]);
                      setEnd(now.toISOString().split('T')[0]);
                      break;
                    case 'last-month': {
                      const lm = now.getMonth() - 1;
                      const lmy = lm < 0 ? year - 1 : year;
                      const lmn = lm < 0 ? 11 : lm;
                      setStart(new Date(lmy, lmn, 1).toISOString().split('T')[0]);
                      setEnd(new Date(lmy, lmn + 1, 0).toISOString().split('T')[0]);
                      break;
                    }
                    default: break;
                  }
                }}
              />
            )}
          </div>

          {asientosTab === 'chart' && (
            <div>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => { setCurrentChartAccount({ code: '', name: '', type: 'expense' }); setShowChartAccountModal(true); }}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Nueva cuenta
                </button>
                {chartAccounts.length === 0 && (
                  <button
                    onClick={async () => {
                      try {
                        const res = await contabilidadApi.seedChartAccounts();
                        toast.success(`PUC básico cargado: ${res.created} cuentas`);
                        fetchChartAccounts();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Error');
                      }
                    }}
                    className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
                  >
                    Cargar PUC básico
                  </button>
                )}
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {chartAccounts.length > 0 ? (
                  <ChartAccountsTree
                    accounts={chartAccounts}
                    onEdit={(a) => { setCurrentChartAccount(a); setShowChartAccountModal(true); }}
                    onDelete={async (a) => {
                      if (window.confirm('¿Eliminar esta cuenta?')) {
                        try {
                          await contabilidadApi.deleteChartAccount(a.id, currentUser?.id);
                          toast.success('Cuenta eliminada');
                          fetchChartAccounts();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Error');
                        }
                      }
                    }}
                  />
                ) : (
                  <div className="p-12 text-center text-gray-500">
                    No hay cuentas en el plan. Crea cuentas para usar partida doble (activo, pasivo, patrimonio, ingresos, gastos).
                  </div>
                )}
              </div>
            </div>
          )}

          {asientosTab === 'entries' && (
            <div>
              <button
                onClick={() => {
                  setCurrentJournalEntry({
                    date: new Date().toISOString().split('T')[0],
                    description: '',
                    reference: '',
                    lines: [
                      { account_id: '', entity_id: null, debit: 0, credit: 0, description: '' },
                      { account_id: '', entity_id: null, debit: 0, credit: 0, description: '' },
                    ],
                  });
                  setShowJournalEntryModal(true);
                }}
                className="mb-4 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Nuevo asiento
              </button>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-gray-700">Fecha</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-700">Descripción</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journalEntries.map((e) => (
                      <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-6 py-3">{format(new Date(e.date), 'd MMM yyyy', { locale: es })}</td>
                        <td className="px-6 py-3">{e.description || '—'}</td>
                        <td className="px-6 py-3 text-right">
                          <button onClick={async () => { try { await contabilidadApi.deleteJournalEntry(e.id, currentUser?.id); toast.success('Asiento eliminado'); fetchJournalEntries(); fetchTrialBalance(); } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); } }} className="text-red-600 hover:text-red-800 p-1"><Trash2 className="w-4 h-4 inline" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {journalEntries.length === 0 && (
                  <div className="p-8 text-center text-gray-500">No hay asientos en el período. Crea asientos con partida doble (débitos = créditos).</div>
                )}
              </div>
            </div>
          )}

          {asientosTab === 'trial' && trialBalanceData && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Código</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Cuenta</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-700">Débitos</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-700">Créditos</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-700">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {trialBalanceData.rows.map((r) => (
                    <tr key={r.account_id} className="border-t border-gray-100">
                      <td className="px-6 py-3 font-mono">{r.account_code}</td>
                      <td className="px-6 py-3">{r.account_name}</td>
                      <td className="px-6 py-3 text-right">{r.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-3 text-right">{r.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className={`px-6 py-3 text-right font-medium ${r.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {r.balance >= 0 ? '+' : ''}{r.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 font-semibold">
                  <tr>
                    <td colSpan={2} className="px-6 py-3">Total</td>
                    <td className="px-6 py-3 text-right">{trialBalanceData.total_debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-3 text-right">{trialBalanceData.total_credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className={`px-6 py-3 text-right ${Math.abs(trialBalanceData.total_debit - trialBalanceData.total_credit) < 0.01 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {Math.abs(trialBalanceData.total_debit - trialBalanceData.total_credit) < 0.01 ? 'Cuadra' : 'No cuadra'}
                    </td>
                  </tr>
                </tfoot>
              </table>
              {trialBalanceData.rows.length === 0 && (
                <div className="p-8 text-center text-gray-500">No hay movimientos en el período.</div>
              )}
            </div>
          )}

          {asientosTab === 'trial' && !trialBalanceData && (
            <div className="p-8 text-center text-gray-500">Cargando balance de comprobación…</div>
          )}
        </div>
      )}

      {pygDetailModalEntity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPygDetailModalEntity(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-[95vw] w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b shrink-0">
              <h3 className="font-semibold text-lg">P&G — {pygDetailModalEntity.entity_name}</h3>
              <button onClick={() => setPygDetailModalEntity(null)} className="p-2 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 overflow-x-auto overflow-y-auto flex-1 min-h-0">
              {pygDetailLoading ? (
                <div className="text-sm text-gray-500 py-8">Cargando detalle…</div>
              ) : pygDetailTransactions.length === 0 ? (
                <div className="text-sm text-gray-500 py-4">No hay transacciones en este período.</div>
              ) : (
                <PygDetailPanel
                  transactions={pygDetailTransactions}
                  onEditTransaction={(t) => {
                    const jeId = (t as AcctTransaction & { journal_entry_id?: string }).journal_entry_id;
                    if (jeId) handleEditJournalEntry(jeId);
                    else { setCurrentTransaction(t); setModalMode('edit'); setModalForTransaction(true); setShowModal(true); }
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {pygDetailModalClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPygDetailModalClient(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-[95vw] w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b shrink-0">
              <h3 className="font-semibold text-lg">P&G — {pygDetailModalClient.client_name}</h3>
              <button onClick={() => setPygDetailModalClient(null)} className="p-2 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 overflow-x-auto overflow-y-auto flex-1 min-h-0">
              {pygDetailLoading ? (
                <div className="text-sm text-gray-500 py-8">Cargando detalle…</div>
              ) : pygDetailTransactions.length === 0 ? (
                <div className="text-sm text-gray-500 py-4">No hay transacciones en este período.</div>
              ) : (
                <PygDetailPanel
                  transactions={pygDetailTransactions}
                  onEditTransaction={(t) => {
                    const jeId = (t as AcctTransaction & { journal_entry_id?: string }).journal_entry_id;
                    if (jeId) handleEditJournalEntry(jeId);
                    else { setCurrentTransaction(t); setModalMode('edit'); setModalForTransaction(true); setShowModal(true); }
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {pygCellModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPygCellModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-[95vw] w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b shrink-0">
              <h3 className="font-semibold text-lg">
                {pygCellModal.rowLabel} — {pygCellModal.colName}
              </h3>
              <button onClick={() => setPygCellModal(null)} className="p-2 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 overflow-x-auto overflow-y-auto flex-1 min-h-0">
              {pygCellLoading ? (
                <div className="text-sm text-gray-500 py-8">Cargando registros…</div>
              ) : pygCellLines.length === 0 ? (
                <div className="text-sm text-gray-500 py-4">No hay registros en esta celda.</div>
              ) : (
                <PygDetailPanel
                  transactions={ledgerLinesToTransactionLike(pygCellLines)}
                  onEditTransaction={(t) => {
                    const jeId = (t as AcctTransaction & { journal_entry_id?: string }).journal_entry_id;
                    if (jeId) handleEditJournalEntry(jeId);
                    else { setCurrentTransaction(t); setModalMode('edit'); setModalForTransaction(true); setShowModal(true); }
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {detalleLiquidacionEntity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetalleLiquidacionEntity(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-semibold text-lg">
                Registros de <strong>{detalleLiquidacionEntity.entity_name}</strong>
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({balanceStart} — {balanceEnd})
                </span>
              </h3>
              <button type="button" onClick={() => setDetalleLiquidacionEntity(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {detalleLiquidacionLoading ? (
                <div className="py-12 text-center text-gray-500">Cargando registros…</div>
              ) : detalleLiquidacionLines.length === 0 ? (
                <div className="py-12 text-center text-gray-500">No hay registros en el período.</div>
              ) : (
                <LedgerLineTable lines={detalleLiquidacionLines} />
              )}
            </div>
          </div>
        </div>
      )}

      {liquidarEntity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setLiquidarEntity(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">Liquidar proyecto</h3>
            <p className="text-gray-600 mb-4">
              Trasladar la utilidad de <strong>{liquidarEntity.entity_name}</strong> a FONDO LIBRE:
            </p>
            <div className="space-y-2 mb-6">
              {liquidarEntity.usd !== 0 && (
                <p className="text-lg font-medium text-emerald-600">
                  {liquidarEntity.usd >= 0 ? '+' : ''}{liquidarEntity.usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                </p>
              )}
              {liquidarEntity.cop !== 0 && (
                <p className="text-lg font-medium text-emerald-600">
                  {liquidarEntity.cop >= 0 ? '+' : ''}{liquidarEntity.cop.toLocaleString('es-CO', { minimumFractionDigits: 0 })} COP
                </p>
              )}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setLiquidarEntity(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={liquidarLoading}
                onClick={async () => {
                  if (!liquidarEntity.entity_id) return;
                  setLiquidarLoading(true);
                  try {
                    await contabilidadApi.liquidar({
                      entity_id: liquidarEntity.entity_id,
                      amount_usd: liquidarEntity.usd > 0 ? liquidarEntity.usd : undefined,
                      amount_cop: liquidarEntity.cop > 0 ? liquidarEntity.cop : undefined,
                      date: new Date().toISOString().split('T')[0],
                    }, currentUser?.id);
                    toast.success('Proyecto liquidado correctamente');
                    setLiquidarEntity(null);
                    fetchBalance();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Error al liquidar');
                  } finally {
                    setLiquidarLoading(false);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {liquidarLoading ? 'Liquidando…' : 'Confirmar liquidación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {reponerEntity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setReponerEntity(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">Reponer AGENCIA X</h3>
            <p className="text-gray-600 mb-4">
              Trasladar desde <strong>FONDO LIBRE</strong> para cubrir el saldo negativo de AGENCIA X:
            </p>
            <div className="space-y-2 mb-6">
              {reponerEntity.usd < -0.01 && (
                <p className="text-lg font-medium text-red-600">
                  {Math.abs(reponerEntity.usd).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                </p>
              )}
              {reponerEntity.cop < -0.01 && (
                <p className="text-lg font-medium text-red-600">
                  {Math.abs(reponerEntity.cop).toLocaleString('es-CO', { minimumFractionDigits: 0 })} COP
                </p>
              )}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setReponerEntity(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={reponerLoading}
                onClick={async () => {
                  setReponerLoading(true);
                  try {
                    await contabilidadApi.reponer({
                      amount_usd: reponerEntity.usd < -0.01 ? Math.abs(reponerEntity.usd) : undefined,
                      amount_cop: reponerEntity.cop < -0.01 ? Math.abs(reponerEntity.cop) : undefined,
                      date: new Date().toISOString().split('T')[0],
                    }, currentUser?.id);
                    toast.success('AGENCIA X repuesta correctamente');
                    setReponerEntity(null);
                    fetchBalance();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Error al reponer');
                  } finally {
                    setReponerLoading(false);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {reponerLoading ? 'Reponiendo…' : 'Confirmar reposición'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRepartirModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRepartirModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">Repartir a socios</h3>
            <p className="text-gray-600 mb-4 text-sm">
              Registra los pagos desde FONDO LIBRE a cada socio. Lo que queda en FONDO LIBRE después de liquidar y reponer AGENCIA X se reparte aquí.
            </p>
            <div className="space-y-3 mb-6">
              {repartirItems.map((it, i) => (
                <div key={i} className="flex gap-2 items-center flex-wrap">
                  <input
                    type="text"
                    value={it.socio}
                    onChange={(e) => setRepartirItems((prev) => prev.map((p, j) => j === i ? { ...p, socio: e.target.value } : p))}
                    placeholder="Nombre socio"
                    className="flex-1 min-w-[120px] px-3 py-2 border rounded-lg text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={it.amount_usd || ''}
                    onChange={(e) => setRepartirItems((prev) => prev.map((p, j) => j === i ? { ...p, amount_usd: parseFloat(e.target.value) || 0 } : p))}
                    placeholder="USD"
                    className="w-24 px-2 py-2 border rounded-lg text-sm"
                  />
                  <input
                    type="number"
                    step="1"
                    value={it.amount_cop || ''}
                    onChange={(e) => setRepartirItems((prev) => prev.map((p, j) => j === i ? { ...p, amount_cop: parseFloat(e.target.value) || 0 } : p))}
                    placeholder="COP"
                    className="w-24 px-2 py-2 border rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setRepartirItems((prev) => prev.filter((_, j) => j !== i))}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setRepartirItems((prev) => [...prev, { socio: '', amount_usd: 0, amount_cop: 0 }])}
                className="text-sm text-indigo-600 hover:underline"
              >
                + Agregar socio
              </button>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowRepartirModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={repartirLoading || repartirItems.every((it) => !it.socio.trim() && (it.amount_usd || 0) <= 0 && (it.amount_cop || 0) <= 0)}
                onClick={async () => {
                  const valid = repartirItems.filter((it) => it.socio.trim() && ((it.amount_usd || 0) > 0 || (it.amount_cop || 0) > 0));
                  if (valid.length === 0) return;
                  setRepartirLoading(true);
                  try {
                    await contabilidadApi.repartir({
                      date: new Date().toISOString().split('T')[0],
                      items: valid.map((it) => ({ socio: it.socio.trim(), amount_usd: it.amount_usd || undefined, amount_cop: it.amount_cop || undefined })),
                    }, currentUser?.id);
                    toast.success('Repartición registrada');
                    setShowRepartirModal(false);
                    fetchBalance();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Error al repartir');
                  } finally {
                    setRepartirLoading(false);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {repartirLoading ? 'Guardando…' : 'Confirmar repartición'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showChartAccountModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-semibold text-lg">{currentChartAccount.id ? 'Editar cuenta' : 'Nueva cuenta'}</h3>
              <button onClick={() => setShowChartAccountModal(false)} className="p-2 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const code = (currentChartAccount.code ?? '').trim();
                const name = (currentChartAccount.name ?? '').trim();
                const type = currentChartAccount.type ?? 'expense';
                if (!code || !name) { toast.error('Código y nombre son requeridos'); return; }
                try {
                  if (currentChartAccount.id) {
                    await contabilidadApi.updateChartAccount(currentChartAccount.id, { code, name, type }, currentUser?.id);
                    toast.success('Cuenta actualizada');
                  } else {
                    await contabilidadApi.createChartAccount({ code, name, type }, currentUser?.id);
                    toast.success('Cuenta creada');
                  }
                  setShowChartAccountModal(false);
                  fetchChartAccounts();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Error');
                }
              }}
              className="p-4 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                <input type="text" value={currentChartAccount.code ?? ''} onChange={(e) => setCurrentChartAccount((p) => ({ ...p, code: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" placeholder="1105" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input type="text" value={currentChartAccount.name ?? ''} onChange={(e) => setCurrentChartAccount((p) => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" placeholder="Caja" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={currentChartAccount.type ?? 'expense'} onChange={(e) => setCurrentChartAccount((p) => ({ ...p, type: e.target.value as AcctChartAccount['type'] }))} className="w-full px-3 py-2 border rounded-lg">
                  <option value="asset">Activo</option>
                  <option value="liability">Pasivo</option>
                  <option value="equity">Patrimonio</option>
                  <option value="income">Ingreso</option>
                  <option value="expense">Gasto</option>
                </select>
              </div>
              <div className="flex gap-2 pt-4">
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700">Guardar</button>
                <button type="button" onClick={() => setShowChartAccountModal(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showJournalEntryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-semibold text-lg">{editingJournalEntryId ? 'Editar asiento' : 'Nuevo asiento'}</h3>
              <button onClick={() => setShowJournalEntryModal(false)} className="p-2 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const totalDebit = currentJournalEntry.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
                const totalCredit = currentJournalEntry.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
                if (Math.abs(totalDebit - totalCredit) > 0.01) {
                  toast.error(`La partida no cuadra: débitos ${totalDebit.toFixed(2)} ≠ créditos ${totalCredit.toFixed(2)}`);
                  return;
                }
                const validLines = currentJournalEntry.lines.filter((l) => l.account_id && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0));
                if (validLines.length < 2) {
                  toast.error('Mínimo 2 líneas con cuenta y monto');
                  return;
                }
                try {
                  const payload = {
                    date: currentJournalEntry.date,
                    description: currentJournalEntry.description,
                    reference: currentJournalEntry.reference,
                    lines: validLines.map((l) => ({
                      account_id: l.account_id,
                      entity_id: l.entity_id || null,
                      debit: Number(l.debit) || 0,
                      credit: Number(l.credit) || 0,
                      description: l.description || '',
                    })),
                  };
                  if (editingJournalEntryId) {
                    await contabilidadApi.updateJournalEntry(editingJournalEntryId, payload, currentUser?.id);
                    toast.success('Asiento actualizado');
                  } else {
                    await contabilidadApi.createJournalEntry(payload, currentUser?.id);
                    toast.success('Asiento creado');
                  }
                  setShowJournalEntryModal(false);
                  setEditingJournalEntryId(null);
                  fetchLedgerLines();
                  fetchJournalEntries();
                  fetchTrialBalance();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Error');
                }
              }}
              className="p-4 space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                  <input type="date" value={currentJournalEntry.date} onChange={(e) => setCurrentJournalEntry((p) => ({ ...p, date: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Referencia</label>
                  <input type="text" value={currentJournalEntry.reference} onChange={(e) => setCurrentJournalEntry((p) => ({ ...p, reference: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" placeholder="Opcional" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <input type="text" value={currentJournalEntry.description} onChange={(e) => setCurrentJournalEntry((p) => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" placeholder="Descripción del asiento" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Líneas (débitos = créditos)</label>
                  <button type="button" onClick={() => setCurrentJournalEntry((p) => ({ ...p, lines: [...p.lines, { account_id: '', entity_id: null, debit: 0, credit: 0, description: '' }] }))} className="text-indigo-600 text-sm hover:underline">+ Agregar línea</button>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left">Cuenta</th>
                        <th className="px-2 py-1 text-left">Centro costo</th>
                        <th className="px-2 py-1 text-right w-24">Débito</th>
                        <th className="px-2 py-1 text-right w-24">Crédito</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentJournalEntry.lines.map((line, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1">
                            <select value={line.account_id} onChange={(e) => setCurrentJournalEntry((p) => ({ ...p, lines: p.lines.map((l, j) => j === i ? { ...l, account_id: e.target.value } : l) }))} className="w-full px-2 py-1 border rounded text-sm" required>
                              <option value="">Seleccionar</option>
                              {chartAccounts.map((a) => (
                                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <select value={line.entity_id ?? ''} onChange={(e) => setCurrentJournalEntry((p) => ({ ...p, lines: p.lines.map((l, j) => j === i ? { ...l, entity_id: e.target.value || null } : l) }))} className="w-full px-2 py-1 border rounded text-sm">
                              <option value="">—</option>
                              {entities.map((e) => (
                                <option key={e.id} value={e.id}>{e.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <input type="number" step="0.01" min="0" value={line.debit || ''} onChange={(e) => setCurrentJournalEntry((p) => ({ ...p, lines: p.lines.map((l, j) => j === i ? { ...l, debit: parseFloat(e.target.value) || 0 } : l) }))} className="w-full px-2 py-1 border rounded text-sm text-right" placeholder="0" />
                          </td>
                          <td className="px-2 py-1">
                            <input type="number" step="0.01" min="0" value={line.credit || ''} onChange={(e) => setCurrentJournalEntry((p) => ({ ...p, lines: p.lines.map((l, j) => j === i ? { ...l, credit: parseFloat(e.target.value) || 0 } : l) }))} className="w-full px-2 py-1 border rounded text-sm text-right" placeholder="0" />
                          </td>
                          <td className="px-1">
                            {currentJournalEntry.lines.length > 2 && (
                              <button type="button" onClick={() => setCurrentJournalEntry((p) => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }))} className="text-red-500 hover:text-red-700"><X className="w-4 h-4" /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Total débitos: {currentJournalEntry.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0).toFixed(2)} — Total créditos: {currentJournalEntry.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0).toFixed(2)}
                  {Math.abs(currentJournalEntry.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0) - currentJournalEntry.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)) < 0.01 ? ' ✓' : ' (debe cuadrar)'}
                </p>
              </div>
              <div className="flex gap-2 pt-4">
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700">Crear asiento</button>
                <button type="button" onClick={() => setShowJournalEntryModal(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-semibold text-lg">
                {(activeTab === 'libro' || modalForTransaction) && (modalMode === 'create' ? 'Nueva transacción' : 'Editar transacción')}
                {activeTab === 'config' && !modalForTransaction && configTab === 'clients' && (modalMode === 'create' ? 'Nuevo cliente' : 'Editar cliente')}
                {activeTab === 'config' && !modalForTransaction && configTab === 'entities' && (modalMode === 'create' ? 'Nueva entidad' : 'Editar entidad')}
                {activeTab === 'config' && !modalForTransaction && configTab === 'categories' && (modalMode === 'create' ? 'Nueva categoría' : 'Editar categoría')}
                {activeTab === 'config' && !modalForTransaction && configTab === 'accounts' && (modalMode === 'create' ? 'Nueva cuenta' : 'Editar cuenta')}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={
              (activeTab === 'libro' || modalForTransaction) ? handleSaveTransaction :
              configTab === 'clients' ? handleSaveClient :
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
                      {!showCreateCategoryInTransaction ? (
                        <button
                          type="button"
                          onClick={() => setShowCreateCategoryInTransaction(true)}
                          className="w-full px-3 py-2 text-left text-sm text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 border-t"
                        >
                          <Plus className="w-4 h-4" />
                          Crear categoría
                        </button>
                      ) : (
                        <div className="p-3 border-t bg-gray-50/80 space-y-2">
                          <input
                            type="text"
                            placeholder="Nombre de la categoría"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreateCategoryFromTransaction())}
                            className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleCreateCategoryFromTransaction}
                              disabled={!newCategoryName.trim()}
                              className="flex-1 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Crear
                            </button>
                            <button
                              type="button"
                              onClick={() => { setShowCreateCategoryInTransaction(false); setNewCategoryName(''); }}
                              className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
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

              {activeTab === 'config' && !modalForTransaction && configTab === 'clients' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                    <input type="text" value={currentClient.name ?? ''} onChange={(e) => setCurrentClient((p) => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" required />
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                    <select value={currentEntity.client_id ?? ''} onChange={(e) => setCurrentEntity((p) => ({ ...p, client_id: e.target.value || null }))} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">Sin asignar</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200">
            <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50/50">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-100">
                  <Upload className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-gray-900">Importar CSV</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${importStep === 'upload' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'}`}>1. Subir</span>
                    <span className="text-gray-300">→</span>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${importStep === 'preview' ? 'bg-indigo-100 text-indigo-700' : importStep === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>2. Revisar</span>
                    <span className="text-gray-300">→</span>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${importStep === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>3. Listo</span>
                  </div>
                </div>
              </div>
              <button onClick={closeImportModal} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {importStep === 'upload' && (
                <>
                  <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <h4 className="font-medium text-slate-800 mb-2 flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      ¿Qué vas a importar?
                    </h4>
                    <p className="text-sm text-slate-600 mb-2">
                      El CSV debe tener columnas <strong>FECHA</strong>, <strong>PROYECTO</strong> y columnas de cuentas (Bancolombia, Payo Santiago, etc.).
                      Antes de importar podrás ver exactamente qué se creará: ingresos, gastos, traslados entre bancos, pagos a socios, etc.
                    </p>
                    <p className="text-xs text-slate-500">
                      Montos &gt; 100.000 se importan en COP; el resto en USD.
                    </p>
                  </div>
                  <label className="flex flex-col items-center justify-center w-full h-28 mb-4 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors">
                    <Upload className="w-8 h-8 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-600">Haz clic para seleccionar un archivo CSV</span>
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
                      className="hidden"
                    />
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-gray-400 font-medium">O pega el contenido aquí</span>
                    <textarea
                      value={importCsvText}
                      onChange={(e) => setImportCsvText(e.target.value)}
                      placeholder=""
                      className="w-full h-36 pl-3 pr-3 pt-7 pb-3 border border-gray-200 rounded-xl font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      disabled={importPreviewLoading}
                    />
                  </div>
                </>
              )}

              {importStep === 'preview' && importPreviewData && (
                <>
                  <div className="mb-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <h4 className="font-medium text-amber-900 mb-2 flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      Vista previa de lo que se importará
                    </h4>
                    <p className="text-sm text-amber-800 mb-2">
                      Revisa que todo se vea correcto. Cada fila muestra cómo se clasificará el movimiento (ingreso, gasto, traslado, etc.).
                    </p>
                    <div className="flex flex-wrap gap-2 text-sm">
                      <span className="font-medium">Total: {importPreviewData.summary.total} movimientos</span>
                      {importPreviewData.summary.ingreso ? <span className="text-emerald-600">• {importPreviewData.summary.ingreso} ingresos</span> : null}
                      {importPreviewData.summary.gasto ? <span className="text-rose-600">• {importPreviewData.summary.gasto} gastos</span> : null}
                      {importPreviewData.summary.traslado_bancos ? <span className="text-blue-600">• {importPreviewData.summary.traslado_bancos} traslados entre bancos</span> : null}
                      {importPreviewData.summary.traslado_utilidades ? <span className="text-violet-600">• {importPreviewData.summary.traslado_utilidades} traslados de utilidades</span> : null}
                      {importPreviewData.summary.reparto ? <span className="text-amber-600">• {importPreviewData.summary.reparto} pagos a socios</span> : null}
                      {importPreviewData.skipped > 0 && <span className="text-gray-500">• {importPreviewData.skipped} filas omitidas (fecha inválida)</span>}
                    </div>
                  </div>
                  <div className="mb-3 flex gap-2">
                    <label className="text-sm text-gray-600 self-center">Filtrar:</label>
                    <select
                      value={importPreviewFilter}
                      onChange={(e) => setImportPreviewFilter(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="all">Todos</option>
                      <option value="ingreso">Ingresos</option>
                      <option value="gasto">Gastos</option>
                      <option value="traslado_bancos">Traslados entre bancos</option>
                      <option value="traslado_utilidades">Traslados de utilidades</option>
                      <option value="reparto">Pagos a socios</option>
                    </select>
                  </div>
                  <div className="mb-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                    <h4 className="font-medium text-indigo-900 mb-2 flex items-center gap-2">
                      <Tag className="w-4 h-4" />
                      Mapeo de categorías
                    </h4>
                    <p className="text-sm text-indigo-800 mb-3">
                      Unifica categorías que se llaman distinto pero son lo mismo. Ej: «Honorarios profesionales» → «Honorarios».
                    </p>
                    {importPreviewData.uniqueCategories && importPreviewData.uniqueCategories.length > 0 ? (
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {importPreviewData.uniqueCategories.map((cat) => (
                          <div key={cat} className="flex items-center gap-2">
                            <span className="text-sm text-gray-700 min-w-[140px] truncate" title={cat}>{cat}</span>
                            <span className="text-gray-400">→</span>
                            <select
                              value={importCategoryMapping[cat] ?? cat}
                              onChange={(e) => {
                                const to = e.target.value;
                                setImportCategoryMapping((prev) => {
                                  const next = { ...prev };
                                  if (to === cat) delete next[cat];
                                  else next[cat] = to;
                                  return next;
                                });
                              }}
                              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            >
                              <option value={cat}>Usar tal cual</option>
                              {[...new Set([
                                ...(importPreviewData.uniqueCategories || []).filter((c) => c !== cat),
                                ...categories.map((c) => c.name).filter(Boolean),
                              ])].sort().map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-indigo-600">No hay categorías para mapear en este import.</p>
                    )}
                  </div>
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto shadow-inner">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Fila</th>
                          <th className="text-left px-3 py-2 font-medium">Fecha</th>
                          <th className="text-left px-3 py-2 font-medium">Cuenta</th>
                          <th className="text-left px-3 py-2 font-medium">Tipo</th>
                          <th className="text-left px-3 py-2 font-medium">Proyecto</th>
                          <th className="text-left px-3 py-2 font-medium">Descripción</th>
                          <th className="text-right px-3 py-2 font-medium">Monto</th>
                          <th className="text-left px-3 py-2 font-medium">Explicación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreviewData.preview
                          .filter((p) => importPreviewFilter === 'all' || p.tipo === importPreviewFilter)
                          .slice(0, 100)
                          .map((p, idx) => (
                            <ImportPreviewRow key={`preview-${idx}-${p.rowIndex}`} item={p} />
                          ))}
                      </tbody>
                    </table>
                    {importPreviewData.preview.filter((p) => importPreviewFilter === 'all' || p.tipo === importPreviewFilter).length > 100 && (
                      <div className="p-2 text-xs text-gray-500 text-center bg-slate-50">
                        Mostrando 100 de {importPreviewData.preview.filter((p) => importPreviewFilter === 'all' || p.tipo === importPreviewFilter).length} movimientos
                      </div>
                    )}
                  </div>
                </>
              )}

              {importStep === 'done' && importResult && (
                <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                  <h4 className="font-medium text-emerald-900 mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    Importación completada
                  </h4>
                  <p className="text-sm text-emerald-800">
                    {importResult.created} asientos creados. {importResult.entities} entidades, {importResult.accounts} cuentas, {importResult.categories} categorías.
                    {importResult.skipped > 0 && ` ${importResult.skipped} filas omitidas.`}
                  </p>
                </div>
              )}
            </div>
            <div className="p-4 border-t flex justify-between items-center gap-2">
              <div>
                {importStep === 'preview' && (
                  <button onClick={() => setImportStep('upload')} className="text-sm text-gray-600 hover:text-gray-800">
                    ← Volver a editar CSV
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {importStep === 'upload' && (
                  <>
                    <button onClick={closeImportModal} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cerrar</button>
                    <button onClick={handleImportPreview} disabled={importPreviewLoading || !importCsvText.trim()} className="bg-slate-600 text-white px-4 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                      {importPreviewLoading ? 'Analizando...' : 'Ver qué se importará'}
                    </button>
                  </>
                )}
                {importStep === 'preview' && (
                  <>
                    <button onClick={() => setImportStep('upload')} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Atrás</button>
                    <button onClick={handleImportCsv} disabled={importing} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                      {importing ? 'Importando...' : 'Confirmar e importar'}
                    </button>
                  </>
                )}
                {importStep === 'done' && (
                  <button onClick={closeImportModal} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                    Cerrar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showImportHistoryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-gray-200">
            <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-100">
                  <History className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-gray-900">Historial de importaciones</h3>
                  <p className="text-sm text-gray-500">Revertir importaciones con datos incorrectos</p>
                </div>
              </div>
              <button onClick={() => setShowImportHistoryModal(false)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {importBatches.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p>No hay importaciones registradas.</p>
                  <p className="text-sm mt-1">Las importaciones posteriores a esta funcionalidad quedarán registradas aquí.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {importBatches.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 hover:bg-gray-50/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm text-gray-600">{b.batch_ref}</p>
                        <p className="text-sm text-gray-800 mt-0.5">
                          {b.created_count} asientos creados
                          {b.skipped_count > 0 && ` · ${b.skipped_count} omitidos`}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {(b.created_at ?? b.createdAt) ? format(new Date(b.created_at ?? b.createdAt!), "d MMM yyyy, HH:mm", { locale: es }) : '—'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRollback(b.id)}
                        disabled={rollbackLoading !== null}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                        title="Revertir esta importación"
                      >
                        {rollbackLoading === b.id ? (
                          <span className="animate-pulse">Revertiendo...</span>
                        ) : (
                          <>
                            <RotateCcw className="w-4 h-4" />
                            Revertir
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
