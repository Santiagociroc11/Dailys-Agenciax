/**
 * Simula el import COMPLETO tal cual lo hace la API.
 * Replica exactamente la lógica de api/contabilidad.ts para predecir el balance.
 *
 * Ejecutar: npx tsx scripts/simular-import-completo.ts "CUENTAS DINERO PRESUPUESTO final.csv"
 *
 * Compara el balance simulado con lo que debería dar el import real.
 */
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { join } from 'path';

const SPANISH_MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

function parseSpanishDate(str: string): Date | null {
  const m = str.trim().match(/^(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})$/i);
  if (!m) return null;
  const month = SPANISH_MONTHS[m[2].toLowerCase()];
  if (month == null) return null;
  const d = new Date(parseInt(m[3], 10), month, parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d;
}

function parseAmount(str: string): number | null {
  const s = String(str || '').trim().replace(/\s/g, '').replace(/\$/g, '').replace(/,/g, '');
  if (!s) return null;
  const neg = /^-/.test(s) || s.startsWith('-$');
  const num = parseFloat(s.replace(/^-\$?/, '').replace(/^\$?/, ''));
  if (isNaN(num)) return null;
  return neg ? -num : num;
}

const csvPath = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(process.cwd(), 'CUENTAS DINERO PRESUPUESTO final.csv');
const csvText = readFileSync(csvPath, 'utf-8');
const records = parse(csvText, { relax_column_count: true, trim: true, skip_empty_lines: true }) as string[][];

let headerRow = 0;
for (let i = 0; i < Math.min(10, records.length); i++) {
  const row = records[i];
  const first = (row[0] || '').toUpperCase();
  const hasProyecto = row.some((c) => (c || '').toUpperCase().includes('PROYECTO'));
  if (first.includes('FECHA') || hasProyecto) {
    headerRow = i;
    break;
  }
}

const headers = records[headerRow].map((h) => (h || '').trim());
const idxFecha = headers.findIndex((h) => /FECHA/i.test(h));
const idxProyecto = headers.findIndex((h) => /PROYECTO/i.test(h));
const idxDescripcion = headers.findIndex((h) => /DESCRIPCI[OÓ]N/i.test(h));
if (idxDescripcion < 0) headers.findIndex((h) => /NOTA|CONCEPTO|OBSERVACI[OÓ]N/i.test(h));
let idxCategoria = headers.findIndex((h) => /CATEGOR[IÍ]A\/DETALLE|^CATEGOR[IÍ]A$/i.test(h));
if (idxCategoria < 0) idxCategoria = headers.findIndex((h) => /^DETALLE$/i.test(h));
const idxDetalle = headers.findIndex((h, i) => i !== idxCategoria && /^DETALLE$/i.test((h || '').trim()));
const idxSubcategoria = headers.findIndex((h) => /SUBCATEGORIA/i.test(h));
const idxImporteContable = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
const idxTipo = headers.findIndex((h) => /TIPO/i.test(h));

const accountColStart = idxImporteContable >= 0 ? idxImporteContable + 1 : 7;
const accountHeaders = headers.slice(accountColStart).filter((h) => h && !/^\s*$/.test(h));

type EntityDelta = { income: number; expense: number; equityCredit: number };
const entityDeltas = new Map<string, EntityDelta>();

function addDelta(entity: string, type: 'income' | 'expense' | 'equityCredit', amount: number) {
  const n = (entity || '').trim() || 'Sin asignar';
  if (!entityDeltas.has(n)) entityDeltas.set(n, { income: 0, expense: 0, equityCredit: 0 });
  const d = entityDeltas.get(n)!;
  if (type === 'income') d.income += amount;
  else if (type === 'expense') d.expense += amount;
  else d.equityCredit += amount;
}

const isTrasladoBancos = (arr: { amount: number }[]) => {
  const totalSum = arr.reduce((s, a) => s + a.amount, 0);
  const totalAbs = arr.reduce((s, a) => s + Math.abs(a.amount), 0);
  return arr.length >= 2 && (Math.abs(totalSum) < 0.02 || (totalAbs > 0 && Math.abs(totalSum) / totalAbs < 0.005));
};

