/**
 * Corrige categorías de INGRESOS usando IA (OpenRouter).
 * Sin patrones: la IA determina la categoría correcta según fecha, proyecto, descripción y monto.
 *
 * Uso: OPENROUTER_API_KEY=xxx npx tsx scripts/corregir-ingresos-ia.ts [csv]
 */
import 'dotenv/config';
import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const BATCH_SIZE = 12;
const MODEL = 'google/gemini-2.5-flash-lite';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function parseAmount(s: string): number | null {
  const n = parseFloat(String(s || '').replace(/[$\s,]/g, ''));
  return isNaN(n) ? null : n;
}

function detectColumns(headers: string[]) {
  let idxCategoria = headers.findIndex((h) => /CATEGOR[IÍ]A\/DETALLE|^CATEGOR[IÍ]A$/i.test(h));
  if (idxCategoria < 0) idxCategoria = headers.findIndex((h) => /^DETALLE$/i.test(h));
  const idxDetalle = headers.findIndex((h, i) => i !== idxCategoria && /^DETALLE$/i.test((h || '').trim()));
  const idxFecha = headers.findIndex((h) => /FECHA/i.test(h));
  const idxProyecto = headers.findIndex((h) => /PROYECTO/i.test(h));
  const idxDescripcion = headers.findIndex((h) => /DESCRIPCI[OÓ]N/i.test(h));
  const idxImporteContable = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
  const accountColStart = idxImporteContable >= 0 ? idxImporteContable + 1 : 7;
  const accountHeaders = headers.slice(accountColStart).filter((h) => h && !/^\s*$/.test(h));
  return { idxCategoria, idxDetalle, idxFecha, idxProyecto, idxDescripcion, accountColStart, accountHeaders };
}

function esIngreso(row: string[], accountColStart: number, accountHeaders: string[]): boolean {
  let suma = 0;
  for (let c = 0; c < accountHeaders.length; c++) {
    const cell = (row[accountColStart + c] || '').trim();
    const n = parseAmount(cell);
    if (n != null) suma += n;
  }
  return suma > 0;
}

async function sugerirCategoriasIA(
  items: { fecha: string; proyecto: string; descripcion: string; montoTotal: number; cuentas: string; catActual: string; detActual: string }[],
  apiKey: string
): Promise<{ categoria: string; detalle: string }[]> {
  const texto = items
    .map(
      (t, i) =>
        `${i + 1}. Fecha: ${t.fecha} | Proyecto: ${t.proyecto} | Descripción: "${t.descripcion}" | Monto: ${t.montoTotal} | ${t.cuentas} | Actual: "${t.catActual}" / "${t.detActual}"`
    )
    .join('\n');

  const prompt = `Reclasifica estas transacciones de INGRESO (dinero que entró). Analiza fecha, proyecto, descripción y monto.
Asigna categoría y detalle apropiados. El detalle debe identificar el proyecto/producto real (ej: GERSSON L1, NATASHA, FRANK SERAPION) cuando aplique.
Devuelve SOLO un array JSON: [{"categoria":"...","detalle":"..."},...]

Transacciones:
${texto}`;

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://dailys-agenciax.local',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 2048,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401) {
      throw new Error(`OpenRouter rechazó la API key (401). Crea o verifica tu key en https://openrouter.ai/keys`);
    }
    throw new Error(`API ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  let content = data.choices?.[0]?.message?.content?.trim() ?? '';
  const block = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) content = block[1].trim();
  const parsed = JSON.parse(content) as { categoria: string; detalle: string }[];
  while (parsed.length < items.length) {
    const i = parsed.length;
    parsed.push({ categoria: items[i].catActual, detalle: items[i].detActual });
  }
  return parsed.slice(0, items.length);
}

async function main() {
  const csvPath = process.argv[2] || join(process.cwd(), 'CUENTAS DINERO PRESUPUESTO final_interactivo_revisado.csv');
  const apiKey = (process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY || '').replace(/\s/g, '');
  if (!apiKey) {
    console.error('Falta OPENROUTER_API_KEY');
    process.exit(1);
  }

  const csvText = readFileSync(csvPath, 'utf-8');
  const records = parse(csvText, { relax_column_count: true, trim: true, skip_empty_lines: true }) as string[][];
  if (records.length < 2) {
    console.error('CSV vacío');
    process.exit(1);
  }

  let headerRow = 0;
  for (let i = 0; i < Math.min(10, records.length); i++) {
    if (records[i].some((c) => /PROYECTO|CATEGORIA|DESCRIPCION/i.test(c || ''))) {
      headerRow = i;
      break;
    }
  }

  const headers = records[headerRow].map((h) => (h || '').trim());
  const { idxCategoria, idxDetalle, idxFecha, idxProyecto, idxDescripcion, accountColStart, accountHeaders } =
    detectColumns(headers);

  const ingresos: { rowIndex: number; row: string[]; montoTotal: number; cuentasStr: string }[] = [];
  for (let i = headerRow + 1; i < records.length; i++) {
    const row = records[i];
    if (!esIngreso(row, accountColStart, accountHeaders)) continue;

    let suma = 0;
    const parts: string[] = [];
    for (let c = 0; c < accountHeaders.length; c++) {
      const cell = (row[accountColStart + c] || '').trim();
      const n = parseAmount(cell);
      if (n != null && n > 0) {
        suma += n;
        parts.push(`${accountHeaders[c]}: ${n}`);
      }
    }
    if (suma <= 0) continue;

    ingresos.push({
      rowIndex: i,
      row: [...row],
      montoTotal: suma,
      cuentasStr: parts.join('; '),
    });
  }

  console.log(`Ingresos a reclasificar: ${ingresos.length}`);

  for (let b = 0; b < ingresos.length; b += BATCH_SIZE) {
    const batch = ingresos.slice(b, b + BATCH_SIZE);
    const items = batch.map(({ row, montoTotal, cuentasStr }) => ({
      fecha: (row[idxFecha] || '').trim(),
      proyecto: (row[idxProyecto] || '').trim(),
      descripcion: ((row[idxDescripcion] || '') || (row[idxCategoria] || '')).trim() || 'Sin descripción',
      montoTotal,
      cuentas: cuentasStr,
      catActual: (idxCategoria >= 0 ? (row[idxCategoria] || '').trim() : '') || 'Importación',
      detActual: (idxDetalle >= 0 ? (row[idxDetalle] || '').trim() : '') || '',
    }));

    const sugerencias = await sugerirCategoriasIA(items, apiKey);

    for (let j = 0; j < batch.length; j++) {
      const { rowIndex, row } = batch[j];
      const sug = sugerencias[j];
      if (idxCategoria >= 0) records[rowIndex][idxCategoria] = sug.categoria;
      if (idxDetalle >= 0) records[rowIndex][idxDetalle] = sug.detalle;
    }

    console.log(`Procesados ${Math.min(b + BATCH_SIZE, ingresos.length)} / ${ingresos.length}`);
    if (b + BATCH_SIZE < ingresos.length) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  const baseName = csvPath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') ?? 'output';
  const outFile = join(dirname(csvPath), `${baseName}_corregido.csv`);

  const escapeCsv = (val: string): string => {
    const s = String(val ?? '').replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  };
  const lines = records.map((row) => row.map(escapeCsv).join(','));
  writeFileSync(outFile, '\ufeff' + lines.join('\n'), 'utf-8');
  console.log(`Guardado: ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
