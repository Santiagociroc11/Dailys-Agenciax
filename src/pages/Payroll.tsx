import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logAudit } from '../lib/audit';
import { DollarSign, Plus, Edit, Trash2, X, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface PayrollRecord {
  id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  currency: string;
  paid_at: string;
  notes: string | null;
}

export default function Payroll() {
  const { isAdmin, user: currentUser } = useAuth();
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [current, setCurrent] = useState<PayrollRecord>({
    id: '',
    period_start: '',
    period_end: '',
    total_amount: 0,
    currency: 'COP',
    paid_at: new Date().toISOString().split('T')[0],
    notes: null,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRecords();
  }, []);

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
        if (currentUser?.id && created?.[0]) {
          await logAudit({
            user_id: currentUser.id,
            entity_type: 'payroll',
            entity_id: (created[0] as { id: string }).id,
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
      setCurrent({ id: '', period_start: '', period_end: '', total_amount: 0, currency: 'COP', paid_at: new Date().toISOString().split('T')[0], notes: null });
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

  const totalYear = records
    .filter((r) => {
      const y = new Date(r.period_start).getFullYear();
      return y === new Date().getFullYear();
    })
    .reduce((acc, r) => acc + r.total_amount, 0);

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
            setCurrent({ id: '', period_start: '', period_end: '', total_amount: 0, currency: 'COP', paid_at: new Date().toISOString().split('T')[0], notes: null });
            setModalMode('create');
            setShowModal(true);
          }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nuevo pago
        </button>
      </div>

      {records.length > 0 && (
        <div className="mb-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
          <p className="text-sm text-indigo-700 font-medium">Total pagado este año</p>
          <p className="text-2xl font-bold text-indigo-900">
            {totalYear.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP
          </p>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No hay registros de nómina. Añade el primer pago.</p>
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
              {records.map((r) => (
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
                      onClick={() => {
                        setCurrent({
                          id: r.id,
                          period_start: r.period_start.split('T')[0],
                          period_end: r.period_end.split('T')[0],
                          total_amount: r.total_amount,
                          currency: r.currency,
                          paid_at: r.paid_at ? r.paid_at.split('T')[0] : new Date().toISOString().split('T')[0],
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
                  onChange={(e) => setCurrent({ ...current, period_start: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fin período *</label>
                <input
                  type="date"
                  value={current.period_end}
                  onChange={(e) => setCurrent({ ...current, period_end: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de pago</label>
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
    </div>
  );
}
