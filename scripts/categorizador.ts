/**
 * Agente categorizador: normaliza categorías y descripciones de transacciones usando IA.
 *
 * Procesa un CSV en lotes de 50, mantiene un diccionario global de categorías
 * y genera transacciones_limpias.csv + diccionario_categorias.json.
 *
 * Uso:
 *   OPENROUTER_API_KEY=tu_key npx tsx scripts/categorizador.ts [ruta_csv]
 *   O con .env: npx tsx scripts/categorizador.ts [ruta_csv]
 */
import 'dotenv/config';
import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const BATCH_SIZE = 50;
const MODEL = 'google/gemini-2.5-flash-lite';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface Categorizacion {
  categoria: string;
  detalle: string;
  descripcion?: string;
}

interface TransaccionRaw {
  rowIndex: number;
  categoria: string;
  descripcion: string;
  proyecto: string;
  esIngreso: boolean | null; // true=ingreso, false=gasto, null=desconocido
  row: string[];
}

function escapeCsv(val: string): string {
  const s = String(val ?? '').replace(/"/g, '""');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
}

function detectColumns(headers: string[]): {
  idxCategoria: number;
  idxDescripcion: number;
  idxSubcategoria: number;
  idxProyecto: number;
  accountColStart: number;
  idxTipo: number;
  idxImporteContable: number;
} {
  let idxCategoria = headers.findIndex((h) => /CATEGOR[IÍ]A\/DETALLE/i.test(h));
  if (idxCategoria < 0) idxCategoria = headers.findIndex((h) => /^CATEGOR[IÍ]A$/i.test(h));
  if (idxCategoria < 0) idxCategoria = headers.findIndex((h) => /^DETALLE$/i.test(h));

  let idxDescripcion = headers.findIndex((h) => /DESCRIPCI[OÓ]N/i.test(h));
  if (idxDescripcion < 0) idxDescripcion = headers.findIndex((h) => /NOTA|CONCEPTO|OBSERVACI[OÓ]N/i.test(h));

  const idxSubcategoria = headers.findIndex((h) => /SUBCATEGORIA/i.test(h));
  const idxProyecto = headers.findIndex((h) => /PROYECTO/i.test(h));
  const idxTipo = headers.findIndex((h) => /^TIPO/i.test(h));
  const idxImporteContable = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
  const accountColStart = idxImporteContable >= 0 ? idxImporteContable + 1 : 7;

  return { idxCategoria, idxDescripcion, idxSubcategoria, idxProyecto, accountColStart, idxTipo, idxImporteContable };
}

/** Detecta si la fila es ingreso, gasto o neutro según los montos y tipo */
function detectarSentido(row: string[], idxTipo: number, idxImporteContable: number, accountColStart: number, headers: string[]): boolean | null {
  const tipo = (idxTipo >= 0 ? row[idxTipo] : '').toUpperCase();
  if (/INGRESO/.test(tipo)) return true;
  if (/SALIDA/.test(tipo)) return false;

  // Revisar montos en columnas de cuentas
  let suma = 0;
  for (let c = accountColStart; c < row.length && c < headers.length; c++) {
    const s = (row[c] || '').replace(/[$\s,]/g, '');
    const n = parseFloat(s);
    if (!isNaN(n)) suma += n;
  }
  if (suma !== 0) return suma > 0;

  // Revisar importe contable
  if (idxImporteContable >= 0) {
    const s = (row[idxImporteContable] || '').replace(/[$\s,]/g, '');
    const n = parseFloat(s);
    if (!isNaN(n) && n !== 0) return n > 0;
  }

  return null;
}

async function categorizarBatch(
  transacciones: TransaccionRaw[],
  diccionarioGlobal: Record<string, string[]>,
  apiKey: string
): Promise<Categorizacion[]> {
  const categoriasExistentes = Object.keys(diccionarioGlobal);

  const listaCategorias =
    categoriasExistentes.length > 0
      ? categoriasExistentes.join(', ')
      : '(ninguna aún; puedes crear las que necesites)';

  const listaDetalles =
    categoriasExistentes.length > 0
      ? categoriasExistentes
          .filter((c) => diccionarioGlobal[c].length > 0)
          .map((c) => `  ${c}: ${diccionarioGlobal[c].slice(0, 15).join(', ')}`)
          .join('\n')
      : '(ninguno aún)';

  const transaccionesTexto = transacciones
    .map((t, i) => {
      const sentido = t.esIngreso === true ? 'INGRESO' : t.esIngreso === false ? 'GASTO' : '?';
      return `${i + 1}. [${sentido}] proyecto="${t.proyecto}" | categoria_original="${t.categoria}" | descripcion="${t.descripcion}"`;
    })
    .join('\n');

  const prompt = `Eres un contador que normaliza transacciones de una agencia de marketing digital.

## CAMPOS A DEVOLVER
- "categoria": tipo contable amplio (ver lista). NUNCA pongas el nombre de un proveedor como categoría.
- "detalle": nombre NORMALIZADO del proveedor/concepto. SIEMPRE en Title Case (ej: "ManyChat", "Facebook Ads"). NUNCA todo en mayúsculas. Si ya existe en la lista de detalles conocidos, usa ESA forma exacta.
- "descripcion": frase corta en español (máx 8 palabras) que describa el movimiento.

## CATEGORÍAS DISPONIBLES (usa siempre una de estas si encaja)
${listaCategorias}

## DETALLES YA APROBADOS POR CATEGORÍA (usa estos si aplican, no los cambies)
${listaDetalles}

## REGLAS POR CATEGORÍA
- **Suscripciones**: herramientas con cobro mensual/anual recurrente (ManyChat, MailerLite, ChatGPT, StreamYard, Flodesk, Stape, Claude, Zoom, CapCut, Cursor...)
- **Software**: compras puntuales o licencias no recurrentes. Si la misma herramienta ya está en Suscripciones, ponla en Suscripciones.
- **Marketing**: gasto en publicidad pagada. Detalle: "Facebook Ads", "Google Ads", "TikTok Ads"
- **Servicios de Hosting**: dominios, VPS, hosting (Hostinger, Namecheap, Cloudflare, Signalwire...)
- **Nómina**: sueldos y pagos regulares al equipo. Detalle: nombre de la persona (ej: "Jorge Varela", "Lorena Videos")
- **Comisiones**: porcentaje por ventas/cierres. Detalle: nombre de quien recibe la comisión
- **Distribución de Utilidades**: cortes y repartos a socios. Detalle: nombre del beneficiario o "Corte general"
- **Ingresos por Proyecto**: ventas e ingresos operacionales. Detalle: plataforma o fuente (ej: "Hotmart", "Bancolombia")
- **Retiros**: retiros de fondos de plataformas externas. Detalle: nombre de la plataforma (ej: "Hotmart")
- **Transferencias Internas**: movimientos entre cuentas propias. Detalle: "Traslado entre cuentas"
- **Pagos a Terceros**: pagos a socios o colaboradores externos por acuerdos específicos
- **Cuentas por Pagar**: deudas y pagos pendientes. Detalle: descripción de la deuda

## REGLAS ESPECÍFICAS OBLIGATORIAS
- "FACEBK *" o "FB ADS" → categoria: "Marketing", detalle: "Facebook Ads"
- Retiro de Hotmart → categoria: "Retiros", detalle: "Hotmart"
- Ingreso/ventas de Hotmart → categoria: "Ingresos por Proyecto", detalle: "Hotmart"
- Pago de sueldo regular → categoria: "Nómina", detalle: nombre de la persona
- El detalle NUNCA debe ser igual a la categoría
- Si el campo esIngreso=[INGRESO], la transacción es un ingreso o entrada de dinero
- Si el campo esIngreso=[GASTO], la transacción es un egreso o salida de dinero

## TRANSACCIONES A CLASIFICAR
${transaccionesTexto}

Responde ÚNICAMENTE con JSON válido (array), mismo orden, sin markdown ni explicaciones.
Formato: [{"categoria":"...","detalle":"...","descripcion":"..."},...]`;

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
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!content) throw new Error('Respuesta vacía de OpenRouter');

  // Extraer JSON (puede venir envuelto en ```json ... ```)
  let jsonStr = content;
  const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) jsonStr = codeBlock[1].trim();

  let parsed: Categorizacion[];
  try {
    parsed = JSON.parse(jsonStr) as Categorizacion[];
  } catch (e) {
    console.error('Respuesta no es JSON válido:', content.slice(0, 500));
    throw e;
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`La respuesta no es un array: ${typeof parsed}`);
  }

  // Si faltan elementos, rellenar con los originales; si sobran, truncar
  while (parsed.length < transacciones.length) {
    const i = parsed.length;
    parsed.push({
      categoria: transacciones[i].categoria,
      detalle: transacciones[i].categoria,
      descripcion: transacciones[i].descripcion,
    });
  }
  if (parsed.length > transacciones.length) {
    parsed.length = transacciones.length;
  }

  return parsed;
}

