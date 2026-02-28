/**
 * Simula el script de importación CSV y compara totales por cuenta con los esperados.
 * Ejecutar: npx tsx scripts/simulate-import-csv.ts
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

const csvPath = join(process.cwd(), 'csvejemplo.csv');
const csvText = readFileSync(csvPath, 'utf-8');

const records = parse(csvText, { relax_column_count: true, trim: true, skip_empty_lines: true }) as string[][];

// Buscar fila de encabezado
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
const idxSubcategoria = headers.findIndex((h) => /SUBCATEGORIA/i.test(h));
let idxDescripcion = headers.findIndex((h) => /DESCRIPCI[OÓ]N/i.test(h));
if (idxDescripcion < 0) idxDescripcion = headers.findIndex((h) => /NOTA|CONCEPTO|OBSERVACI[OÓ]N/i.test(h));
let idxCategoria = headers.findIndex((h) => /CATEGOR[IÍ]A\/DETALLE/i.test(h));
if (idxCategoria < 0) idxCategoria = headers.findIndex((h) => /^DETALLE$/i.test(h));
if (idxCategoria < 0) idxCategoria = headers.findIndex((h) => /^CATEGOR[IÍ]A$/i.test(h));
const idxTipo = headers.findIndex((h) => /TIPO/i.test(h));
const idxImporteContable = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
const accountColStart = idxImporteContable >= 0 ? idxImporteContable + 1 : 7;
const accountHeaders = headers.slice(accountColStart).filter((h) => h && !/^\s*$/.test(h));

// Totales esperados (de la fila TOTALES del CSV / imagen)
const expected: Record<string, number> = {
  'CUENTA JUAN CARLOS': 7312.0,
  'PAYO SANTIAGO': 0,
  'BANCOLOMBIA': 0,
  'HOTMART JSD': 22257.7,
  'PAYO JSD': 52913.3,
  'PAYO FRAN': 6.2,
  'JERWIN PERÚ': 0,
  'BINANCE': 57.4,
};

// Simular importación: acumular montos por cuenta
const totals: Record<string, number> = {};
for (const name of accountHeaders) {
  totals[name] = 0;
}

// Track entidades y descripciones
const entities = new Set<string>();
const descripcionesProblema: { linea: number; proyecto: string; desc: string; motivo: string }[] = [];
const entityType = (n: string) =>
  /AGENCIA\s*X/i.test(n) ? 'agency' : /UTILIDADES|HOTMART|EQUIPO|NA/i.test(n) ? 'internal' : 'project';

let created = 0;
let skipped = 0;

for (let i = headerRow + 1; i < records.length; i++) {
  const row = records[i];
  const fechaStr = (row[idxFecha] || '').trim();
  let proyectoStr = (row[idxProyecto] || '').trim();
  const tipoStr = (idxTipo >= 0 ? (row[idxTipo] || '') : '').trim();
  if (proyectoStr === 'TRASLADO') proyectoStr = 'AGENCIA X';
  if (proyectoStr === 'RETIRO HOTMART') proyectoStr = 'HOTMART';

  const date = parseSpanishDate(fechaStr);
  if (!date) {
    skipped++;
    continue;
  }

  const descRaw = ((row[idxCategoria] ?? '') || (row[idxDescripcion] ?? '')).trim() || 'Sin descripción';
  if (descRaw === 'Sin descripción') {
    const subcat = (row[idxSubcategoria] ?? '').trim();
    const motivo = subcat ? `DESCRIPCION y CATEGORIA vacíos (SUBCATEGORIA="${subcat}" no se usa)` : 'DESCRIPCION y CATEGORIA vacíos';
    descripcionesProblema.push({ linea: i + 1, proyecto: proyectoStr, desc: subcat, motivo });
  }

  if (proyectoStr && proyectoStr !== 'NA') {
    entities.add(proyectoStr);
  }

  // NA = entity null, pero igual creamos transacciones (el import real puede fallar si entity es required)
  let rowCreated = 0;

  for (let c = 0; c < accountHeaders.length; c++) {
    const cell = (row[accountColStart + c] || '').trim();
    const amount = parseAmount(cell);
    if (amount == null || amount === 0) continue;

    const accountName = accountHeaders[c];
    if (!accountName) continue;

    totals[accountName] = (totals[accountName] ?? 0) + Math.round(amount * 100) / 100;
    created++;
    rowCreated++;
  }

  if (rowCreated === 0) {
    const importeCell = idxImporteContable >= 0 ? (row[idxImporteContable] || '').trim() : '';
    const amount = parseAmount(importeCell);
    const isMovContable = /SALIDA\s*CONTABLE|INGRESO\s*CONTABLE/i.test(tipoStr);
    if (amount != null && amount !== 0 && (isMovContable || accountHeaders.length > 0)) {
      const firstAccount = isMovContable ? 'Mov. Contable' : accountHeaders[0];
      totals[firstAccount] = (totals[firstAccount] ?? 0) + Math.round(amount * 100) / 100;
      created++;
    }
  }
}

console.log('=== SIMULACIÓN DE IMPORTACIÓN CSV ===\n');
console.log('Transacciones creadas:', created);
console.log('Filas omitidas (fecha inválida):', skipped);

console.log('\n--- ENTIDADES QUE SE CREARÍAN ---');
const entityList = [...entities].sort();
entityList.forEach((e) => {
  const t = entityType(e);
  const flag = e === 'NA' || e === 'TRASLADO' || /RETIRO HOTMART/i.test(e) ? ' ⚠' : '';
  console.log(`  ${e} (${t})${flag}`);
});
console.log(`  Total: ${entityList.length} entidades únicas`);

if (descripcionesProblema.length > 0) {
  console.log('\n--- DESCRIPCIONES PROBLEMÁTICAS (quedarían "Sin descripción") ---');
  descripcionesProblema.slice(0, 15).forEach((d) => {
    console.log(`  L${d.linea} | ${d.proyecto || '(vacío)'} | ${d.motivo}`);
  });
  if (descripcionesProblema.length > 15) console.log(`  ... y ${descripcionesProblema.length - 15} más`);
}

console.log('\n--- TOTALES POR CUENTA (simulado) ---\n');

const diff: { account: string; simulado: number; esperado: number; diff: number }[] = [];

for (const name of accountHeaders) {
  const sim = Math.round((totals[name] ?? 0) * 100) / 100;
  const esp = expected[name] ?? 0;
  const d = Math.round((sim - esp) * 100) / 100;
  diff.push({ account: name, simulado: sim, esperado: esp, diff: d });
  const status = d === 0 ? '✓' : '✗';
  console.log(`${status} ${name}: $${sim.toLocaleString()} (esperado: $${esp.toLocaleString()}) ${d !== 0 ? `[diff: ${d > 0 ? '+' : ''}${d}]` : ''}`);
}

const hasErrors = diff.some((d) => d.diff !== 0);
console.log('\n--- RESUMEN ---');
if (hasErrors) {
  console.log('⚠️  Hay diferencias entre lo simulado y lo esperado.');
  console.log('\nPosibles causas:');
  console.log('- Filas con PROYECTO=NA se omiten (entity_id null puede fallar en DB)');
  console.log('- Fallback: montos solo en IMPORTE CONTABLE van a primera cuenta (CUENTA JUAN CARLOS)');
  console.log('- Movimientos contables (SALIDA/INGRESO) sin cuentas usan fallback');
  console.log('- Filas vacías o con fecha inválida se omiten');
  console.log('- Redondeo: Excel puede sumar y redondear distinto que suma de redondeos');
} else {
  console.log('✓ Todos los totales coinciden con lo esperado.');
}

// Debug: buscar transacciones PAYO JSD con valores cercanos a 1.5
if (diff.find((d) => d.account === 'PAYO JSD' && d.diff !== 0)) {
  console.log('\n--- DEBUG: Filas con monto en PAYO JSD ---');
  let payoJsdSum = 0;
  const payoJsdIdx = accountHeaders.indexOf('PAYO JSD');
  for (let i = headerRow + 1; i < records.length; i++) {
    const row = records[i];
    const cell = (row[accountColStart + payoJsdIdx] || '').trim();
    const amount = parseAmount(cell);
    if (amount != null && amount !== 0) {
      payoJsdSum += amount;
      if (Math.abs(amount) <= 2) console.log(`  L${i + 1}: ${amount} | ${(row[idxFecha] || '').slice(0, 25)} | ${(row[idxProyecto] || '').slice(0, 15)}`);
    }
  }
  console.log('  Suma directa PAYO JSD (sin redondear):', payoJsdSum.toFixed(2));
}
