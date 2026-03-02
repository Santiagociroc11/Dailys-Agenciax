/**
 * Categorizador INTERACTIVO que aprende de tus correcciones.
 *
 * - Primeras transacciones: pregunta cada una, la IA sugiere y tú confirmas o corriges.
 * - Cuando la misma categoría original aparece 2+ veces aprobada → aplica automáticamente.
 * - Si no está claro → sigue preguntando.
 *
 * Uso: OPENROUTER_API_KEY=xxx npx tsx scripts/categorizador-interactivo.ts [csv]
 *
 * Comandos durante la sesión:
 *   Enter     = Aceptar sugerencia de la IA
 *   c,d       = Corregir (ej: "Gastos de la Agencia, Viaje")
 *   s         = Saltar (mantener original, preguntar de nuevo si reaparece)
 *   k         = Mantener original y aprender (no preguntar más para este patrón)
 *   q         = Salir y guardar lo procesado
 */
import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import * as readline from 'readline';

const BATCH_SIZE = 10; // Transacciones por lote para la IA
const MODEL = 'google/gemini-2.5-flash-lite';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const APRENDIZAJE_MIN = 1; // Con 1 aprobación ya auto-aplica (Enter o corrección)

interface TransaccionRaw {
  rowIndex: number;
  categoria: string;
  descripcion: string;
  proyecto: string;
  esIngreso: boolean | null;
  row: string[];
}

interface Aprendizaje {
  /** categoria_original normalizada → { categoria, detalle, count } */
  mappings: Record<string, { categoria: string; detalle: string; count: number }>;
  /** Patrones que siempre preguntar (no auto-aplicar) */
  siempre_preguntar: string[];
}

