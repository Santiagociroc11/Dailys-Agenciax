/**
 * Analiza el CSV interactivo para encontrar categorías/detalles inconsistentes
 */
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

const csvPath = process.argv[2] || 'CUENTAS DINERO PRESUPUESTO final_interactivo.csv';
const csv = readFileSync(csvPath, 'utf-8');
const records = parse(csv, { relax_column_count: true, trim: true, skip_empty_lines: true });

const headers = records[0];
const idxCat = headers.findIndex((h: string) => /CATEGORIA/i.test(h || ''));
const idxDet = headers.findIndex((h: string, i: number) => i > idxCat && /^DETALLE$/i.test(h || ''));

if (idxCat < 0 || idxDet < 0) {
  console.error('No se encontraron columnas CATEGORIA y DETALLE');
  process.exit(1);
}

// Contar combinaciones Cat | Detalle
const combos: Record<string, number> = {};
const soloCategorias: Record<string, Set<string>> = {};

for (let i = 1; i < records.length; i++) {
  const row = records[i];
  const cat = (row[idxCat] || '').trim();
  const det = (row[idxDet] || '').trim();
  if (!cat && !det) continue;
  const key = `${cat} | ${det}`;
  combos[key] = (combos[key] || 0) + 1;
  if (!soloCategorias[cat]) soloCategorias[cat] = new Set();
  soloCategorias[cat].add(det);
}

const entries = Object.entries(combos).sort((a, b) => b[1] - a[1]);
const huerfanas = entries.filter(([, c]) => c === 1).map(([k]) => k);

// Índices para contexto
const idxFecha = headers.findIndex((h: string) => /FECHA/i.test(h || ''));
const idxProy = headers.findIndex((h: string) => /PROYECTO/i.test(h || ''));
const idxDesc = headers.findIndex((h: string) => /DESCRIPCION/i.test(h || ''));
const idxImporte = headers.findIndex((h: string) => /IMPORTE\s*CONTABLE/i.test(h || ''));

// Filas huérfanas con contexto completo
const filasHuerfanas: { key: string; row: string[]; rowNum: number }[] = [];
for (let i = 1; i < records.length; i++) {
  const row = records[i];
  const cat = (row[idxCat] || '').trim();
  const det = (row[idxDet] || '').trim();
  const key = `${cat} | ${det}`;
  if (combos[key] === 1) {
    filasHuerfanas.push({ key, row, rowNum: i + 1 });
  }
}

console.log('Total combinaciones Cat|Detalle únicas:', entries.length);
console.log('Huérfanas (1 sola transacción):', huerfanas.length);
console.log('\n--- Todas las combinaciones (ordenadas por frecuencia) ---\n');
entries.forEach(([k, c]) => console.log(`${c.toString().padStart(5)}  ${k}`));

// Buscar similitudes: categorías con mismo nombre pero distinta capitalización
console.log('\n\n--- POSIBLES INCONSISTENCIAS ---\n');

const catsNorm = new Map<string, string[]>();
for (const cat of Object.keys(soloCategorias)) {
  const n = cat.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!catsNorm.has(n)) catsNorm.set(n, []);
  if (!catsNorm.get(n)!.includes(cat)) catsNorm.get(n)!.push(cat);
}
const duplicadosCat = [...catsNorm.entries()].filter(([, v]) => v.length > 1);
if (duplicadosCat.length > 0) {
  console.log('Categorías con variantes (mayúsculas/minúsculas):');
  duplicadosCat.forEach(([norm, v]) => console.log('  ', v.join('  <->  ')));
}

// Detalles que parecen lo mismo
const detsNorm = new Map<string, string[]>();
for (const [, dets] of Object.entries(soloCategorias)) {
  for (const d of dets) {
    const n = d.toLowerCase().trim();
    if (!detsNorm.has(n)) detsNorm.set(n, []);
    if (!detsNorm.get(n)!.includes(d)) detsNorm.get(n)!.push(d);
  }
}
const duplicadosDet = [...detsNorm.entries()].filter(([, v]) => v.length > 1);
if (duplicadosDet.length > 0) {
  console.log('\nDetalles con variantes (mayúsculas/minúsculas):');
  duplicadosDet.slice(0, 30).forEach(([norm, v]) => console.log('  ', v.join('  <->  ')));
}

// Typos comunes
const typos: [string, string][] = [
  ['Sotware', 'Software'],
  ['GASTOS DE LA AGENCIA', 'Gastos de la Agencia'],
  ['GASTOS PUBLICITARIOS', 'Gastos Publicitarios'],
];
console.log('\nPosibles typos:');
for (const [mal, bien] of typos) {
  const count = entries.filter(([k]) => k.includes(mal)).reduce((s, [, c]) => s + c, 0);
  if (count > 0) console.log(`  "${mal}" → "${bien}" (${count} ocurrencias)`);
}

// Detalle de huérfanas
console.log('\n\n--- HUÉRFANAS (1 transacción cada una) ---\n');
filasHuerfanas.forEach(({ key, row, rowNum }, idx) => {
  const fecha = idxFecha >= 0 ? row[idxFecha] : '';
  const proy = idxProy >= 0 ? row[idxProy] : '';
  const desc = idxDesc >= 0 ? (row[idxDesc] || '').slice(0, 80) : '';
  const imp = idxImporte >= 0 ? row[idxImporte] : '';
  console.log(`${idx + 1}. [Fila ${rowNum}] ${key}`);
  console.log(`   Fecha: ${fecha} | Proyecto: ${proy} | Importe: ${imp}`);
  console.log(`   Desc: ${desc}${(row[idxDesc] || '').length > 80 ? '...' : ''}`);
  console.log('');
});
