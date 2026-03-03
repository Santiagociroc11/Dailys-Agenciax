/**
 * Compara el balance de AGENCIA X entre el CSV y lo que el sistema calcula.
 * Ejecutar: npx tsx scripts/comparar-agencia-x-csv.ts "CUENTAS DINERO PRESUPUESTO final.csv"
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
const idxCategoria = headers.findIndex((h) => /CATEGOR[IÍ]A\/DETALLE|^CATEGOR[IÍ]A$/i.test(h));
if (idxCategoria < 0) headers.findIndex((h) => /^DETALLE$/i.test(h));
const idxSubcategoria = headers.findIndex((h) => /SUBCATEGORIA/i.test(h));
const idxTipo = headers.findIndex((h) => /TIPO/i.test(h));
const idxImporteContable = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
const accountColStart = idxImporteContable >= 0 ? idxImporteContable + 1 : 7;
const accountHeaders = headers.slice(accountColStart).filter((h) => h && !/^\s*$/.test(h));

// Categorías que son INGRESO (aumentan el resultado)
const INGRESO_CATEGORIES = /INGRESOS\s*PROYECTO|INGRESO|COBRO|VENTAS|SALDOS\s*INICIALES/i;

// Categorías que son GASTO (reducen el resultado)
const GASTO_CATEGORIES = /GASTOS|SOFTWARE|EDUCACION|CURSOS|REPARTICI[OÓ]N|NOMINA|TRASLADOS|HOSTINGUER|LEGALES|ADQUISICIONES|VIAJES|DOMINIOS|PAGOS\s*PENDIENTES|CONTRATOS|DEUDAS/i;

// SALIDA/INGRESO CONTABLE = traslado patrimonio, NO afecta P&G (ingresos-gastos)
const isMovContable = (t: string) => /SALIDA\s*CONTABLE|INGRESO\s*CONTABLE/i.test(t);

// Traslados entre bancos = no afecta P&G (solo mueve dinero)
const isTrasladoBancos = (accountAmounts: { amount: number }[]) =>
  accountAmounts.length >= 2 &&
  Math.abs(accountAmounts.reduce((s, a) => s + a.amount, 0)) < 0.02;

let totalIngresos = 0;
let totalGastos = 0;
let totalIngresos2025_2026 = 0;
let totalGastos2025_2026 = 0;
let totalSoloImporteContable2025_2026 = 0; // Variante: suma directa de IMPORTE CONTABLE (como tabla dinámica)
const gastosPorCat2025_2026: Record<string, number> = {};
const detalles: Array<{ linea: number; fecha: string; desc: string; cat: string; tipo: string; monto: number; motivo: string }> = [];

for (let i = headerRow + 1; i < records.length; i++) {
  const row = records[i];
  const proyectoStr = (row[idxProyecto] || '').trim().replace(/^TRASLADO$/i, 'AGENCIA X').replace(/^RETIRO HOTMART$/i, 'HOTMART');
  if (proyectoStr !== 'AGENCIA X') continue;

  const fechaStr = (row[idxFecha] || '').trim();
  const tipoStr = (idxTipo >= 0 ? (row[idxTipo] || '') : '').trim();
  const categoria = (idxCategoria >= 0 ? (row[idxCategoria] || '').trim() : '');
  const subcategoria = (idxSubcategoria >= 0 ? (row[idxSubcategoria] || '').trim() : '');
  const cat = subcategoria || categoria || '';

  const accountAmounts: { accountName: string; amount: number }[] = [];
  for (let c = 0; c < accountHeaders.length; c++) {
    const cell = (row[accountColStart + c] || '').trim();
    const amount = parseAmount(cell);
    if (amount == null || amount === 0) continue;
    accountAmounts.push({ accountName: accountHeaders[c], amount: Math.round(amount * 100) / 100 });
  }

  let monto = 0;
  let motivo = '';

  if (accountAmounts.length > 0) {
    if (isTrasladoBancos(accountAmounts)) {
      motivo = 'traslado bancos (ignorado)';
      continue;
    }
    monto = accountAmounts.reduce((s, a) => s + a.amount, 0);
    motivo = `cuentas: ${accountAmounts.map((a) => `${a.accountName}:${a.amount}`).join(', ')}`;
  } else {
    const importeCell = idxImporteContable >= 0 ? (row[idxImporteContable] || '').trim() : '';
    const amount = parseAmount(importeCell);
    if (amount == null || amount === 0) continue;
    monto = Math.round(Math.abs(amount) * 100) / 100 * (amount < 0 ? -1 : 1);
    motivo = `importe contable: ${monto}`;
  }

  // Excel incluye CORTE UTILIDADES en el balance; excluimos otros mov. contables
  const esCorteUtilidades = /CORTE\s*UTILIDADES/i.test(cat);
  if (isMovContable(tipoStr) && !esCorteUtilidades) {
    motivo = `mov. contable (SALIDA/INGRESO - no afecta P&G)`;
    continue; // No suma a ingresos ni gastos
  }

  const fechaParsed = parseSpanishDate(fechaStr);
  const year = fechaParsed ? fechaParsed.getFullYear() : 0;
  const en2025o2026 = year === 2025 || year === 2026;

  // Variante Excel "suma todo": IMPORTE CONTABLE + todas las cuentas (traslados bancos ya se omitieron)
  if (en2025o2026) {
    let sumaTodo = 0;
    if (idxImporteContable >= 0) {
      const ic = parseAmount((row[idxImporteContable] || '').trim());
      if (ic != null && ic !== 0) sumaTodo += ic;
    }
    for (let c = 0; c < accountHeaders.length; c++) {
      const amt = parseAmount((row[accountColStart + c] || '').trim());
      if (amt != null && amt !== 0) sumaTodo += amt;
    }
    totalSoloImporteContable2025_2026 += sumaTodo;
  }

  const isIngreso = INGRESO_CATEGORIES.test(cat) && monto > 0;
  const isGasto = GASTO_CATEGORIES.test(cat) || monto < 0;

  if (isIngreso || (monto > 0 && !isGasto)) {
    totalIngresos += Math.abs(monto);
    if (en2025o2026) totalIngresos2025_2026 += Math.abs(monto);
    detalles.push({ linea: i + 1, fecha: fechaStr, desc: (row[3] || '').slice(0, 40), cat, tipo: tipoStr, monto: Math.abs(monto), motivo: 'ingreso' });
  } else {
    totalGastos += Math.abs(monto);
    if (en2025o2026) {
      totalGastos2025_2026 += Math.abs(monto);
      const key = cat || '(sin categoría)';
      gastosPorCat2025_2026[key] = (gastosPorCat2025_2026[key] || 0) + Math.abs(monto);
    }
    detalles.push({ linea: i + 1, fecha: fechaStr, desc: (row[3] || '').slice(0, 40), cat, tipo: tipoStr, monto: -Math.abs(monto), motivo: 'gasto' });
  }
}

const balanceCsv = totalIngresos - totalGastos;

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  AGENCIA X - Balance desde CSV (ingresos - gastos)');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`  Total ingresos (desde CSV):  $${totalIngresos.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Total gastos (desde CSV):     $${totalGastos.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Balance CSV (ing - gast):    $${balanceCsv.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log('\n  (Los movimientos SALIDA/INGRESO CONTABLE no se incluyen - son patrimonio)\n');

const balance2025_2026 = totalIngresos2025_2026 - totalGastos2025_2026;
console.log('--- Solo 2025 + 2026 (como tabla dinámica Excel) ---');
console.log(`  Ingresos 2025+2026:  $${totalIngresos2025_2026.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Gastos 2025+2026:    $${totalGastos2025_2026.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  Balance 2025+2026:   $${balance2025_2026.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  [Excel suma todo] IMPORTE CONTABLE + cuentas: $${totalSoloImporteContable2025_2026.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log('\n  Gastos por categoría (2025+2026):');
const catsSorted = Object.entries(gastosPorCat2025_2026).sort((a, b) => b[1] - a[1]);
catsSorted.forEach(([cat, val]) => console.log(`    ${cat.slice(0, 35).padEnd(36)} $${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`));
console.log('');

console.log('--- Primeras 30 líneas que afectan el balance ---\n');
detalles.slice(0, 30).forEach((d) => {
  const sign = d.monto >= 0 ? '+' : '';
  console.log(`  L${d.linea} ${d.fecha.slice(0, 20).padEnd(22)} ${sign}${d.monto.toFixed(2).padStart(12)} ${d.motivo.padEnd(8)} | ${d.cat.slice(0, 25)}`);
});

// INGRESO CONTABLE recibidos por AGENCIA X (traslados de otros proyectos)
let ingresoContableRecibido = 0;
for (let i = headerRow + 1; i < records.length; i++) {
  const row = records[i];
  const proyectoStr = (row[idxProyecto] || '').trim();
  const tipoStr = (idxTipo >= 0 ? (row[idxTipo] || '') : '').trim();
  if (proyectoStr !== 'AGENCIA X') continue;
  if (!/INGRESO\s*CONTABLE/i.test(tipoStr)) continue;
  const importeCell = idxImporteContable >= 0 ? (row[idxImporteContable] || '').trim() : '';
  const amount = parseAmount(importeCell);
  if (amount != null && amount > 0) ingresoContableRecibido += amount;
}
console.log('--- INGRESO CONTABLE recibido por AGENCIA X (traslados de otros proyectos) ---');
console.log(`  Total: $${ingresoContableRecibido.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log('  (Estos NO son ingresos operativos - son movimientos de patrimonio. No afectan el balance P&G)\n');

console.log('--- Si el Excel muestra ~190k en negativo, podría ser ---');
console.log(`  • Balance P&G (ing-gast) desde CSV: $${balanceCsv.toLocaleString()}`);
console.log(`  • Si el Excel resta los INGRESOS CONTABLE recibidos: $${(balanceCsv - ingresoContableRecibido).toLocaleString()}`);
console.log(`  • O si el Excel usa otra fórmula/estructura\n`);

console.log('--- Posibles causas de diferencia con el sistema ---');
console.log('  1. Filas con PROYECTO vacío o distinto que se asignaron a AGENCIA X en el import');
console.log('  2. Categorías mapeadas distinto (ej. "SOFTWARE Y SUSCRIPCIONES" vs subcategoría)');
console.log('  3. Filas omitidas por fecha inválida o sin monto');
console.log('  4. Traslados entre bancos: en CSV no afectan P&G; en sistema pueden generar líneas');
console.log('  5. Duplicados en import (ej. GERSSON L8 que corregimos)');
console.log('  6. Moneda: montos > 100k se tratan como COP en el import');
console.log('  7. El Excel puede tener fórmulas/totales que incluyen otras vistas\n');
