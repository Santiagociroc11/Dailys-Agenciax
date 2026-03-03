/**
 * Simula el import y el balance de liquidación para FONDO LIBRE.
 * Muestra qué crea cada fila y el balance resultante.
 *
 * Ejecutar: npx tsx scripts/simular-fondo-libre-import.ts "CUENTAS DINERO PRESUPUESTO final.csv"
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
const idxTipo = headers.findIndex((h) => /TIPO/i.test(h));
const idxDescripcion = headers.findIndex((h) => /DESCRIPCION/i.test(h));
const idxCategoria = headers.findIndex((h) => /CATEGOR[IÍ]A/i.test(h));
const idxDetalle = headers.findIndex((h) => /^DETALLE$/i.test(h));
const idxImporteContable = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
const accountColStart = idxImporteContable >= 0 ? idxImporteContable + 1 : 7;
const accountHeaders = headers.slice(accountColStart).filter((h) => h && !/^\s*$/.test(h));

type Movimiento = {
  linea: number;
  fecha: string;
  desc: string;
  tipo: string;
  cat: string;
  accion: string;
  income: number;
  expense: number;
  equityCredit: number;
  equityDebit: number;
  detalle: string;
};

const movimientos: Movimiento[] = [];
let skipNext = false;

for (let i = headerRow + 1; i < records.length; i++) {
  if (skipNext) {
    skipNext = false;
    continue;
  }
  const row = records[i];
  let proyectoStr = (row[idxProyecto] || '').trim();
  if (proyectoStr === 'TRASLADO') proyectoStr = 'AGENCIA X';
  if (proyectoStr === 'RETIRO HOTMART') proyectoStr = 'HOTMART';
  if (proyectoStr.toUpperCase() !== 'FONDO LIBRE') continue;

  const fechaStr = (row[idxFecha] || '').trim();
  const tipoStr = (idxTipo >= 0 ? (row[idxTipo] || '') : '').trim();
  const rawCategoria = (idxCategoria >= 0 ? (row[idxCategoria] || '').trim() : '');
  const rawDetalle = (idxDetalle >= 0 ? (row[idxDetalle] || '').trim() : '');
  const descripcion = ((idxDescripcion >= 0 ? (row[idxDescripcion] || '').trim() : '') || rawCategoria).trim() || 'Sin descripción';

  const accountAmounts: { accountName: string; amount: number }[] = [];
  for (let c = 0; c < accountHeaders.length; c++) {
    const cell = (row[accountColStart + c] || '').trim();
    const amount = parseAmount(cell);
    if (amount == null || amount === 0) continue;
    accountAmounts.push({ accountName: accountHeaders[c], amount: Math.round(amount * 100) / 100 });
  }

  const totalSum = accountAmounts.reduce((s, a) => s + a.amount, 0);
  const totalAbs = accountAmounts.reduce((s, a) => s + Math.abs(a.amount), 0);
  const isTrasladoBancos = accountAmounts.length >= 2 && (
    Math.abs(totalSum) < 0.02 || (totalAbs > 0 && Math.abs(totalSum) / totalAbs < 0.005)
  );

  const isReparto = /REPARTO|REPARTICI[OÓ]N/i.test(rawCategoria) || /REPARTO|REPARTICI[OÓ]N/i.test(descripcion);
  const isSalida = /SALIDA\s*CONTABLE/i.test(tipoStr);
  const isIngreso = /INGRESO\s*CONTABLE/i.test(tipoStr);
  const isMovContable = isSalida || isIngreso;

  const importeCell = idxImporteContable >= 0 ? (row[idxImporteContable] || '').trim() : '';
  const amountContable = parseAmount(importeCell);

  let accion = '';
  let income = 0;
  let expense = 0;
  let equityCredit = 0;
  let equityDebit = 0;
  let detalle = '';

  if (isTrasladoBancos) {
    accion = 'TRASLADO BANCOS (ignorado)';
    detalle = accountAmounts.map((a) => `${a.accountName}:${a.amount}`).join(', ');
  } else if (accountAmounts.length > 0) {
    const amtTotal = accountAmounts.reduce((s, a) => s + Math.abs(a.amount), 0);
    if (isReparto) {
      accion = 'REPARTICIÓN → equity (débito Utilidades FL)';
      equityDebit = amtTotal;
      detalle = accountAmounts.map((a) => `${a.accountName}:${a.amount}`).join(', ');
    } else {
      accion = 'Cuentas → income/expense según signo';
      if (totalSum < 0) expense = amtTotal;
      else income = amtTotal;
      detalle = accountAmounts.map((a) => `${a.accountName}:${a.amount}`).join(', ');
    }
  } else if (amountContable != null && amountContable !== 0 && isMovContable) {
    const amt = Math.round(Math.abs(amountContable) * 100) / 100;
    if (isIngreso) {
      accion = 'INGRESO CONTABLE → income CORTE UTILIDADES';
      income = amt;
      detalle = `+${amt} (FONDO LIBRE recibe)`;
    } else if (isSalida) {
      if (i + 1 < records.length) {
        const nextRow = records[i + 1];
        const nextTipo = (idxTipo >= 0 ? (nextRow[idxTipo] || '') : '').trim();
        const nextProyecto = (nextRow[idxProyecto] || '').trim();
        const nextImporte = parseAmount((idxImporteContable >= 0 ? (nextRow[idxImporteContable] || '') : '').trim());
        const nextDesc = (idxDescripcion >= 0 ? (nextRow[idxDescripcion] || '') : '').trim();
        const descSimilar = descripcion.slice(0, 30).toUpperCase() === nextDesc.slice(0, 30).toUpperCase()
          || /UTILIDADES|CORTE/i.test(nextDesc);
        if (/INGRESO\s*CONTABLE/i.test(nextTipo) && nextImporte != null
          && Math.abs(Math.abs(nextImporte) - amt) < 0.02 && descSimilar) {
          accion = `SALIDA CONTABLE → equity crédito FL (envía a ${nextProyecto})`;
          equityCredit = amt;
          skipNext = true;
          detalle = `-${amt} (FONDO LIBRE envía a ${nextProyecto})`;
        }
      }
      if (!accion) {
        accion = 'SALIDA CONTABLE → equity crédito FL (envía a AGENCIA X)';
        equityCredit = amt;
        detalle = `-${amt} (FONDO LIBRE envía)`;
      }
    }
  } else if (amountContable != null && amountContable !== 0) {
    accion = 'IMPORTE CONTABLE sin SALIDA/INGRESO → income/expense';
    const amt = Math.abs(amountContable);
    if (amountContable > 0) income = amt;
    else expense = amt;
    detalle = `importe: ${amountContable}`;
  }

  if (accion) {
    movimientos.push({
      linea: i + 1,
      fecha: fechaStr,
      desc: descripcion.slice(0, 45),
      tipo: tipoStr,
      cat: rawCategoria,
      accion,
      income,
      expense,
      equityCredit,
      equityDebit,
      detalle,
    });
  }
}

// Filtro de fechas (como en la vista: 2025-01-01 — 2026-03-02)
const FILTER_START = new Date('2025-01-01');
const FILTER_END = new Date('2026-03-02');

// Resumen
let totalIncome = 0;
let totalExpense = 0;
let totalEquityCredit = 0;
let totalEquityDebit = 0;
let totalIncomeFiltrado = 0;
let totalExpenseFiltrado = 0;
let totalEquityCreditFiltrado = 0;
let totalEquityDebitFiltrado = 0;

console.log('\n═══════════════════════════════════════════════════════════════════════════════');
console.log('  FONDO LIBRE - Simulación de import y balance liquidación');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');

console.log('Fórmula balance liquidación: income - expense - equity_credits');
console.log('(Los equity_debits NO se restan en el balance actual)\n');

console.log('--- Todas las filas FONDO LIBRE ---\n');

for (const m of movimientos) {
  const fechaParsed = parseSpanishDate(m.fecha);
  const enRango = fechaParsed && fechaParsed >= FILTER_START && fechaParsed <= FILTER_END;
  totalIncome += m.income;
  totalExpense += m.expense;
  totalEquityCredit += m.equityCredit;
  totalEquityDebit += m.equityDebit;
  if (enRango) {
    totalIncomeFiltrado += m.income;
    totalExpenseFiltrado += m.expense;
    totalEquityCreditFiltrado += m.equityCredit;
    totalEquityDebitFiltrado += m.equityDebit;
  }

  const parts: string[] = [];
  if (m.income) parts.push(`+ing:${m.income}`);
  if (m.expense) parts.push(`-exp:${m.expense}`);
  if (m.equityCredit) parts.push(`-eqCr:${m.equityCredit}`);
  if (m.equityDebit) parts.push(`eqDb:${m.equityDebit}(no resta)`);

  console.log(`L${String(m.linea).padStart(4)} ${m.fecha.slice(0, 22).padEnd(24)} ${m.accion.slice(0, 50).padEnd(52)} | ${parts.join(' ')}`);
  if (m.detalle) console.log(`      ${m.desc.slice(0, 60)} | ${m.detalle}`);
}

console.log('\n--- Totales ---');
console.log(`  Income (CORTE UTILIDADES):     $${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Expense (actualmente 0):       $${totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Equity créditos (reponer):     $${totalEquityCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Equity débitos (repartir):    $${totalEquityDebit.toLocaleString('en-US', { minimumFractionDigits: 2 })} (NO se restan)`);

const balanceActual = totalIncome - totalExpense - totalEquityCredit;
console.log(`\n  Balance actual (equity):       $${balanceActual.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  (= income - expense - equity_credits)`);

const balanceSiExpense = totalIncome - totalEquityDebit - totalEquityCredit;
console.log(`  Si REPARTICIÓN fuera expense:  $${balanceSiExpense.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

console.log('\n--- Totales FILTRADO 2025-01-01 a 2026-03-02 (como vista liquidación) ---');
console.log(`  Income:     $${totalIncomeFiltrado.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Repartir:   $${totalEquityDebitFiltrado.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Reponer:    $${totalEquityCreditFiltrado.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
const balanceFiltradoEquity = totalIncomeFiltrado - totalEquityCreditFiltrado;
const balanceFiltradoExpense = totalIncomeFiltrado - totalEquityDebitFiltrado - totalEquityCreditFiltrado;
console.log(`  Balance (equity):   $${balanceFiltradoEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Balance (expense):  $${balanceFiltradoExpense.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

console.log('\n--- Diagnóstico ---');
console.log(`  • Con equity (actual): repartir no reduce → balance alto`);
console.log(`  • Con expense: repartir reduce → balance ≈ ${balanceFiltradoExpense.toFixed(0)}`);
console.log(`  • Excel muestra ~-28. Diferencia con simulación: ${(balanceFiltradoExpense - (-28)).toFixed(0)}`);
console.log(`  • Posibles causas: moneda COP vs USD (import usa amt>100k→COP), duplicados, o lógica Excel distinta`);
console.log('');
