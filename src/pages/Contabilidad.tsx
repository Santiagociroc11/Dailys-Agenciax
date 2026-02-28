import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type MainTab = 'libro' | 'balance' | 'config';
type ConfigTab = 'entities' | 'categories' | 'accounts';

export default function Contabilidad() {
  const { isAdmin, user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<MainTab>('libro');
  const [configTab, setConfigTab] = useState<ConfigTab>('entities');

  const [entities, setEntities] = useState<AcctEntity[]>([]);
  const [categories, setCategories] = useState<AcctCategory[]>([]);
  const [accounts, setAccounts] = useState<AcctPaymentAccount[]>([]);
  const [transactions, setTransactions] = useState<AcctTransaction[]>([]);
  const [balanceData, setBalanceData] = useState<{ rows: BalanceRow[]; grand_total: number } | null>(null);
  const [pygData, setPygData] = useState<{ rows: PygRow[]; total_ingresos: number; total_gastos: number; total_resultado: number } | null>(null);
  const [accountBalancesData, setAccountBalancesData] = useState<{ rows: AccountBalanceRow[]; grand_total: number } | null>(null);
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
  const [importCurrency, setImportCurrency] = useState('USD');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; entities: number; categories: number; accounts: number } | null>(null);
  const [mergeSourceEntity, setMergeSourceEntity] = useState<AcctEntity | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeSourceCategory, setMergeSourceCategory] = useState<AcctCategory | null>(null);
  const [mergeCategoryTargetId, setMergeCategoryTargetId] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    fetchEntities();
    fetchCategories();
    fetchAccounts();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab === 'libro') fetchTransactions();
    if (activeTab === 'balance') {
      if (balanceView === 'balance') fetchBalance();
      else if (balanceView === 'pyg') fetchPyg();
      else fetchAccountBalances();
    }
  }, [isAdmin, activeTab, balanceView, filterStart, filterEnd, filterEntity, filterCategory, filterAccount, balanceStart, balanceEnd]);

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
      const params: { start?: string; end?: string } = {};
      if (balanceStart) params.start = balanceStart;
      if (balanceEnd) params.end = balanceEnd;
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

  async function fetchAccountBalances() {
    setLoading(true);
    try {
      const params: { start?: string; end?: string } = {};
      if (balanceStart) params.start = balanceStart;
      if (balanceEnd) params.end = balanceEnd;
      const data = await contabilidadApi.getAccountBalances(params);
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
        await contabilidadApi.updateEntity(
          currentEntity.id!,
          { name: currentEntity.name, type: currentEntity.type, sort_order: currentEntity.sort_order },
          currentUser?.id
        );
        toast.success('Entidad actualizada');
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
        await contabilidadApi.updateCategory(
          currentCategory.id!,
          { name: currentCategory.name, type: currentCategory.type, parent_id: currentCategory.parent_id ?? null },
          currentUser?.id
        );
        toast.success('Categoría actualizada');
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

  async function handleImportCsv() {
    if (!importCsvText.trim()) {
      toast.error('Pega el contenido del CSV');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const result = await contabilidadApi.importCsv(importCsvText, { default_currency: importCurrency }, currentUser?.id);
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
            <div>
              <label className="block text-sm text-gray-600 mb-1">Desde</label>
              <input
                type="date"
                value={filterStart}
                onChange={(e) => setFilterStart(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Hasta</label>
              <input
                type="date"
                value={filterEnd}
                onChange={(e) => setFilterEnd(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm"
              />
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
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Fecha</th>
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
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50">
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
              {transactions.length === 0 && (
                <div className="p-12 text-center text-gray-500">No hay transacciones en el período seleccionado.</div>
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
            <div>
              <label className="block text-sm text-gray-600 mb-1">Desde</label>
              <input type="date" value={balanceStart} onChange={(e) => setBalanceStart(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Hasta</label>
              <input type="date" value={balanceEnd} onChange={(e) => setBalanceEnd(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
            </div>
            <button onClick={() => { setBalanceStart(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]); setBalanceEnd(new Date().toISOString().split('T')[0]); }} className="text-indigo-600 text-sm hover:underline">
              Mes actual
            </button>
          </div>

          {loading ? (
            <div className="animate-pulse h-48 bg-gray-200 rounded-lg" />
          ) : balanceView === 'accounts' && accountBalancesData ? (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Cuenta</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-700">Balance (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {accountBalancesData.rows.map((r) => (
                    <tr key={r.payment_account_id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium">{r.account_name}</td>
                      <td className={`px-6 py-3 text-right font-medium ${r.total_amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {r.total_amount >= 0 ? '+' : ''}{r.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {r.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 font-semibold">
                  <tr>
                    <td className="px-6 py-3">Total</td>
                    <td className={`px-6 py-3 text-right ${accountBalancesData.grand_total >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {accountBalancesData.grand_total >= 0 ? '+' : ''}{accountBalancesData.grand_total.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                    </td>
                  </tr>
                </tfoot>
              </table>
              {accountBalancesData.rows.length === 0 && (
                <div className="p-12 text-center text-gray-500">No hay movimientos en el período seleccionado.</div>
              )}
            </div>
          ) : balanceView === 'pyg' && pygData ? (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Proyecto / Entidad</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-700">Ingresos</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-700">Gastos</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-700">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {pygData.rows.map((r) => (
                    <tr key={r.entity_id ?? 'sin-asignar'} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium">{r.entity_name}</td>
                      <td className="px-6 py-3 text-right text-emerald-600">{r.ingresos.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-3 text-right text-red-600">{r.gastos.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className={`px-6 py-3 text-right font-medium ${r.resultado >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {r.resultado >= 0 ? '+' : ''}{r.resultado.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 font-semibold">
                  <tr>
                    <td className="px-6 py-3">Total</td>
                    <td className="px-6 py-3 text-right text-emerald-700">{pygData.total_ingresos.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-3 text-right text-red-700">{pygData.total_gastos.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className={`px-6 py-3 text-right ${pygData.total_resultado >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {pygData.total_resultado >= 0 ? '+' : ''}{pygData.total_resultado.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                    </td>
                  </tr>
                </tfoot>
              </table>
              {pygData.rows.length === 0 && (
                <div className="p-12 text-center text-gray-500">No hay movimientos en el período seleccionado.</div>
              )}
            </div>
          ) : balanceData ? (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Entidad</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-700">Suma de movimientos (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {balanceData.rows.map((r) => (
                    <tr key={r.entity_id ?? 'sin-asignar'} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium">{r.entity_name}</td>
                      <td className={`px-6 py-3 text-right font-medium ${r.total_amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {r.total_amount >= 0 ? '+' : ''}{r.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 font-semibold">
                  <tr>
                    <td className="px-6 py-3">Total general</td>
                    <td className={`px-6 py-3 text-right ${balanceData.grand_total >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {balanceData.grand_total >= 0 ? '+' : ''}{balanceData.grand_total.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-indigo-700">Utilidad distribuible</td>
                    <td className="px-6 py-3 text-right text-indigo-700 font-bold">
                      {balanceData.grand_total >= 0 ? '+' : ''}{balanceData.grand_total.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                    </td>
                  </tr>
                </tfoot>
              </table>
              {balanceData.rows.length === 0 && (
                <div className="p-12 text-center text-gray-500">No hay movimientos en el período seleccionado.</div>
              )}
            </div>
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
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-gray-700">Nombre</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-700">Tipo</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entities.map((e) => (
                      <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-6 py-3">{e.name}</td>
                        <td className="px-6 py-3 capitalize">{e.type}</td>
                        <td className="px-6 py-3 text-right">
                          <button onClick={() => { setMergeSourceEntity(e); setMergeTargetId(''); }} className="text-amber-600 hover:text-amber-800 p-1" title="Fusionar en otra entidad"><Merge className="w-4 h-4 inline" /></button>
                          <button onClick={() => { setCurrentEntity(e); setModalMode('edit'); setShowModal(true); }} className="text-indigo-600 hover:text-indigo-800 p-1 ml-1"><Edit className="w-4 h-4 inline" /></button>
                          <button onClick={() => handleDeleteEntity(e.id)} className="text-red-600 hover:text-red-800 p-1 ml-1"><Trash2 className="w-4 h-4 inline" /></button>
                        </td>
                      </tr>
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
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-gray-700">Nombre</th>
                      <th className="px-6 py-3 text-left font-medium text-gray-700">Tipo</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-6 py-3">{c.name}</td>
                        <td className="px-6 py-3 capitalize">{c.type}</td>
                        <td className="px-6 py-3 text-right">
                          <button onClick={() => { setMergeSourceCategory(c); setMergeCategoryTargetId(''); }} className="text-amber-600 hover:text-amber-800 p-1" title="Fusionar en otra categoría"><Merge className="w-4 h-4 inline" /></button>
                          <button onClick={() => { setCurrentCategory(c); setModalMode('edit'); setShowModal(true); }} className="text-indigo-600 hover:text-indigo-800 p-1 ml-1"><Edit className="w-4 h-4 inline" /></button>
                          <button onClick={() => handleDeleteCategory(c.id)} className="text-red-600 hover:text-red-800 p-1 ml-1"><Trash2 className="w-4 h-4 inline" /></button>
                        </td>
                      </tr>
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

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-semibold text-lg">
                {activeTab === 'libro' && (modalMode === 'create' ? 'Nueva transacción' : 'Editar transacción')}
                {activeTab === 'config' && configTab === 'entities' && (modalMode === 'create' ? 'Nueva entidad' : 'Editar entidad')}
                {activeTab === 'config' && configTab === 'categories' && (modalMode === 'create' ? 'Nueva categoría' : 'Editar categoría')}
                {activeTab === 'config' && configTab === 'accounts' && (modalMode === 'create' ? 'Nueva cuenta' : 'Editar cuenta')}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={
              activeTab === 'libro' ? handleSaveTransaction :
              configTab === 'entities' ? handleSaveEntity :
              configTab === 'categories' ? handleSaveCategory :
              handleSaveAccount
            } className="p-4 space-y-4">
              {error && <div className="text-red-600 text-sm">{error}</div>}

              {activeTab === 'libro' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                    <input type="date" value={currentTransaction.date ?? ''} onChange={(e) => setCurrentTransaction((p) => ({ ...p, date: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
                    <input type="number" step="0.01" value={currentTransaction.amount ?? 0} onChange={(e) => setCurrentTransaction((p) => ({ ...p, amount: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg" required />
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
                    <select value={currentTransaction.category_id ?? ''} onChange={(e) => setCurrentTransaction((p) => ({ ...p, category_id: e.target.value || null }))} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">Sin categoría</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
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

              {activeTab === 'config' && configTab === 'entities' && (
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

              {activeTab === 'config' && configTab === 'categories' && (
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

              {activeTab === 'config' && configTab === 'accounts' && (
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
                      <option value="EUR">EUR</option>
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
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Moneda por defecto</label>
                <select value={importCurrency} onChange={(e) => setImportCurrency(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                  <option value="USD">USD</option>
                  <option value="COP">COP</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
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
