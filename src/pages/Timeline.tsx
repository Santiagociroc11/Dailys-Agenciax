import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getCostByClient, getProjectCostConsumed } from '../lib/metrics';
import { DollarSign, Calendar, Building2, FolderOpen, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

const HOURS_PER_MONTH = 160;

interface MonthData {
  month: string;
  monthLabel: string;
  payrollPaid: { amount: number; currency: string }[];
  costByClient: { client_id: string; client_name: string; cost: number; currency: string }[];
  costByProject: { project_id: string; project_name: string; cost: number; currency: string }[];
}

interface ActivePayrollSummary {
  total: number;
  currency: string;
  count: number;
}

export default function Timeline() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [monthsToShow, setMonthsToShow] = useState(6);
  const [timelineData, setTimelineData] = useState<MonthData[]>([]);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [activePayroll, setActivePayroll] = useState<ActivePayrollSummary[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchData();
  }, [isAdmin, monthsToShow]);

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

  async function fetchData() {
    setLoading(true);
    try {
      await fetchActivePayroll();
      const now = new Date();
      const months: MonthData[] = [];
      const projectIds = new Set<string>();

      for (let i = 0; i < monthsToShow; i++) {
        const d = subMonths(now, i);
        const start = startOfMonth(d).toISOString().split('T')[0];
        const end = endOfMonth(d).toISOString().split('T')[0];

        const [payrollRes, costClient, costProject] = await Promise.all([
          supabase.from('payroll_payments').select('total_amount, currency, period_start, period_end').lte('period_start', end).gte('period_end', start),
          getCostByClient(start, end),
          getProjectCostConsumed(start, end),
        ]);

        const payrollRows = (payrollRes.data || []) as { total_amount: number; currency: string; period_start: string; period_end: string }[];
        const payrollByCur: Record<string, number> = {};
        payrollRows.forEach((r) => {
          const cur = r.currency || 'COP';
          payrollByCur[cur] = (payrollByCur[cur] || 0) + r.total_amount;
        });

        const clientByCur: Record<string, Record<string, number>> = {};
        costClient.forEach((r) => {
          if (!clientByCur[r.client_id]) clientByCur[r.client_id] = {};
          clientByCur[r.client_id][r.currency] = (clientByCur[r.client_id][r.currency] || 0) + r.cost_consumed;
        });

        const projectByCur: Record<string, Record<string, number>> = {};
        costProject.forEach((r) => {
          projectIds.add(r.project_id);
          if (!projectByCur[r.project_id]) projectByCur[r.project_id] = {};
          projectByCur[r.project_id][r.currency] = (projectByCur[r.project_id][r.currency] || 0) + r.cost_consumed;
        });

        const clientNameMap = new Map(costClient.map((c) => [c.client_id, c.client_name]));

        months.push({
          month: start,
          monthLabel: format(d, "MMMM yyyy", { locale: es }),
          payrollPaid: Object.entries(payrollByCur).map(([currency, amount]) => ({ amount, currency })),
          costByClient: Object.entries(clientByCur).flatMap(([cid, byCur]) =>
            Object.entries(byCur).map(([currency, cost]) => ({
              client_id: cid,
              client_name: clientNameMap.get(cid) || 'Sin nombre',
              cost,
              currency,
            }))
          ),
          costByProject: Object.entries(projectByCur).flatMap(([pid, byCur]) =>
            Object.entries(byCur).map(([currency, cost]) => ({
              project_id: pid,
              project_name: '', // se llenará después
              cost,
              currency,
            }))
          ),
        });
      }

      const projIds = Array.from(projectIds);
      if (projIds.length > 0) {
        const { data: projData } = await supabase.from('projects').select('id, name').in('id', projIds);
        const projMap: Record<string, string> = {};
        (projData || []).forEach((p: { id: string; name: string }) => { projMap[p.id] = p.name; });
        months.forEach((m) => {
          m.costByProject.forEach((p) => { p.project_name = projMap[p.project_id] || 'Sin nombre'; });
        });
      }

      setTimelineData(months);
    } catch (e) {
      console.error('Error fetching timeline:', e);
      setTimelineData([]);
    } finally {
      setLoading(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h2 className="text-lg font-medium text-yellow-800">Acceso restringido</h2>
          <p className="text-yellow-700">Solo administradores pueden ver el timeline.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-7 h-7" />
            Timeline de pagos y utilización
          </h1>
          <p className="text-gray-600 mt-1">Pagos de nómina y coste por cliente/proyecto mes a mes</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Últimos</label>
          <select
            value={monthsToShow}
            onChange={(e) => setMonthsToShow(Number(e.target.value))}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Resumen del mes actual: pago + utilización + comparación */}
          {timelineData.length > 0 && (() => {
            const current = timelineData[0];
            const payrollByCur = current.payrollPaid.reduce((acc, p) => {
              acc[p.currency] = (acc[p.currency] || 0) + p.amount;
              return acc;
            }, {} as Record<string, number>);
            const utilizationByCur = current.costByProject.reduce((acc, r) => {
              acc[r.currency] = (acc[r.currency] || 0) + r.cost;
              return acc;
            }, {} as Record<string, number>);
            const mainCurrency = current.payrollPaid[0]?.currency || activePayroll[0]?.currency || 'COP';
            const paidTotal = payrollByCur[mainCurrency] ?? Object.values(payrollByCur)[0] ?? 0;
            const displayUtil = utilizationByCur[mainCurrency] ?? Object.values(utilizationByCur)[0] ?? 0;
            const estimatedPayroll = activePayroll.find((p) => p.currency === mainCurrency)?.total ?? activePayroll[0]?.total ?? 0;
            const displayPaid = paidTotal > 0 ? paidTotal : estimatedPayroll;
            const paidLabel = paidTotal > 0 ? 'Pagado' : 'Nómina estimada';
            const diff = displayPaid - displayUtil;
            const utilPct = displayPaid > 0 ? Math.round((displayUtil / displayPaid) * 100) : 0;
            return (
              <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl shadow border border-indigo-100 p-6">
                <h3 className="text-lg font-semibold text-indigo-900 flex items-center gap-2 mb-4">
                  <BarChart3 className="w-5 h-5" />
                  Resumen del mes actual — {current.monthLabel}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-white rounded-lg p-4 border border-gray-100">
                    <p className="text-sm text-gray-600 mb-1">{paidLabel}</p>
                    <p className="text-xl font-bold text-emerald-700">
                      {displayPaid.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {mainCurrency}
                    </p>
                    {paidTotal === 0 && estimatedPayroll > 0 && (
                      <p className="text-xs text-gray-500 mt-1">Sin pagos registrados aún</p>
                    )}
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-100">
                    <p className="text-sm text-gray-600 mb-1">Utilización asignada</p>
                    <p className="text-xl font-bold text-indigo-700">
                      {displayUtil.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {mainCurrency}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Coste en proyectos (horas × tarifa)</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-100">
                    <p className="text-sm text-gray-600 mb-1">Comparación</p>
                    <p className="text-lg font-bold text-gray-900">
                      Pagamos {displayPaid.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {mainCurrency}
                      <br />
                      <span className="text-indigo-600">pero la utilización asignada es</span>
                      <br />
                      <span className="text-indigo-700">{displayUtil.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {mainCurrency}</span>
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-sm font-medium ${utilPct < 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {utilPct}% de la nómina asignada a proyectos
                      </span>
                      {diff !== 0 && (
                        <span className="text-xs text-gray-500">
                          (diferencia: {diff > 0 ? '+' : ''}{diff.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {mainCurrency})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {(current.costByClient.length > 0 || current.costByProject.length > 0) && (
                  <div className="flex flex-wrap gap-4 text-sm text-indigo-700">
                    {current.costByClient.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        <span>{new Set(current.costByClient.map((c) => c.client_id)).size} clientes</span>
                      </div>
                    )}
                    {current.costByProject.length > 0 && (
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4" />
                        <span>{new Set(current.costByProject.map((p) => p.project_id)).size} proyectos</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {timelineData.map((m) => {
            const isExpanded = expandedMonth === m.month;
            const hasDetails = m.costByClient.length > 0 || m.costByProject.length > 0;
            return (
              <div key={m.month} className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
                <button
                  onClick={() => setExpandedMonth(isExpanded ? null : m.month)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 capitalize">{m.monthLabel}</h3>
                      <div className="flex flex-wrap gap-3 mt-1 text-sm">
                        {m.payrollPaid.length > 0 ? (
                          m.payrollPaid.map((p) => (
                            <span key={`p-${p.currency}`} className="text-emerald-600 font-medium flex items-center gap-1">
                              <DollarSign className="w-4 h-4" />
                              Pagado: {p.amount.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {p.currency}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-500">Sin registros de pago</span>
                        )}
                        {(() => {
                          const utilByCur = m.costByProject.reduce((acc, r) => {
                            acc[r.currency] = (acc[r.currency] || 0) + r.cost;
                            return acc;
                          }, {} as Record<string, number>);
                          const entries = Object.entries(utilByCur);
                          if (entries.length === 0) return null;
                          return entries.map(([cur, amt]) => (
                            <span key={`u-${cur}`} className="text-indigo-600 font-medium flex items-center gap-1">
                              Utilización: {amt.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {cur}
                            </span>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                  {hasDetails && (
                    <span className="text-gray-500">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </span>
                  )}
                </button>

                {isExpanded && hasDetails && (
                  <div className="border-t bg-gray-50 p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {m.costByClient.length > 0 && (
                      <div>
                        <h4 className="font-medium text-gray-700 flex items-center gap-2 mb-2">
                          <Building2 className="w-4 h-4 text-indigo-600" />
                          Por cliente
                        </h4>
                        <ul className="space-y-1.5 text-sm">
                          {(() => {
                            const byClient = m.costByClient.reduce((acc, r) => {
                              if (!acc[r.client_id]) acc[r.client_id] = { name: r.client_name, byCur: {} as Record<string, number> };
                              acc[r.client_id].byCur[r.currency] = (acc[r.client_id].byCur[r.currency] || 0) + r.cost;
                              return acc;
                            }, {} as Record<string, { name: string; byCur: Record<string, number> }>);
                            return Object.entries(byClient).map(([cid, v]) => (
                              <li key={cid} className="flex justify-between py-1">
                                <span>{v.name}</span>
                                <span className="font-medium text-indigo-600">
                                  {Object.entries(v.byCur).map(([cur, tot], i) => (
                                    <span key={cur}>{i > 0 && ' · '}{tot.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {cur}</span>
                                  ))}
                                </span>
                              </li>
                            ));
                          })()}
                        </ul>
                      </div>
                    )}
                    {m.costByProject.length > 0 && (
                      <div>
                        <h4 className="font-medium text-gray-700 flex items-center gap-2 mb-2">
                          <FolderOpen className="w-4 h-4 text-indigo-600" />
                          Por proyecto
                        </h4>
                        <ul className="space-y-1.5 text-sm">
                          {(() => {
                            const byProj = m.costByProject.reduce((acc, r) => {
                              if (!acc[r.project_id]) acc[r.project_id] = { name: r.project_name, byCur: {} as Record<string, number> };
                              acc[r.project_id].byCur[r.currency] = (acc[r.project_id].byCur[r.currency] || 0) + r.cost;
                              return acc;
                            }, {} as Record<string, { name: string; byCur: Record<string, number> }>);
                            return Object.entries(byProj).map(([pid, v]) => (
                              <li key={pid} className="flex justify-between py-1">
                                <span>{v.name}</span>
                                <span className="font-medium text-indigo-600">
                                  {Object.entries(v.byCur).map(([cur, tot], i) => (
                                    <span key={cur}>{i > 0 && ' · '}{tot.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {cur}</span>
                                  ))}
                                </span>
                              </li>
                            ));
                          })()}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
