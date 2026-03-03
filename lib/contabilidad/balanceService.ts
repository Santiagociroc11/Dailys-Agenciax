/**
 * Servicio de balance
 *
 * Calcula el balance por entidad siguiendo el modelo de dominio.
 * Fórmula: income - expense - distribuciones_utilidades
 */


export type BalanceRow = {
  entity_id: string | null;
  entity_name: string;
  entity_type: string | null;
  usd: number;
  cop: number;
};

export type BalanceParams = {
  entryIds: string[];
  liquidacion: boolean;
};

type PgResult = { _id: { entity_id: string | null; currency: string }; total_amount: number };
type EquityResult = { _id: { entity_id: string | null; currency: string }; credit: number; debitFromReparticion: number };

function normCurrency(c: string): 'USD' | 'COP' {
  const u = (c || 'USD').toUpperCase();
  return u === 'COP' ? 'COP' : 'USD';
}

/**
 * Monto a restar por distribuciones.
 * - Créditos: siempre (traslados SALIDA)
 * - Débitos: solo REPARTICIÓN (no traslados; el débito en traslado es del destino, no se resta)
 */
export function distribucionAmount(credit: number, debitFromReparticion: number): number {
  return credit + debitFromReparticion;
}

import type { PipelineStage } from 'mongoose';

/**
 * Pipeline de agregación para P&L (income - expense) por entidad.
 * @param excludedAccountIds - IDs de cuentas a excluir (ej. CORTE UTILIDADES para "movimientos no contables")
 */
export function pgPipeline(entryIds: string[], excludedAccountIds: string[] = []): PipelineStage[] {
  const stages: PipelineStage[] = [
    { $match: { journal_entry_id: { $in: entryIds } } },
    { $lookup: { from: 'acct_chart_accounts', localField: 'account_id', foreignField: 'id', as: 'acc' } },
    { $unwind: '$acc' },
    { $match: { 'acc.type': { $in: ['income', 'expense'] } } },
    ...(excludedAccountIds.length > 0 ? [{ $match: { account_id: { $nin: excludedAccountIds } } }] : []),
    {
      $addFields: {
        amount: {
          $cond: [
            { $eq: ['$acc.type', 'income'] },
            { $subtract: ['$credit', '$debit'] },
            { $subtract: [0, { $subtract: ['$debit', '$credit'] }] },
          ],
        },
      },
    },
    { $group: { _id: { entity_id: '$entity_id', currency: '$currency' }, total_amount: { $sum: '$amount' } } },
  ];
  return stages;
}

/**
 * Pipeline para distribuciones: créditos (traslados) + débitos de REPARTICIÓN.
 * Excluye débitos de traslados (ingreso contable/traslado utilidades) porque
 * esos son del destino y no deben restarse.
 */
export function equityDistPipeline(entryIds: string[], equityAccountIds: string[]): PipelineStage[] {
  return [
    { $match: { journal_entry_id: { $in: entryIds }, account_id: { $in: equityAccountIds } } },
    {
      $lookup: {
        from: 'acct_journal_entries',
        localField: 'journal_entry_id',
        foreignField: 'id',
        as: 'entry',
        pipeline: [{ $project: { reference: 1 } }],
      },
    },
    { $unwind: '$entry' },
    {
      $group: {
        _id: { entity_id: '$entity_id', currency: '$currency' },
        credit: { $sum: '$credit' },
        debitFromReparticion: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gt: ['$debit', 0] },
                  { $not: { $regexMatch: { input: { $ifNull: ['$entry.reference', ''] }, regex: 'traslado utilidades|ingreso contable', options: 'i' } } },
                ],
              },
              '$debit',
              0,
            ],
          },
        },
      },
    },
  ];
}

/**
 * Procesa resultados de P&L y equity para producir el balance final.
 */
export function buildBalanceRows(
  pgResults: PgResult[],
  equityResults: EquityResult[],
  entityMap: Map<string, { name: string; type: string }>,
  liquidacion: boolean
): BalanceRow[] {
  const rowMap = new Map<string, BalanceRow>();

  for (const r of pgResults) {
    const key = r._id.entity_id ?? 'null';
    const cur = normCurrency(r._id.currency || 'USD');
    const amt = Math.round(r.total_amount * 100) / 100;
    if (!rowMap.has(key)) {
      rowMap.set(key, {
        entity_id: r._id.entity_id,
        entity_name: r._id.entity_id ? (entityMap.get(r._id.entity_id)?.name ?? 'Sin asignar') : 'Sin asignar',
        entity_type: r._id.entity_id ? (entityMap.get(r._id.entity_id)?.type ?? null) : null,
        usd: 0,
        cop: 0,
      });
    }
    const row = rowMap.get(key)!;
    if (cur === 'COP') row.cop += amt;
    else row.usd += amt;
  }

  if (liquidacion) {
    for (const d of equityResults) {
      const key = d._id.entity_id ?? 'null';
      const cur = normCurrency(d._id.currency || 'USD');
      const amt = Math.round(distribucionAmount(d.credit, d.debitFromReparticion) * 100) / 100;
      if (rowMap.has(key)) {
        const row = rowMap.get(key)!;
        if (cur === 'COP') row.cop -= amt;
        else row.usd -= amt;
      }
    }
  }

  return Array.from(rowMap.values()).sort((a, b) => (b.usd + b.cop) - (a.usd + a.cop));
}
