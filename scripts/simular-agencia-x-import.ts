/**
 * Simula el import y el balance de liquidación para AGENCIA X.
 * Replica la lógica del import para predecir el balance.
 *
 * Ejecutar: npx tsx scripts/simular-agencia-x-import.ts "CUENTAS DINERO PRESUPUESTO final.csv"
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

const INGRESO_CATEGORIES = /INGRESOS\s*PROYECTO|INGRESO|COBRO|VENTAS|SALDOS\s*INICIALES|CORTE\s*UTILIDADES/i;
const GASTO_CATEGORIES = /GASTOS|SOFTWARE|EDUCACION|CURSOS|REPARTICI[OÓ]N|NOMINA|TRASLADOS|HOSTINGUER|LEGALES|ADQUISICIONES|VIAJES|DOMINIOS|PAGOS\s*PENDIENTES|CONTRATOS|DEUDAS/i;
const isMovContable = (t: string) => /SALIDA\s*CONTABLE|INGRESO\s*CONTABLE/i.test(t);
const isTrasladoBancos = (arr: { amount: number }[]) =>
  arr.length >= 2 && (Math.abs(arr.reduce((s, a) => s + a.amount, 0)) < 0.02
    || (arr.reduce((s, a) => s + Math.abs(a.amount), 0) > 0 && Math.abs(arr.reduce((s, a) => s + a.amount, 0)) / arr.reduce((s, a) => s + Math.abs(a.amount), 0) < 0.005));

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
const idxCategoria = headers.findIndex((h) => /CATEGOR[IÍ]A/i.test(h));
const idxSubcategoria = headers.findIndex((h) => /SUBCATEGORIA/i.test(h));
const idxImporteContable = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
const accountColStart = idxImporteContable >= 0 ? idxImporteContable + 1 : 7;
const accountHeaders = headers.slice(accountColStart).filter((h) => h && !/^\s*$/.test(h));

const FILTER_START = new Date('2025-01-01');
const FILTER_END = new Date('2026-03-02');

type Mov = { linea: number; fecha: string; desc: string; tipo: string; cat: string; income: number; expense: number; equityCredit: number; accion: string };

const movimientos: Mov[] = [];
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
  if (proyectoStr !== 'AGENCIA X') continue;

  const fechaStr = (row[idxFecha] || '').trim();
  const tipoStr = (idxTipo >= 0 ? (row[idxTipo] || '') : '').trim();
  const categoria = (idxCategoria >= 0 ? (row[idxCategoria] || '').trim() : '');
  const subcategoria = (idxSubcategoria >= 0 ? (row[idxSubcategoria] || '').trim() : '');
  const cat = subcategoria || categoria || '';
  const descripcion = (row[3] || '').trim() || cat;

  const accountAmounts: { accountName: string; amount: number }[] = [];
  for (let c = 0; c < accountHeaders.length; c++) {
    const cell = (row[accountColStart + c] || '').trim();
    const amount = parseAmount(cell);
    if (amount == null || amount === 0) continue;
    accountAmounts.push({ accountName: accountHeaders[c], amount: Math.round(amount * 100) / 100 });
  }

  let income = 0;
  let expense = 0;
  let equityCredit = 0;
  let accion = '';

  if (accountAmounts.length > 0) {
    if (isTrasladoBancos(accountAmounts)) {
      accion = 'Traslado bancos (ignorado)';
    } else {
      const monto = accountAmounts.reduce((s, a) => s + a.amount, 0);
      const isReparto = /REPARTO|REPARTICI[OÓ]N/i.test(cat);
      if (isReparto) {
        accion = 'REPARTICIÓN → equity débito (no resta en balance)';
        equityCredit = 0;
      } else if (monto > 0) {
        accion = 'Ingreso (cuentas)';
        income = Math.abs(monto);
      } else {
        accion = 'Gasto (cuentas)';
        expense = Math.abs(monto);
      }
    }
  } else {
    const amountContable = parseAmount((idxImporteContable >= 0 ? (row[idxImporteContable] || '') : '').trim());
    if (amountContable == null || amountContable === 0) continue;

    const esCorteUtilidades = /CORTE\s*UTILIDADES/i.test(cat);
    // Con el fix: ya NO se salta la fila INGRESO cuando viene de SALIDA FONDO LIBRE.
    // Siempre se crea income para el receptor (AGENCIA X).
    if (isMovContable(tipoStr) && !esCorteUtilidades) {
      accion = 'Mov. contable (no afecta P&G)';
    } else if (/INGRESO\s*CONTABLE/i.test(tipoStr)) {
      accion = 'INGRESO CONTABLE → income CORTE UTILIDADES';
      income = Math.abs(amountContable);
    } else if (/SALIDA\s*CONTABLE/i.test(tipoStr)) {
      accion = 'SALIDA CONTABLE → equity crédito AX';
      equityCredit = Math.abs(amountContable);
    } else {
      if (amountContable > 0) {
        accion = 'Ingreso (importe contable)';
        income = Math.abs(amountContable);
      } else {
        accion = 'Gasto (importe contable)';
        expense = Math.abs(amountContable);
      }
    }
  }

  if (accion && accion !== 'Traslado bancos (ignorado)' && accion !== 'Mov. contable (no afecta P&G)') {
    movimientos.push({ linea: i + 1, fecha: fechaStr, desc: descripcion.slice(0, 40), tipo: tipoStr, cat, income, expense, equityCredit, accion });
  }

}

let totalIncome = 0;
let totalExpense = 0;
let totalEquityCredit = 0;
let totalIncomeF = 0;
let totalExpenseF = 0;
let totalEquityCreditF = 0;

console.log('\n═══════════════════════════════════════════════════════════════════════════════');
console.log('  AGENCIA X - Simulación de import y balance liquidación');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');
console.log('Fórmula: income - expense - equity_credits\n');
console.log('--- Filas AGENCIA X (primeras 50) ---\n');

for (const m of movimientos) {
  const fechaParsed = parseSpanishDate(m.fecha);
  const enRango = fechaParsed && fechaParsed >= FILTER_START && fechaParsed <= FILTER_END;

  totalIncome += m.income;
  totalExpense += m.expense;
  totalEquityCredit += m.equityCredit;
  if (enRango) {
    totalIncomeF += m.income;
    totalExpenseF += m.expense;
    totalEquityCreditF += m.equityCredit;
  }

  const parts: string[] = [];
  if (m.income) parts.push(`+ing:${m.income}`);
  if (m.expense) parts.push(`-exp:${m.expense}`);
  if (m.equityCredit) parts.push(`-eqCr:${m.equityCredit}`);

  if (movimientos.indexOf(m) < 50) {
    console.log(`L${String(m.linea).padStart(4)} ${m.fecha.slice(0, 22).padEnd(24)} ${m.accion.slice(0, 45).padEnd(47)} | ${parts.join(' ') || '-'}`);
  }
}

const balance = totalIncome - totalExpense - totalEquityCredit;
const balanceF = totalIncomeF - totalExpenseF - totalEquityCreditF;

console.log('\n--- Totales (TODOS los años) ---');
console.log(`  Income:     $${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Expense:    $${totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Eq. créd.:  $${totalEquityCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Balance:    $${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

console.log('\n--- Totales FILTRADO 2025-01-01 a 2026-03-02 ---');
console.log(`  Income:     $${totalIncomeF.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Expense:    $${totalExpenseF.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Eq. créd.:  $${totalEquityCreditF.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Balance:    $${balanceF.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

console.log('\n--- Diagnóstico AGENCIA X ---');
let ingresoContableAX = 0;
for (let i = headerRow + 1; i < records.length; i++) {
  const row = records[i];
  const proy = (row[idxProyecto] || '').trim();
  const tipo = (idxTipo >= 0 ? (row[idxTipo] || '') : '').trim();
  if (proy !== 'AGENCIA X') continue;
  if (!/INGRESO\s*CONTABLE/i.test(tipo)) continue;
  const amt = parseAmount((idxImporteContable >= 0 ? (row[idxImporteContable] || '') : '').trim());
  if (amt != null && amt > 0) ingresoContableAX += amt;
}
console.log(`  INGRESO CONTABLE recibido (traslados FONDO LIBRE→AX): $${ingresoContableAX.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log('  En el import actual: se SALTA la fila INGRESO AX (par con SALIDA FL) → NO crea income.');
console.log(`  Si SÍ se creara income: Balance filtrado sería $${(balanceF + ingresoContableAX).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log('  comparar-agencia-x-csv.ts (Excel): Balance 2025+2026 ≈ -13,714 (incluye CORTE UTILIDADES como gasto)');
console.log('  Diferencia ~7,800: el Excel cuenta INGRESO CONTABLE como ingreso; el import no.\n');