function norm(s: string): string {
  return (s || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Extrae una clave canónica para agrupar variantes.
 * "FACEBK *56WRMPYV22" y "Card charge (FACEBK *ABC)" → "FACEBK"
 * "MANYCHAT.COM" y "MANYCHAT" → "MANYCHAT"
 * Así una aprobación aplica a todas las variantes.
 */
function claveCanonica(categoria: string, descripcion: string): string {
  const cat = norm(categoria);
  const desc = norm(descripcion);
  const texto = `${cat} ${desc}`;

  // Patrones conocidos (orden: más específico primero)
  const patrones: [RegExp, string][] = [
    [/FACEBK\s*\*?\s*\w*/i, 'FACEBK'],
    [/FB\s*ADS/i, 'FB ADS'],
    [/MANYCHAT/i, 'MANYCHAT'],
    [/MAILER\s*LITE|MAILERLITE/i, 'MAILERLITE'],
    [/STREAMYARD/i, 'STREAMYARD'],
    [/HOSTINGER|HOSTINGUER/i, 'HOSTINGER'],
    [/CHATGPT|OPENAI\s*\*?/i, 'CHATGPT'],
    [/CURSOR/i, 'CURSOR'],
    [/STAPE/i, 'STAPE'],
    [/FLODESK/i, 'FLODESK'],
    [/SALDOS\s*INICIALES/i, 'SALDOS INICIALES'],
    [/VUELOS\s*HOTMART/i, 'VUELOS HOTMART'],
    [/RETIRO\s*HOTMART|PAYMENT\s*FROM\s*HOTMART/i, 'RETIRO HOTMART'],
    [/INGRESOS?\s*HOTMART|VENTAS/i, 'INGRESOS HOTMART'],
    [/COWORKING/i, 'COWORKING'],
    [/COMIDA\s*(EQUIPO|GERSSON)/i, 'COMIDA EQUIPO'],
    [/VIAJE\s*(DANIEL|FRAN|MEXICO)/i, 'VIAJE'],
    [/DEVZAPP|SIGNALWIRE|NAMECHEAP|CLOUDFLARE/i, 'SERVICIOS'],
    [/CURSOS|PERFECT\s*LAUNCH/i, 'CURSOS'],
    [/PAGOS\s*PENDIENTES|DEUDAS\s*Y\s*PAGOS/i, 'PAGOS PENDIENTES'],
    [/INGRESOS\s*PROYECTO|VENTAS/i, 'INGRESOS PROYECTO'],
    [/TRASLADOS\s*ENTRE\s*CUENTAS|TRASLADOS/i, 'TRASLADOS'],
    [/SUEDOS\s*AGENCIA|SUELDOS\s*AGENCIA/i, 'SUELDOS AGENCIA'],
    [/GREATPAGES|GREAT\s*PAGES/i, 'GREATPAGES'],
    [/BOLT|ZOOM/i, 'SOFTWARE'],
  ];

  for (const [re, replacement] of patrones) {
    if (texto.match(re)) return replacement;
  }

  // Primer palabra/token del categoria (MANYCHAT.COM → MANYCHAT)
  const primerToken = cat.match(/^([A-Z0-9ÁÉÍÓÚÑ]+)/i)?.[1] || cat.match(/^([A-Z0-9]+)/i)?.[1];
  if (primerToken && primerToken.length >= 2) return primerToken;

  // Si es corto (< 30 chars) y sin códigos raros, usar tal cual
  if (cat.length <= 30 && !/\*|\d{2,}/.test(cat)) return cat;

  return cat;
}

function escapeCsv(val: string): string {
  const s = String(val ?? '').replace(/"/g, '""');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
}

function detectColumns(headers: string[]) {
  let idxCategoria = headers.findIndex((h) => /CATEGOR[IÍ]A\/DETALLE|^CATEGOR[IÍ]A$/i.test(h));
  if (idxCategoria < 0) idxCategoria = headers.findIndex((h) => /^DETALLE$/i.test(h));
  let idxDescripcion = headers.findIndex((h) => /DESCRIPCI[OÓ]N/i.test(h));
  if (idxDescripcion < 0) idxDescripcion = headers.findIndex((h) => /NOTA|CONCEPTO/i.test(h));
  const idxSubcategoria = headers.findIndex((h) => /SUBCATEGORIA/i.test(h));
  const idxProyecto = headers.findIndex((h) => /PROYECTO/i.test(h));
  const idxTipo = headers.findIndex((h) => /^TIPO/i.test(h));
  const idxImporteContable = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
  const accountColStart = idxImporteContable >= 0 ? idxImporteContable + 1 : 7;
  return { idxCategoria, idxDescripcion, idxSubcategoria, idxProyecto, accountColStart, idxTipo, idxImporteContable };
}

function detectarSentido(row: string[], idxTipo: number, idxImporteContable: number, accountColStart: number, headers: string[]): boolean | null {
  const tipo = (idxTipo >= 0 ? row[idxTipo] : '').toUpperCase();
  if (/INGRESO/.test(tipo)) return true;
  if (/SALIDA/.test(tipo)) return false;
  let suma = 0;
  for (let c = accountColStart; c < row.length && c < headers.length; c++) {
    const s = (row[c] || '').replace(/[$\s,]/g, '');
    const n = parseFloat(s);
    if (!isNaN(n)) suma += n;
  }
  if (suma !== 0) return suma > 0;
  if (idxImporteContable >= 0) {
    const s = (row[idxImporteContable] || '').replace(/[$\s,]/g, '');
    const n = parseFloat(s);
    if (!isNaN(n) && n !== 0) return n > 0;
  }
  return null;
}

async function sugerirIA(transacciones: TransaccionRaw[], apiKey: string): Promise<{ categoria: string; detalle: string; descripcion: string }[]> {
  const texto = transacciones
    .map((t, i) => `${i + 1}. [${t.esIngreso === true ? 'INGRESO' : t.esIngreso === false ? 'GASTO' : '?'}] ${t.proyecto} | "${t.categoria}" | "${t.descripcion}"`)
    .join('\n');

  const prompt = `Clasifica estas transacciones. Devuelve JSON array con categoria, detalle, descripcion.

REGLAS OBLIGATORIAS:
- VUELOS, VIAJE, VIAJES = Gastos de la Agencia / Viaje (NUNCA Ingresos)
- Retiro Hotmart, RETIRO HOTMART = Retiros / Hotmart
- Ingresos/ventas Hotmart = Ingresos por Proyecto / Hotmart
- COWORKING, COMIDA EQUIPO = Gastos de la Agencia
- [GASTO] + algo con Hotmart en nombre pero es vuelo/evento = Gastos de la Agencia, NO Ingresos

Solo JSON: [{"categoria":"...","detalle":"...","descripcion":"..."},...]

${texto}`;

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 2048 }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  let content = data.choices?.[0]?.message?.content?.trim() ?? '';
  const block = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) content = block[1].trim();
  const parsed = JSON.parse(content) as { categoria: string; detalle: string; descripcion: string }[];
  while (parsed.length < transacciones.length) {
    const i = parsed.length;
    parsed.push({ categoria: transacciones[i].categoria, detalle: transacciones[i].categoria, descripcion: transacciones[i].descripcion });
  }
  return parsed.slice(0, transacciones.length);
}

function pregunta(rl: readline.Interface, msg: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(msg, (ans) => resolve((ans || '').trim()));
  });
}