let created = 0;
let skipped = 0;

for (let i = headerRow + 1; i < records.length; i++) {
  const row = records[i];
  const fechaStr = (row[idxFecha] || '').trim();
  let proyectoStr = (row[idxProyecto] || '').trim();
  const tipoStr = (idxTipo >= 0 ? (row[idxTipo] || '') : '').trim();
  const rawCategoria = (idxCategoria >= 0 ? (row[idxCategoria] || '').trim() : '');
  const rawDetalle = (idxDetalle >= 0 ? (row[idxDetalle] || '').trim() : '');
  const descripcion = ((idxDescripcion >= 0 ? (row[idxDescripcion] || '').trim() : '') || rawCategoria).trim() || 'Sin descripción';

  if (proyectoStr === 'TRASLADO') proyectoStr = 'AGENCIA X';
  if (proyectoStr === 'RETIRO HOTMART') proyectoStr = 'HOTMART';

  const tipoForzado = /SALIDA/i.test(tipoStr) && !/CONTABLE/i.test(tipoStr) ? 'gasto'
    : /INGRESO/i.test(tipoStr) && !/CONTABLE/i.test(tipoStr) ? 'ingreso' : null;

  const date = parseSpanishDate(fechaStr);
  if (!date) {
    skipped++;
    continue;
  }

  const accountAmounts: { accountName: string; amount: number }[] = [];
  for (let c = 0; c < accountHeaders.length; c++) {
    const cell = (row[accountColStart + c] || '').trim();
    const amount = parseAmount(cell);
    if (amount == null || amount === 0) continue;
    const accountName = accountHeaders[c];
    if (!accountName) continue;
    accountAmounts.push({ accountName, amount: Math.round(amount * 100) / 100 });
  }

  const isReparto = /REPARTO|REPARTICI[OÓ]N/i.test(rawCategoria) || /REPARTO|REPARTICI[OÓ]N/i.test(descripcion);
  const isFondoLibreReparto = isReparto && proyectoStr.toUpperCase() === 'FONDO LIBRE';

  let rowCreated = 0;

  if (isTrasladoBancos(accountAmounts)) {
    created++;
    rowCreated++;
  } else if (accountAmounts.length === 1) {
    const { amount } = accountAmounts[0];
    const isExpense = tipoForzado === 'gasto' || (tipoForzado == null && amount < 0);
    const amt = Math.abs(amount);

    if (isReparto && !isFondoLibreReparto) {
      // Repartición: débito a Utilidades (no crédito), no resta en balance liquidación
    } else {
      if (isExpense || isFondoLibreReparto) {
        addDelta(proyectoStr, 'expense', amt);
      } else {
        addDelta(proyectoStr, 'income', amt);
      }
    }
    created++;
    rowCreated++;
  } else if (accountAmounts.length > 1) {
    for (const { amount } of accountAmounts) {
      const isExpense = tipoForzado === 'gasto' || (tipoForzado == null && amount < 0);
      const amt = Math.abs(amount);
      if (isReparto && !isFondoLibreReparto) {
        // Repartición: débito a Utilidades, no resta
      } else {
        if (isExpense || isFondoLibreReparto) addDelta(proyectoStr, 'expense', amt);
        else addDelta(proyectoStr, 'income', amt);
      }
      created++;
      rowCreated++;
    }
  }

  if (rowCreated === 0) {
    const importeCell = idxImporteContable >= 0 ? (row[idxImporteContable] || '').trim() : '';
    const amount = parseAmount(importeCell);
    const isSalida = /SALIDA\s*CONTABLE/i.test(tipoStr);
    const isIngreso = /INGRESO\s*CONTABLE/i.test(tipoStr);
    const isMovContable = isSalida || isIngreso;

    if (amount != null && amount !== 0 && (isMovContable || accountHeaders.length > 0)) {
      const amt = Math.round(Math.abs(amount) * 100) / 100;

      if (isMovContable) {
        let entityOrigen = proyectoStr;
        let entityDestino = 'AGENCIA X';
        if (isSalida && i + 1 < records.length) {
          const nextRow = records[i + 1];
          const nextTipo = (idxTipo >= 0 ? (nextRow[idxTipo] || '') : '').trim();
          const nextProyecto = (nextRow[idxProyecto] || '').trim();
          const nextImporte = parseAmount((idxImporteContable >= 0 ? (nextRow[idxImporteContable] || '') : '').trim());
          const nextDesc = (idxDescripcion >= 0 ? (nextRow[idxDescripcion] || '') : '').trim();
          const descSimilar = descripcion.slice(0, 30).toUpperCase() === nextDesc.slice(0, 30).toUpperCase()
            || /UTILIDADES|CORTE/i.test(nextDesc);
          if (/INGRESO\s*CONTABLE/i.test(nextTipo) && nextImporte != null
            && Math.abs(Math.abs(nextImporte) - amt) < 0.02 && descSimilar) {
            entityDestino = nextProyecto || entityDestino;
          }
        }

        if (isIngreso) {
          const sourceMatch = descripcion.match(/\[([^\]]+)\]|UTILIDADES\s+([A-Z0-9\s]+?)(?:\s+15|\s+CORTE|$)|DESDE\s+(FONDO\s+LIBRE)|(FONDO\s+LIBRE)/i)
            || rawCategoria.match(/(?:ADRIANA|GERSSON|INFOPRODUCTOS|GIORGIO|NELLY|VCAPITAL|FONDO)/i);
          entityOrigen = sourceMatch ? (sourceMatch[1] || sourceMatch[2] || sourceMatch[3] || sourceMatch[4] || '').trim().replace(/\s+15.*$/i, '').trim() || 'Sin asignar' : 'Sin asignar';
          entityDestino = proyectoStr;
          addDelta(entityDestino, 'income', amt);
        } else {
          addDelta(entityOrigen, 'equityCredit', amt);
        }
        created++;
      } else {
        const isExpense = tipoForzado === 'gasto' || (tipoForzado == null && amount < 0);
        if (isExpense) addDelta(proyectoStr, 'expense', amt);
        else addDelta(proyectoStr, 'income', amt);
        created++;
      }
    }
  }
}

