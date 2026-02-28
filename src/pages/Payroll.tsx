import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logAudit } from '../lib/audit';
import { getPayrollBeneficiaries, getCostByUser, type PayrollBeneficiaryRow, type CostByUserRow } from '../lib/metrics';
import { DollarSign, Plus, Edit, Trash2, X, Calendar, CreditCard, Copy, Download, Calculator, Users, Filter, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ActivePayrollSummary {
  total: number;
  currency: string;
  count: number;
}

/** Fecha de pago por defecto: 1 del mes siguiente al fin del período */
function getDefaultPaidAt(periodEnd: string): string {
  if (!periodEnd) return new Date().toISOString().split('T')[0];
  const end = new Date(periodEnd);
  const next = new Date(end.getFullYear(), end.getMonth() + 1, 1);
  return next.toISOString().split('T')[0];
}

interface PayrollRecord {
  id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  currency: string;
  paid_at: string;
  notes: string | null;
}

const HOURS_PER_MONTH = 160;
const CURRENT_YEAR = new Date().getFullYear();

export default function Payroll() {
  const { isAdmin, user: currentUser } = useAuth();
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [activePayroll, setActivePayroll] = useState<ActivePayrollSummary[]>([]);
  const [yearFilter, setYearFilter] = useState<number>(CURRENT_YEAR);
  const [suggestedAmount, setSuggestedAmount] = useState<{ total: number; currency: string } | null>(null);
  const [loadingSuggested, setLoadingSuggested] = useState(false);
  const [current, setCurrent] = useState<PayrollRecord>({
    id: '',
    period_start: '',
    period_end: '',
    total_amount: 0,
    currency: 'COP',
    paid_at: getDefaultPaidAt(''),
    notes: null,
  });
  const [error, setError] = useState('');
  const [detailRecord, setDetailRecord] = useState<PayrollRecord | null>(null);
  const [beneficiaries, setBeneficiaries] = useState<PayrollBeneficiaryRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [utilizationData, setUtilizationData] = useState<CostByUserRow[] | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    fetchRecords();
    fetchActivePayroll();
    fetchUtilizationData();
  }, [isAdmin]);

  async function fetchUtilizationData() {
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const end = now.toISOString().split('T')[0];
      const data = await getCostByUser(start, end);
      setUtilizationData(data);
    } catch (e) {
      console.error('Error fetching utilization:', e);
      setUtilizationData([]);
    }
  }

  async function fetchActivePayroll() {
    try {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, monthly_salary, hourly_rate, currency');
      if (error) throw error;
      const byCurrency: Record<string, { total: number; count: number }> = {};
      (users || []).forEach((u: { monthly_salary?: number | null; hourly_rate?: number | null; currency?: string }) => {
        const hasSalary = u.monthly_salary != null && u.monthly_salary > 0;
        const hasHourly = u.hourly_rate != null && u.hourly_rate > 0;
        const amount = hasSalary && u.monthly_salary
          ? u.monthly_salary
          : hasHourly && u.hourly_rate
            ? u.hourly_rate * HOURS_PER_MONTH
            : 0;
        if (amount <= 0) return;
        const cur = u.currency || 'COP';
        if (!byCurrency[cur]) byCurrency[cur] = { total: 0, count: 0 };
        byCurrency[cur].total += amount;
        byCurrency[cur].count += 1;
      });
      setActivePayroll(
        Object.entries(byCurrency).map(([currency, v]) => ({ total: v.total, currency, count: v.count }))
      );
    } catch (e) {
      console.error('Error fetching active payroll:', e);
      setActivePayroll([]);
    }
  }

  async function calculateSuggestedAmount() {
    if (!current.period_start || !current.period_end) {
      toast.error('Selecciona inicio y fin del período');
      return;
    }
    setLoadingSuggested(true);
    try {
      const data = await getPayrollBeneficiaries(current.period_start, current.period_end);
      const byCurrency: Record<string, number> = {};
      data.forEach((b) => {
        if (b.amount == null) return;
        const cur = b.currency || 'COP';
        byCurrency[cur] = (byCurrency[cur] || 0) + b.amount;
      });
      const entries = Object.entries(byCurrency);
      if (entries.length === 0) {
        setSuggestedAmount(null);
        toast.info('No hay beneficiarios con monto para este período');
      } else {
        const main = entries[0];
        setSuggestedAmount({ total: main[1], currency: main[0] });
        if (entries.length > 1) {
          setCurrent({ ...current, total_amount: main[1], currency: main[0] });
        } else {
          setCurrent({ ...current, total_amount: main[1] });
        }
        toast.success(`Calculado: ${main[1].toLocaleString('es-CO')} ${main[0]}`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al calcular');
    } finally {
      setLoadingSuggested(false);
    }
  }

  async function openDetail(rec: PayrollRecord) {
    setDetailRecord(rec);
    setLoadingDetail(true);
    try {
      const data = await getPayrollBeneficiaries(rec.period_start, rec.period_end);
      setBeneficiaries(data);
    } catch (err) {
      console.error('Error loading beneficiaries:', err);
      toast.error('Error al cargar cuentas');
    } finally {
      setLoadingDetail(false);
    }
  }

  function copyAccount(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Cuenta copiada');
  }

  function exportBeneficiariesCsv() {
    if (!detailRecord || beneficiaries.length === 0) return;
    const headers = ['Usuario', 'Email', 'Monto', 'Moneda', 'Fuente', 'Horas trabajadas', 'Cuenta de pago'];
    const rows = beneficiaries.map((b) => [
      b.user_name,
      b.user_email,
      b.amount ?? '',
      b.currency,
      b.source === 'salary' ? 'Salario' : b.source === 'hourly' ? 'Por hora' : '',
      b.hours_worked ?? '',
      b.payment_account ?? '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nomina_${detailRecord.period_start}_${detailRecord.period_end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exportado');
  }

  async function fetchRecords() {
    setLoading(true);
    try {
      const res = await supabase
        .from('payroll_payments')
        .select('*')
        .order('period_start', { ascending: false });
      const { data } = res as { data: PayrollRecord[] | null };
      setRecords(data || []);
    } catch (err) {
      console.error('Error fetching payroll:', err);
      toast.error('Error al cargar nómina');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!current.period_start || !current.period_end || current.total_amount <= 0) {
      setError('Período y monto son obligatorios.');
      return;
    }

    if (new Date(current.period_start) > new Date(current.period_end)) {
      setError('La fecha de inicio debe ser anterior a la de fin.');
      return;
    }

    try {
      if (modalMode === 'create') {
        const { data: created, error: err } = await supabase
          .from('payroll_payments')
          .insert([
            {
              period_start: current.period_start,
              period_end: current.period_end,
              total_amount: Number(current.total_amount),
              currency: current.currency || 'COP',
              paid_at: current.paid_at || new Date().toISOString(),
              notes: current.notes || null,
              created_by: currentUser?.id || null,
            },
          ])
          .select();

        if (err) throw err;
        const createdRecord = Array.isArray(created) ? created[0] : created;
        const recordId = createdRecord && typeof createdRecord === 'object' && 'id' in createdRecord ? (createdRecord as { id: string }).id : null;
        if (currentUser?.id && recordId) {
          await logAudit({
            user_id: currentUser.id,
            entity_type: 'payroll',
            entity_id: recordId,
            action: 'create',
            summary: `Pago nómina: ${current.period_start} - ${current.period_end} · ${Number(current.total_amount).toLocaleString('es-CO')} ${current.currency}`,
          });
        }
        toast.success('Registro de nómina creado');
      } else {
        const { error: err } = await supabase
          .from('payroll_payments')
          .update({
            period_start: current.period_start,
            period_end: current.period_end,
            total_amount: Number(current.total_amount),
            currency: current.currency || 'COP',
            paid_at: current.paid_at || new Date().toISOString(),
            notes: current.notes || null,
          })
          .eq('id', current.id);

        if (err) throw err;
        if (currentUser?.id) {
          await logAudit({
            user_id: currentUser.id,
            entity_type: 'payroll',
            entity_id: current.id,
            action: 'update',
            summary: `Pago nómina actualizado: ${current.period_start} - ${current.period_end}`,
          });
        }
        toast.success('Registro actualizado');
      }

      setShowModal(false);
      setCurrent({ id: '', period_start: '', period_end: '', total_amount: 0, currency: 'COP', paid_at: getDefaultPaidAt(''), notes: null });
      fetchRecords();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      setError(msg);
      toast.error(msg);
    }
  }

  async function handleDelete(id: string) {
    const rec = records.find((r) => r.id === id);
    if (!window.confirm(`¿Eliminar el registro de nómina ${rec?.period_start} - ${rec?.period_end}?`)) return;

    try {
      const { error: err } = await supabase.from('payroll_payments').delete().eq('id', id);
      if (err) throw err;
      if (currentUser?.id) {
        await logAudit({
          user_id: currentUser.id,
          entity_type: 'payroll',
          entity_id: id,
          action: 'delete',
          summary: `Pago nómina eliminado: ${rec?.period_start} - ${rec?.period_end}`,
        });
      }
      toast.success('Registro eliminado');
      setRecords(records.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Error deleting payroll:', err);
      toast.error('Error al eliminar');
    }
  }

  const filteredRecords = records.filter((r) => new Date(r.period_start).getFullYear() === yearFilter);
  const totalByYearByCurrency = filteredRecords.reduce(
    (acc, r) => {
      const cur = r.currency || 'COP';
      acc[cur] = (acc[cur] || 0) + r.total_amount;
      return acc;
    },
    {} as Record<string, number>
  );
  const availableYears = records.length > 0
    ? [...new Set(records.map((r) => new Date(r.period_start).getFullYear()))].sort((a, b) => b - a)
    : [CURRENT_YEAR];

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h2 className="text-lg font-medium text-yellow-800">Acceso restringido</h2>
          <p className="text-yellow-700">Solo administradores pueden gestionar la nómina.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <DollarSign className="w-7 h-7" />
            Nómina
          </h1>
          <p className="text-gray-600 mt-1">Registro de pagos de nómina para control y trazabilidad</p>
        </div>
        <button
          onClick={() => {
            const defaultPaid = getDefaultPaidAt(new Date().toISOString().split('T')[0]);
            setCurrent({ id: '', period_start: '', period_end: '', total_amount: 0, currency: 'COP', paid_at: defaultPaid, notes: null });
            setSuggestedAmount(null);
            setModalMode('create');
            setShowModal(true);
          }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nuevo pago
        </button>
      </div>

      {/* KPIs: Nómina activa y total pagado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {activePayroll.length > 0 && (
          <div className="bg-white rounded-lg shadow p-5 border border-gray-100">
            <h3 className="text-sm font-medium text-gray-600 flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-emerald-600" />
              Nómina activa total del equipo
            </h3>
            <div className="flex flex-wrap gap-3">
              {activePayroll.map((p) => (
                <span key={p.currency} className="text-xl font-bold text-emerald-700">
                  {p.total.toLocaleString('es-CO')} {p.currency}
                  <span className="text-sm font-normal text-gray-500 ml-1">/ mes ({p.count} personas)</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {(Object.keys(totalByYearByCurrency).length > 0 || records.length > 0) && (
          <div className="bg-white rounded-lg shadow p-5 border border-gray-100">
            <h3 className="text-sm font-medium text-gray-600 flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-indigo-600" />
              Total pagado {yearFilter}
            </h3>
            <div className="flex flex-wrap gap-3">
              {Object.entries(totalByYearByCurrency).map(([cur, tot]) => (
                <span key={cur} className="text-xl font-bold text-indigo-700">
                  {tot.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {cur}
                </span>
              ))}
              {Object.keys(totalByYearByCurrency).length === 0 && (
                <span className="text-gray-500">Sin pagos este año</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Utilización de nómina: pagas igual trabajen o no */}
      {utilizationData && utilizationData.length > 0 && (() => {
        const salaryUsers = utilizationData.filter((m) => m.rate_source === 'salary' && m.monthly_salary != null && m.monthly_salary > 0);
        if (salaryUsers.length === 0) return null;
        const underutilized = salaryUsers.filter((m) => {
          const hours = m.total_hours || 0;
          const utilization = (hours / 160) * 100;
          return utilization < 80 && hours < 160; // menos del 80% de jornada
        });
        const totalSalaryByCur = salaryUsers.reduce((acc, m) => {
          const c = m.currency || 'COP';
          acc[c] = (acc[c] || 0) + (m.total_cost ?? 0);
          return acc;
        }, {} as Record<string, number>);
        const totalHoursWorked = salaryUsers.reduce((acc, m) => acc + m.total_hours, 0);
        const expectedHours = salaryUsers.length * 160;
        const utilizationPct = expectedHours > 0 ? Math.round((totalHoursWorked / expectedHours) * 100) : 0;
        const totalSalaryPaid = Object.values(totalSalaryByCur).reduce((a, b) => a + b, 0);
        const effectiveCostPerHour = totalHoursWorked > 0 ? totalSalaryPaid / totalHoursWorked : 0;
        return (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-5">
            <h3 className="text-lg font-semibold text-amber-900 flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5" />
              Utilización de la nómina (este mes)
            </h3>
            <p className="text-sm text-amber-800 mb-4">
              Con salario fijo pagas lo mismo trabajen o no. Aquí ves cuánto pagas vs cuántas horas obtienes.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-white rounded-lg p-3 text-sm">
                <p className="text-gray-600">Nómina fija (empleados)</p>
                <p className="font-bold text-amber-900">
                  {Object.entries(totalSalaryByCur).map(([cur, tot], i) => (
                    <span key={cur}>{i > 0 && ' · '}{tot.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {cur}</span>
                  ))}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3 text-sm">
                <p className="text-gray-600">Horas trabajadas</p>
                <p className="font-bold text-amber-900">{totalHoursWorked.toFixed(1)}h / {expectedHours}h esperadas</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-sm">
                <p className="text-gray-600">Utilización</p>
                <p className={`font-bold ${utilizationPct < 80 ? 'text-red-600' : 'text-amber-900'}`}>{utilizationPct}%</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-sm">
                <p className="text-gray-600">Coste efectivo por hora</p>
                <p className="font-bold text-amber-900">
                  {effectiveCostPerHour > 0 ? effectiveCostPerHour.toLocaleString('es-CO', { maximumFractionDigits: 0 }) : '—'} /h
                </p>
              </div>
            </div>
            {underutilized.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-900 mb-2">Empleados con posible subutilización (&lt;80% jornada):</p>
                <ul className="space-y-1 text-sm">
                  {underutilized.map((m) => {
                    const util = Math.round((m.total_hours / 160) * 100);
                    return (
                      <li key={m.user_id} className="flex justify-between items-center py-1 bg-white/60 rounded px-2">
                        <span>{m.user_name}</span>
                        <span className="text-amber-800 font-medium">
                          {m.total_hours.toFixed(1)}h ({util}%) · {m.total_cost != null ? m.total_cost.toLocaleString('es-CO', { maximumFractionDigits: 0 }) : '—'} {m.currency}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        );
      })()}

      {records.length > 0 && (
        <div className="flex items-center gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Filter className="w-4 h-4" />
            Filtrar por año
          </label>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(Number(e.target.value))}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            {availableYears.length > 0 ? (
              availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))
            ) : (
              <option value={CURRENT_YEAR}>{CURRENT_YEAR}</option>
            )}
          </select>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded" />
          ))}
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">
            {records.length === 0
              ? 'No hay registros de nómina. Añade el primer pago.'
              : `No hay pagos en ${yearFilter}. Cambia el filtro o añade un pago.`}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-700">Período</th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">Fecha pago</th>
                <th className="px-6 py-3 text-right font-medium text-gray-700">Monto</th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">Notas</th>
                <th className="px-6 py-3 text-right font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRecords.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    {format(new Date(r.period_start), 'd MMM yyyy', { locale: es })} — {format(new Date(r.period_end), 'd MMM yyyy', { locale: es })}
                  </td>
                  <td className="px-6 py-4">
                    {r.paid_at ? format(new Date(r.paid_at), 'd MMM yyyy', { locale: es }) : '—'}
                  </td>
                  <td className="px-6 py-4 text-right font-medium">
                    {r.total_amount.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {r.currency}
                  </td>
                  <td className="px-6 py-4 text-gray-600 max-w-xs truncate">{r.notes || '—'}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => openDetail(r)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 mr-2"
                      title="Ver beneficiarios y cuentas"
                    >
                      <CreditCard className="w-4 h-4" />
                      Ver beneficiarios
                    </button>
                    <button
                      onClick={() => {
                        setCurrent({
                          id: r.id,
                          period_start: r.period_start.split('T')[0],
                          period_end: r.period_end.split('T')[0],
                          total_amount: r.total_amount,
                          currency: r.currency,
                          paid_at: r.paid_at ? r.paid_at.split('T')[0] : getDefaultPaidAt(r.period_end),
                          notes: r.notes,
                        });
                        setModalMode('edit');
                        setShowModal(true);
                      }}
                      className="text-gray-500 hover:text-indigo-600 mr-2"
                    >
                      <Edit className="w-4 h-4 inline" />
                    </button>
                    <button onClick={() => handleDelete(r.id)} className="text-gray-500 hover:text-red-600">
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold">{modalMode === 'create' ? 'Nuevo pago de nómina' : 'Editar pago'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-4 space-y-4">
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Inicio período *</label>
                <input
                  type="date"
                  value={current.period_start}
                  onChange={(e) => {
                    setCurrent({ ...current, period_start: e.target.value });
                    setSuggestedAmount(null);
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fin período *</label>
                <input
                  type="date"
                  value={current.period_end}
                  onChange={(e) => {
                    const periodEnd = e.target.value;
                    const next = { ...current, period_end: periodEnd };
                    if (modalMode === 'create' && periodEnd) {
                      next.paid_at = getDefaultPaidAt(periodEnd);
                    }
                    setCurrent(next);
                    setSuggestedAmount(null);
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
              {modalMode === 'create' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={calculateSuggestedAmount}
                    disabled={!current.period_start || !current.period_end || loadingSuggested}
                    className="flex items-center gap-2 px-3 py-2 bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    <Calculator className="w-4 h-4" />
                    {loadingSuggested ? 'Calculando…' : 'Calcular monto desde beneficiarios'}
                  </button>
                  {suggestedAmount && (
                    <span className="text-sm text-emerald-600 font-medium">
                      Sugerido: {suggestedAmount.total.toLocaleString('es-CO')} {suggestedAmount.currency}
                    </span>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={current.total_amount || ''}
                  onChange={(e) => setCurrent({ ...current, total_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
                <select
                  value={current.currency}
                  onChange={(e) => setCurrent({ ...current, currency: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="COP">COP</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de pago (por defecto: 1 del mes siguiente)</label>
                <input
                  type="date"
                  value={current.paid_at || ''}
                  onChange={(e) => setCurrent({ ...current, paid_at: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <input
                  type="text"
                  value={current.notes || ''}
                  onChange={(e) => setCurrent({ ...current, notes: e.target.value || null })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Opcional"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                  {modalMode === 'create' ? 'Crear' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal detalle: cuentas de pago */}
      {detailRecord && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <div>
                <h3 className="text-lg font-semibold">Beneficiarios — {detailRecord.period_start.split('T')[0]} a {detailRecord.period_end.split('T')[0]}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Fecha de pago: {detailRecord.paid_at ? format(new Date(detailRecord.paid_at), "d 'de' MMMM yyyy", { locale: es }) : '—'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {beneficiaries.length > 0 && (
                  <button
                    onClick={exportBeneficiariesCsv}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    <Download className="w-4 h-4" />
                    Exportar CSV
                  </button>
                )}
                <button onClick={() => setDetailRecord(null)} className="text-gray-500 hover:text-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-auto flex-1">
              {loadingDetail ? (
                <div className="animate-pulse space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-12 bg-gray-200 rounded" />
                  ))}
                </div>
              ) : beneficiaries.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No hay usuarios con sueldo o tarifa configurada. Configúralos en Usuarios.</p>
              ) : (
                <div className="space-y-3">
                  {beneficiaries.some((b) => !b.payment_account) && (
                    <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                      <span className="font-medium">Atención:</span>
                      {beneficiaries.filter((b) => !b.payment_account).length} usuario(s) sin cuenta de pago configurada. Configúrala en Usuarios.
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Usuario</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-700">Monto</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-700">Fuente</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-700">Horas</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Cuenta de pago</th>
                        <th className="px-4 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {beneficiaries.map((b) => (
                        <tr key={b.user_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{b.user_name}</p>
                            <p className="text-xs text-gray-500">{b.user_email}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {b.amount != null ? (
                              <span>{b.amount.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {b.currency}</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {b.source === 'salary' ? (
                              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">Salario</span>
                            ) : b.source === 'hourly' ? (
                              <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 rounded">Por hora</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {b.hours_worked != null ? `${b.hours_worked.toFixed(1)} h` : '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {b.payment_account ? (
                              <span className="font-mono text-xs">{b.payment_account}</span>
                            ) : (
                              <span className="text-amber-600 text-xs font-medium">Sin cuenta</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {b.payment_account && (
                              <button
                                onClick={() => copyAccount(b.payment_account!)}
                                className="text-gray-400 hover:text-indigo-600"
                                title="Copiar cuenta"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {beneficiaries.length > 0 && (
                    <div className="pt-2 border-t text-sm text-gray-600">
                      <strong>Total:</strong>{' '}
                      {Object.entries(
                        beneficiaries.reduce(
                          (acc, b) => {
                            if (b.amount == null) return acc;
                            const c = b.currency || 'COP';
                            acc[c] = (acc[c] || 0) + b.amount;
                            return acc;
                          },
                          {} as Record<string, number>
                        )
                      ).map(([cur, tot]) => `${tot.toLocaleString('es-CO')} ${cur}`).join(' · ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
