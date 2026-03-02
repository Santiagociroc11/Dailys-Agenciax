/**
 * Normaliza los detalles del CSV para agrupar variantes (mayúsculas, espacios, etc.)
 *
 * Aplica:
 * 1. Mapeo explícito de variantes conocidas → forma canónica
 * 2. Normalización por categoría (ej. FB ADS, FACEBK *xxx → Facebook Ads)
 *
 * Uso: npx tsx scripts/normalizar-detalles-csv.ts [ruta_csv]
 */
import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

/** Detalle original → Detalle canónico (case-sensitive para el key, se hace match normalizado) */
const MAPEO_DETALLE: Record<string, string> = {
  // Comidas a Equipo
  'COMIDA GERSSON': 'Comida del equipo',
  'COMIDA EQUIPO': 'Comida del equipo',
  'Comida de equipo': 'Comida del equipo',
  'Comida a equipo': 'Comida del equipo',

  // Suscripciones / Software - variantes de mayúsculas
  MANYCHAT: 'ManyChat',
  'Manychat (Facebook)': 'ManyChat',
  'MANYCHAT.COM': 'ManyChat',
  MAILERLITE: 'MailerLite',
  'MAILER LITE': 'MailerLite',
  CHATGPT: 'ChatGPT',
  'OPENAI *CHATGPT SUBSCR': 'ChatGPT',
  STREAMYARD: 'StreamYard',
  'STREAMYARD.COM': 'StreamYard',
  FLODESK: 'Flodesk',
  'FLODESK.COM': 'Flodesk',
  STAPE: 'Stape',
  CLAUDE: 'Claude',
  'CLAUDE.AI': 'Claude',
  'GOOGLE ONE': 'Google One',
  SENDFLOW: 'Sendflow',
  UCHAT: 'Uchat',
  SENDMAILS: 'Sendmails',

  // Software
  Leadtracker: 'LeadTracker',
  DEVZAPP: 'Devzapp',
  TOKECHAT: 'Tokechat',
  WPROCKET: 'WP Rocket',
  'WP ROCKET': 'WP Rocket',
  CAPCUT: 'CapCut',
  CAPTIONS: 'Captions',
  CURSOR: 'Cursor',
  'CURSOR, AI POWERED IDE': 'Cursor',
  GREATAPPS: 'GreatPages',
  Greatpages: 'GreatPages',
  GREATPAGES: 'GreatPages',
  BOLT: 'Bolt',
  OPENROUTER: 'OpenRouter',
  PANDAVIDEO: 'PandaVideo',
  NIFTYIMAGES: 'Nifty',
  NIFTY: 'Nifty',

  // Hosting
  HOSTINGUER: 'Hostinguer',
  HOSTINGER: 'Hostinger',
  NAMECHEAP: 'Namecheap',
  'VPS N8N agencia': 'VPS N8N',
  'VPS N8N Gersson': 'VPS N8N',
  'VPS N8N AGENCIA': 'VPS N8N',
  'VPS N8N GERSSON': 'VPS N8N',
  'VPS Hosting Gersson': 'VPS N8N',

  // Gasto Publicitario - FB Ads
  'FB ADS': 'Facebook Ads',
  'FB ADS - PRESTAMO FRAN': 'Facebook Ads',
  FACEBK: 'Facebook Ads',
  LEADTRACKER: 'LeadTracker',
  ADVERONIX: 'Adveronix',
  'GOOGLE ADS': 'Google Ads',
  'TIKTOK ADS': 'TikTok Ads',
  NINJABR: 'Ninjabr',

  // Retiros
  'RETIRO HOTMART': 'Hotmart',
  HOTMART: 'Hotmart',

  // Software y Herramientas
  MANYCHAT: 'ManyChat',

  // Distribución de Utilidades
  'CORTE UTILIDADES': 'Corte general',

  // Casing menor
  Greatpages: 'GreatPages',
};

/** Si el detalle empieza con FACEBK * → Facebook Ads */
const PREFIX_FB = /^FACEBK\s*\*|^FB\s*ADS/i;

function normalize(s: string): string {
  return (s || '').trim().toUpperCase();
}

function main() {
  const csvPath = process.argv[2] || join(process.cwd(), 'CUENTAS DINERO PRESUPUESTO final_limpias_fusionado.csv');
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

  const headers = records[0].map((h) => (h || '').trim());
  const idxDetalle = headers.findIndex((h) => /^DETALLE$/i.test(h));

  if (idxDetalle < 0) {
    console.error('No se encontró columna DETALLE');
    process.exit(1);
  }

  let normalizados = 0;

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    const det = (row[idxDetalle] || '').trim();
    if (!det) continue;

    let nuevo = MAPEO_DETALLE[det];

    if (!nuevo) {
      const key = Object.keys(MAPEO_DETALLE).find((k) => normalize(k) === normalize(det));
      if (key) nuevo = MAPEO_DETALLE[key];
    }

    if (!nuevo && PREFIX_FB.test(det)) {
      nuevo = 'Facebook Ads';
    }

    if (nuevo) {
      row[idxDetalle] = nuevo;
      normalizados++;
    }
  }

  const outDir = dirname(csvPath);
  const baseName = csvPath.replace(/\.[^/.]+$/, '').split(/[/\\]/).pop() || 'transacciones';
  const outPath = join(outDir, `${baseName}_detalles_ok.csv`);

  const output = records
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? '').replace(/"/g, '""');
          return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
        })
        .join(',')
    )
    .join('\n');

  writeFileSync(outPath, '\ufeff' + output, 'utf-8');

  console.log(`\n✅ Detalles normalizados:\n`);
  console.log(`   📄 Salida: ${outPath}`);
  console.log(`   📊 Detalles actualizados: ${normalizados}`);
}

main();