console.log('\n═══════════════════════════════════════════════════════════════════════════════');
console.log('  SIMULACIÓN COMPLETA DEL IMPORT (réplica exacta de la API)');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');
console.log(`Creados: ${created}, Omitidos: ${skipped}\n`);
console.log('Balance por entidad (liquidación = income - expense - equityCredit):\n');

const rows: { entity: string; income: number; expense: number; equityCredit: number; balance: number }[] = [];
for (const [entity, d] of entityDeltas.entries()) {
  const balance = d.income - d.expense - d.equityCredit;
  rows.push({ entity, ...d, balance });
}
rows.sort((a, b) => b.balance - a.balance);

let totalUsd = 0;
for (const r of rows) {
  console.log(`  ${r.entity.padEnd(25)} | ing: ${String(r.income.toFixed(2)).padStart(12)} | exp: ${String(r.expense.toFixed(2)).padStart(12)} | eqCr: ${String(r.equityCredit.toFixed(2)).padStart(12)} | Balance: ${r.balance.toFixed(2)}`);
  totalUsd += r.balance;
}

console.log('\n' + '─'.repeat(90));
console.log(`  TOTAL USD: ${totalUsd.toFixed(2)}`);
console.log('\nSi el import real da un balance distinto, revisa:');
console.log('  1. Rango de fechas en la vista (debe ser "Todo el tiempo" para ver todo)');
console.log('  2. Que hayas hecho rollback de importaciones anteriores antes de re-importar');
console.log('  3. Que el CSV sea exactamente el mismo (encoding UTF-8)\n');