async function main() {
  const csvPath = process.argv[2] || join(process.cwd(), 'csvejemplo.csv');
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('Falta OPENROUTER_API_KEY. Uso: OPENROUTER_API_KEY=tu_key npx tsx scripts/categorizador.ts [csv]');
    process.exit(1);
  }

  const csvText = readFileSync(csvPath, 'utf-8');
  const records = parse(csvText, {
    relax_column_count: true,
    trim: true,
    skip_empty_lines: true,
  }) as string[][];

  if (records.length < 2) {
    console.error('CSV vacío o sin datos');
    process.exit(1);
  }

  // Buscar fila de encabezado
  let headerRow = 0;
  for (let i = 0; i < Math.min(10, records.length); i++) {
    const row = records[i];
    const hasProyecto = row.some((c) => (c || '').toUpperCase().includes('PROYECTO'));
    const hasCategoria = row.some((c) => /CATEGOR[IÍ]A|DESCRIPCI[OÓ]N/i.test(c || ''));
    if (hasProyecto || hasCategoria) {
      headerRow = i;
      break;
    }
  }

  const headers = records[headerRow].map((h) => (h || '').trim());
  const { idxCategoria, idxDescripcion, idxSubcategoria, idxProyecto, accountColStart, idxTipo, idxImporteContable } = detectColumns(headers);

  if (idxCategoria < 0 && idxDescripcion < 0) {
    console.error('El CSV debe tener al menos columna CATEGORIA o DESCRIPCION');
    process.exit(1);
  }

  // Construir transacciones a procesar
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
    transacciones.push({
      rowIndex: i + 1,
      categoria: categoriaOriginal,
      descripcion: desc,
      proyecto,
      esIngreso,
      row: [...row],
    });
  }

  console.log(`\n📂 CSV: ${csvPath}`);
  console.log(`📊 Transacciones a procesar: ${transacciones.length}`);
  console.log(`📦 Tamaño de lote: ${BATCH_SIZE}\n`);

  // Diccionario semilla: categorías y detalles canónicos conocidos de antemano
  // Esto evita inconsistencias en el primer lote cuando el modelo no tiene contexto previo
  const diccionarioGlobal: Record<string, string[]> = {
    'Saldos Iniciales': ['Saldos Iniciales'],
    'Educación': ['Cursos', 'Hotmart'],
    'Suscripciones': ['ManyChat', 'MailerLite', 'ChatGPT', 'StreamYard', 'Flodesk', 'Stape', 'Claude', 'Zoom', 'CapCut', 'Cursor', 'Google One', 'Sendflow', 'Uchat'],
    'Software': ['Devzapp', 'LeadTracker', 'GreatPages', 'Bolt', 'PandaVideo', 'OpenRouter', 'Heygen', 'Supabase', 'Chatwoot', 'WP Rocket', 'Nifty', 'Trae'],
    'Marketing': ['Facebook Ads', 'Google Ads', 'TikTok Ads', 'LeadTracker', 'Adveronix'],
    'Servicios de Hosting': ['Hostinger', 'Namecheap', 'Cloudflare', 'VPS N8N', 'Signalwire', 'Google Workspace'],
    'Nómina': ['Sueldos', 'Nómina'],
    'Comisiones': ['Comisiones'],
    'Distribución de Utilidades': ['Corte general', 'Corte de utilidades'],
    'Ingresos por Proyecto': ['Hotmart', 'Bancolombia', 'Ventas'],
    'Retiros': ['Hotmart', 'Binance'],
    'Transferencias Internas': ['Traslado entre cuentas'],
    'Pagos a Terceros': [],
    'Cuentas por Pagar': [],
    'Pagos a Equipo': [],
    'Servicios Profesionales': ['Adveronix', 'Fiverr'],
    'GASTO NO IDENTIFICADO': [],
    'Comidas a Equipo': ['Comida del equipo'],
  };
  const resultados: (TransaccionRaw & Categorizacion)[] = [];

  try {
    for (let offset = 0; offset < transacciones.length; offset += BATCH_SIZE) {
      const batch = transacciones.slice(offset, offset + BATCH_SIZE);
      const batchNum = Math.floor(offset / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(transacciones.length / BATCH_SIZE);
      process.stdout.write(`  Lote ${batchNum}/${totalBatches} (filas ${offset + 1}-${offset + batch.length})... `);

      const categorizaciones = await categorizarBatch(batch, diccionarioGlobal, apiKey);

      for (let j = 0; j < batch.length; j++) {
        const t = batch[j];
        const c = categorizaciones[j];
        const cat = (c?.categoria ?? t.categoria).trim() || t.categoria;
        const det = (c?.detalle ?? '').trim() || cat;
        const desc = (c?.descripcion ?? t.descripcion).trim() || t.descripcion;

        resultados.push({ ...t, categoria: cat, detalle: det, descripcion: desc });

        if (!diccionarioGlobal[cat]) diccionarioGlobal[cat] = [];
        if (det && !diccionarioGlobal[cat].includes(det)) diccionarioGlobal[cat].push(det);
      }

      console.log('✓');
    }

    // Escribir CSV limpio
    const outDir = dirname(csvPath);
    const baseName = csvPath.replace(/\.[^/.]+$/, '').split(/[/\\]/).pop() || 'transacciones';
    const outCsvPath = join(outDir, `${baseName}_limpias.csv`);
    const outDictPath = join(outDir, 'diccionario_categorias.json');

    // Headers de salida: mantener originales, agregar DETALLE si no existe
    const headersOut = [...headers];
    const idxDetalleOrig = headersOut.findIndex((h) => /^DETALLE$/i.test(h));
    if (idxDetalleOrig < 0) {
      const insertAfter = idxCategoria >= 0 ? idxCategoria + 1 : idxDescripcion >= 0 ? idxDescripcion + 1 : 0;
      headersOut.splice(insertAfter, 0, 'DETALLE');
    }

    const csvLines: string[] = [headersOut.map(escapeCsv).join(',')];
    for (const r of resultados) {
      const outRow: string[] = [];
      for (let c = 0; c < headersOut.length; c++) {
        const h = headersOut[c];
        if (/^DETALLE$/i.test(h)) {
          outRow.push(r.detalle);
        } else if (idxCategoria >= 0 && headers[idxCategoria] === h) {
          outRow.push(r.categoria);
        } else if (idxDescripcion >= 0 && headers[idxDescripcion] === h) {
          outRow.push(r.descripcion);
        } else {
          const origIdx = headers.indexOf(h);
          outRow.push(origIdx >= 0 && origIdx < r.row.length ? r.row[origIdx] ?? '' : '');
        }
      }
      csvLines.push(outRow.map(escapeCsv).join(','));
    }

    writeFileSync(outCsvPath, '\ufeff' + csvLines.join('\n'), 'utf-8');
    writeFileSync(outDictPath, JSON.stringify(diccionarioGlobal, null, 2), 'utf-8');

    const totalCats = Object.keys(diccionarioGlobal).length;
    const totalDets = Object.values(diccionarioGlobal).reduce((s, d) => s + d.length, 0);
    console.log(`\n✅ Listo.`);
    console.log(`   📄 CSV limpio: ${outCsvPath}`);
    console.log(`   📋 Diccionario: ${outDictPath}`);
    console.log(`   📂 Categorías únicas: ${totalCats} | Detalles únicos: ${totalDets}`);
  } catch (err) {
    console.error('\n❌ Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