async function main() {
  const csvPath = process.argv[2] || join(process.cwd(), 'CUENTAS DINERO PRESUPUESTO final.csv');
  const apiKey = process.env.OPENROUTER_API_KEY;

  const csvText = readFileSync(csvPath, 'utf-8');
  const records = parse(csvText, { relax_column_count: true, trim: true, skip_empty_lines: true }) as string[][];
  if (records.length < 2) {
    console.error('CSV vacío');
    process.exit(1);
  }

  let headerRow = 0;
  for (let i = 0; i < Math.min(10, records.length); i++) {
    const row = records[i];
    if (row.some((c) => /PROYECTO|CATEGORIA|DESCRIPCION/i.test(c || ''))) {
      headerRow = i;
      break;
    }
  }

  const headers = records[headerRow].map((h) => (h || '').trim());
  const { idxCategoria, idxDescripcion, idxSubcategoria, idxProyecto, accountColStart, idxTipo, idxImporteContable } = detectColumns(headers);
  if (idxCategoria < 0 && idxDescripcion < 0) {
    console.error('CSV debe tener CATEGORIA o DESCRIPCION');
    process.exit(1);
  }

  const transacciones: TransaccionRaw[] = [];
  for (let i = headerRow + 1; i < records.length; i++) {
    const row = records[i];
    const cat = (idxCategoria >= 0 ? row[idxCategoria] : '')?.trim() || '';
    const sub = (idxSubcategoria >= 0 ? row[idxSubcategoria] : '')?.trim() || '';
    const desc = (idxDescripcion >= 0 ? row[idxDescripcion] : '')?.trim() || cat || sub || 'Sin descripción';
    const proyecto = (idxProyecto >= 0 ? row[idxProyecto] : '')?.trim() || '';
    const categoriaOriginal = sub && cat && sub !== cat ? `${sub} (${cat})` : sub || cat || 'Importación';
    const esIngreso = detectarSentido(row, idxTipo, idxImporteContable, accountColStart, headers);
    if (!categoriaOriginal && !desc) continue;
    transacciones.push({ rowIndex: i + 1, categoria: categoriaOriginal, descripcion: desc, proyecto, esIngreso, row: [...row] });
  }

  const outDir = dirname(csvPath);
  const aprendizajePath = join(outDir, 'categorizador_aprendizaje.json');
  let aprendizaje: Aprendizaje = { mappings: {}, siempre_preguntar: [] };
  if (existsSync(aprendizajePath)) {
    aprendizaje = JSON.parse(readFileSync(aprendizajePath, 'utf-8'));
  }
  // Semilla: correcciones conocidas para no preguntar
  const semilla: Record<string, { categoria: string; detalle: string }> = {
    'VUELOS HOTMART': { categoria: 'Gastos de la Agencia', detalle: 'Viaje' },
    'VIAJE DANIEL': { categoria: 'Gastos de la Agencia', detalle: 'Viaje Daniel' },
    'VIAJE FRAN': { categoria: 'Gastos de la Agencia', detalle: 'Viaje Fran' },
    'VIAJE MEXICO DANIEL': { categoria: 'Gastos de la Agencia', detalle: 'Viaje México' },
    'COWORKING': { categoria: 'Gastos de la Agencia', detalle: 'Coworking' },
    'COMIDA EQUIPO': { categoria: 'Gastos de la Agencia', detalle: 'Comida del equipo' },
    'COMIDA GERSSON': { categoria: 'Gastos de la Agencia', detalle: 'Comida del equipo' },
  };
  for (const [k, v] of Object.entries(semilla)) {
    if (!aprendizaje.mappings[norm(k)]) {
      aprendizaje.mappings[norm(k)] = { ...v, count: APRENDIZAJE_MIN };
    }
  }

  const resultados: (TransaccionRaw & { categoria: string; detalle: string; descripcion: string })[] = [];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(`\n📂 ${csvPath}`);
  console.log(`📊 ${transacciones.length} transacciones`);
  console.log(`📚 Aprendizaje: ${Object.keys(aprendizaje.mappings).length} patrones conocidos`);
  console.log(`
┌─────────────────────────────────────────────────────────────────┐
│  QUÉ ESCRIBIR:                                                   │
│  • Enter        = Aceptar lo que sugiere la IA                   │
│  • categoria, detalle = Corregir (ej: Gastos de la Agencia, Viaje)│
│  • s            = Saltar (mantener original)                     │
│  • k            = Mantener original y no preguntar más           │
│  • q            = Salir y guardar                                 │
│                                                                  │
│  Para corregir SIEMPRE usa coma: "Categoría, Detalle"             │
│  Guía completa: docs/CATEGORIZADOR_INTERACTIVO.md                 │
└─────────────────────────────────────────────────────────────────┘
`);

  let procesadas = 0;
  let autoAplicadas = 0;
  let preguntadas = 0;
  let salir = false;

  const guardarParcial = () => {
    writeFileSync(aprendizajePath, JSON.stringify(aprendizaje, null, 2), 'utf-8');
    const baseName = csvPath.replace(/\.[^/.]+$/, '').split(/[/\\]/).pop() || 'transacciones';
    const outCsv = join(outDir, `${baseName}_interactivo.csv`);
    const headersOut = [...headers];
    if (!headersOut.some((h) => /^DETALLE$/i.test(h))) headersOut.splice(headersOut.findIndex((h) => /CATEGORIA/i.test(h)) + 1, 0, 'DETALLE');
    const lines = [headersOut.map(escapeCsv).join(',')];
    for (const r of resultados) {
      const outRow: string[] = [];
      for (const h of headersOut) {
        if (/^DETALLE$/i.test(h)) outRow.push(r.detalle);
        else if (headers[idxCategoria] === h) outRow.push(r.categoria);
        else if (headers[idxDescripcion] === h) outRow.push(r.descripcion);
        else {
          const idx = headers.indexOf(h);
          outRow.push(idx >= 0 && idx < r.row.length ? r.row[idx] ?? '' : '');
        }
      }
      lines.push(outRow.map(escapeCsv).join(','));
    }
    writeFileSync(outCsv, '\ufeff' + lines.join('\n'), 'utf-8');
  };

  // Estadísticas: cuántas claves canónicas únicas (máx. preguntas)
  const clavesUnicas = new Set(transacciones.map((t) => norm(claveCanonica(t.categoria, t.descripcion))));
  console.log(`🔑 ~${clavesUnicas.size} patrones únicos → aprobarás como máximo ${clavesUnicas.size} veces (no ${transacciones.length})`);

  for (let i = 0; i < transacciones.length && !salir; i++) {
    const t = transacciones[i];
    const key = norm(claveCanonica(t.categoria, t.descripcion));
    const mapping = aprendizaje.mappings[key];
    const siemprePreguntar = aprendizaje.siempre_preguntar.some((p) => key.includes(norm(p)));

    let cat: string;
    let det: string;
    let desc = t.descripcion;

    if (mapping && mapping.count >= APRENDIZAJE_MIN && !siemprePreguntar) {
      cat = mapping.categoria;
      det = mapping.detalle;
      autoAplicadas++;
    } else {
      const batch = transacciones.slice(i, Math.min(i + BATCH_SIZE, transacciones.length));
      let sugerencias: { categoria: string; detalle: string; descripcion: string }[] = [];
      if (apiKey && batch.length > 0) {
        try {
          sugerencias = await sugerirIA(batch, apiKey);
        } catch (e) {
          console.error('IA no disponible:', (e as Error).message);
        }
      }
      const sug = sugerencias[0] || { categoria: t.categoria, detalle: t.categoria, descripcion: t.descripcion };

      const sentido = t.esIngreso === true ? 'INGRESO' : t.esIngreso === false ? 'GASTO' : '?';
      console.log(`\n--- ${i + 1}/${transacciones.length} ---`);
      console.log(`[${sentido}] ${t.proyecto} | "${t.categoria}"`);
      console.log(`  Desc: ${t.descripcion.slice(0, 70)}${t.descripcion.length > 70 ? '...' : ''}`);
      console.log(`  IA: ${sug.categoria} / ${sug.detalle}`);

      const ans = await pregunta(rl, '> ');

      if (ans === 'q') {
        salir = true;
        // Completar con originales las no procesadas (incl. la actual)
        for (let j = i; j < transacciones.length; j++) {
          const rest = transacciones[j];
          resultados.push({ ...rest, categoria: rest.categoria, detalle: rest.categoria, descripcion: rest.descripcion });
        }
        break;
      }
      if (ans === 's') {
        cat = t.categoria;
        det = t.categoria;
      } else if (ans === 'k') {
        cat = t.categoria;
        det = t.categoria;
        if (!aprendizaje.mappings[key]) aprendizaje.mappings[key] = { categoria: cat, detalle: det, count: 0 };
        aprendizaje.mappings[key].count = 999;
      } else if (ans.includes(',') && ans.length > 2) {
        const [c, d] = ans.split(',').map((x) => x.trim());
        cat = c || sug.categoria;
        det = d || sug.detalle;
        if (!aprendizaje.mappings[key]) aprendizaje.mappings[key] = { categoria: cat, detalle: det, count: 0 };
        aprendizaje.mappings[key].categoria = cat;
        aprendizaje.mappings[key].detalle = det;
        aprendizaje.mappings[key].count++;
      } else {
        cat = sug.categoria;
        det = sug.detalle;
        desc = sug.descripcion || t.descripcion;
        if (!aprendizaje.mappings[key]) aprendizaje.mappings[key] = { categoria: cat, detalle: det, count: 0 };
        aprendizaje.mappings[key].categoria = cat;
        aprendizaje.mappings[key].detalle = det;
        aprendizaje.mappings[key].count++;
      }
      preguntadas++;
    }

    resultados.push({ ...t, categoria: cat, detalle: det, descripcion: desc });
    procesadas++;

    if (procesadas % 50 === 0) {
      guardarParcial();
      console.log(`\n💾 Guardado parcial (${procesadas} trans.)`);
    }
  }

  const baseName = csvPath.replace(/\.[^/.]+$/, '').split(/[/\\]/).pop() || 'transacciones';
  const outCsv = join(outDir, `${baseName}_interactivo.csv`);
  const headersOut = [...headers];
  if (!headersOut.some((h) => /^DETALLE$/i.test(h))) headersOut.splice(headersOut.findIndex((h) => /CATEGORIA/i.test(h)) + 1, 0, 'DETALLE');
  const lines = [headersOut.map(escapeCsv).join(',')];
  for (const r of resultados) {
    const outRow: string[] = [];
    for (const h of headersOut) {
      if (/^DETALLE$/i.test(h)) outRow.push(r.detalle);
      else if (headers[idxCategoria] === h) outRow.push(r.categoria);
      else if (headers[idxDescripcion] === h) outRow.push(r.descripcion);
      else {
        const idx = headers.indexOf(h);
        outRow.push(idx >= 0 && idx < r.row.length ? r.row[idx] ?? '' : '');
      }
    }
    lines.push(outRow.map(escapeCsv).join(','));
  }
  writeFileSync(outCsv, '\ufeff' + lines.join('\n'), 'utf-8');
  writeFileSync(aprendizajePath, JSON.stringify(aprendizaje, null, 2), 'utf-8');

  rl.close();
  console.log(`\n✅ Listo. ${procesadas} procesadas (${autoAplicadas} auto, ${preguntadas} preguntadas)`);
  console.log(`   📄 ${outCsv}`);
  console.log(`   📚 ${aprendizajePath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
