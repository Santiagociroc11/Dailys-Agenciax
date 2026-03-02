/**
 * Normaliza categorías y detalles del CSV interactivo.
 * Corrige typos, unifica mayúsculas/minúsculas y fusiona variantes.
 *
 * Uso: npx tsx scripts/normalizar-interactivo-csv.ts [ruta_csv]
 */
import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

// Renombrar categoría exacta
const RENOMBRAR_CATEGORIA: Record<string, string> = {
  'Sotware y suscripciones': 'Software y suscripciones',
  'GASTOS DE LA AGENCIA': 'Gastos de la Agencia',
  'GASTOS PUBLICITARIOS': 'Gastos Publicitarios',
  'INGRESOS POR PROEYCTO': 'Ingresos por Proyecto',
};

// Renombrar detalle exacto (independiente de categoría)
const RENOMBRAR_DETALLE: Record<string, string> = {
  'NOMINA': 'Nómina',
  'FIVEER': 'Fiverr',
  'VIAJES': 'Viaje',
  'DOMINIO': 'Dominios',
};

function main() {
  const csvPath = process.argv[2] || join(process.cwd(), 'CUENTAS DINERO PRESUPUESTO final_interactivo.csv');
  const csvText = readFileSync(csvPath, 'utf-8');
  const records = parse(csvText, { relax_column_count: true, trim: true, skip_empty_lines: true });

  const headers = records[0];
  const idxCat = headers.findIndex((h: string) => /CATEGORIA/i.test(h || ''));
  const idxDet = headers.findIndex((h: string, i: number) => i > idxCat && /^DETALLE$/i.test(h || ''));

  if (idxCat < 0 || idxDet < 0) {
    console.error('No se encontraron columnas CATEGORIA y DETALLE');
    process.exit(1);
  }

  let cambios = 0;
  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    let cat = (row[idxCat] || '').trim();
    let det = (row[idxDet] || '').trim();

    if (RENOMBRAR_CATEGORIA[cat]) {
      row[idxCat] = RENOMBRAR_CATEGORIA[cat];
      cambios++;
    }
    if (RENOMBRAR_DETALLE[det]) {
      row[idxDet] = RENOMBRAR_DETALLE[det];
      cambios++;
    }
  }

  const outPath = csvPath.replace(/\.csv$/i, '_normalizado.csv');
  const lines = [headers.join(',')];
  for (let i = 1; i < records.length; i++) {
    lines.push(records[i].map((c: string) => {
      const s = String(c ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
  }
  writeFileSync(outPath, '\ufeff' + lines.join('\n'), 'utf-8');

  console.log(`✅ ${cambios} correcciones aplicadas`);
  console.log(`📄 Guardado: ${outPath}`);
}

main();
