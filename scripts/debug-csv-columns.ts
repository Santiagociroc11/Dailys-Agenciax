/**
 * Debug: ver qué columnas parsea el CSV para las filas "Sin descripción"
 */
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { join } from 'path';

const csvText = readFileSync(join(process.cwd(), 'csvejemplo.csv'), 'utf-8');
const records = parse(csvText, { relax_column_count: true, trim: true, skip_empty_lines: true }) as string[][];

const headerRow = 4; // FECHA está en línea 5
const headers = records[headerRow].map((h) => (h || '').trim());
const idxDescripcion = headers.findIndex((h) => /DESCRIPCI[OÓ]N/i.test(h));
let idxCategoria = headers.findIndex((h) => /CATEGOR[IÍ]A\/DETALLE/i.test(h));
if (idxCategoria < 0) idxCategoria = headers.findIndex((h) => /^DETALLE$/i.test(h));
if (idxCategoria < 0) idxCategoria = headers.findIndex((h) => /^CATEGOR[IÍ]A$/i.test(h));
const idxSubcategoria = headers.findIndex((h) => /SUBCATEGORIA/i.test(h));

console.log('Header indices:', { idxDescripcion, idxCategoria, idxSubcategoria });
console.log('Columnas:', headers.slice(0, 8));
console.log('');

// Revisar primeras 25 filas de datos
for (let i = headerRow + 1; i < Math.min(headerRow + 26, records.length); i++) {
  const row = records[i];
  const desc = (row[idxDescripcion] ?? '').trim();
  const cat = (row[idxCategoria] ?? '').trim();
  const sub = (row[idxSubcategoria] ?? '').trim();
  const proyecto = (row[2] ?? '').trim();
  const result = (cat || desc) || 'Sin descripción';
  const isProblem = result === 'Sin descripción';
  console.log(`L${i + 1} | PROY=${proyecto.slice(0, 12).padEnd(12)} | DESC="${desc.slice(0, 25)}" | CAT="${cat.slice(0, 25)}" | SUB="${sub.slice(0, 15)}" ${isProblem ? '<< SIN DESC' : ''}`);
}
