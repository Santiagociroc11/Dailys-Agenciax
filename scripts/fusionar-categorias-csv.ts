/**
 * Aplica fusiones y correcciones de categorías al CSV del categorizador.
 *
 * Reglas aplicadas:
 * 1. Renombres de categoría
 * 2. Fusiones de categoría → categoría destino
 * 3. Reasignaciones por detalle (sin importar la categoría original)
 * 4. Reasignaciones por detalle dentro de GASTO NO IDENTIFICADO
 *
 * Uso: npx tsx scripts/fusionar-categorias-csv.ts [ruta_csv]
 */
import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

// ─── 1. Renombres directos de categoría ───────────────────────────────────────
// "Categoría actual" → "Categoría nueva"
// Gastos de la Agencia = coworking, viajes, comidas del equipo
const RENOMBRAR_CATEGORIA: Record<string, string> = {
  'Marketing':        'Gasto Publicitario',
  'Software':         'Software y Herramientas',
  'Suscripciones':    'Software y Herramientas',
  'Comidas a Equipo': 'Gastos de la Agencia',
  'Bienestar del Equipo': 'Gastos de la Agencia',
};

// ─── 2. Fusiones de categoría → categoría destino ────────────────────────────
// Se aplican DESPUÉS de los renombres, sobre el nombre ya renombrado
const FUSION_CATEGORIA: Record<string, string> = {
  // Huérfanas del categorizador
  'FLODESK':           'Software y Herramientas',
  'MANYCHAT':          'Software y Herramientas',
  'FB ADS':            'Gasto Publicitario',
  'CORTE UTILIDADES':  'Distribución de Utilidades',
  'RETIRO HOTMART':    'Retiros',
  '[INFOPRODUCTOS X] UTILIDADES 15 JUN': 'Distribución de Utilidades',
  'Servicios de Streaming': 'Software y Herramientas',
};

// ─── 3. Reasignaciones por detalle (en CUALQUIER categoría) ──────────────────
// Si el detalle coincide, se mueve a la categoría destino sin importar la actual
// Útil para mover LeadTracker y Adveronix que fueron mal categorizados en Gasto Publicitario o Servicios Profesionales
const REASIGNAR_DETALLE_GLOBAL: Record<string, string> = {
  // Herramientas que no son publicidad
  'LeadTracker':  'Software y Herramientas',
  'Leadtracker':  'Software y Herramientas',
  // Adveronix es agencia/proveedor de software
  'Adveronix':    'Software y Herramientas',
  'ADVERONIX LLC':'Software y Herramientas',
  // Freelancers
  'Fiverr':       'Servicios Profesionales',
  'FIVEER':       'Servicios Profesionales',
  // Coworking → Gastos de la Agencia
  'Coworking':    'Gastos de la Agencia',
  'COWORKING':    'Gastos de la Agencia',
};

// ─── 4. Reasignaciones por detalle SOLO dentro de GASTO NO IDENTIFICADO ───────
const REASIGNAR_GASTO_NO_ID: Record<string, string> = {
  'CORTE UTILIDADES':    'Distribución de Utilidades',
  'UTILIDADES GERSSON L5': 'Distribución de Utilidades',
  'Comida del equipo':   'Gastos de la Agencia',
  'COMIDA GERSSON':      'Gastos de la Agencia',
  'COMIDA EQUIPO':       'Gastos de la Agencia',
  'TRASLADO A AGENCIA X':'Transferencias Internas',
  'PAGO PRESTAMO':       'Cuentas por Pagar',
};

// ─── 5. Reasignaciones por DESCRIPCIÓN (viajes, coworking, etc.) ───────────────
// Si la descripción contiene estas palabras → mover a Gastos de la Agencia
const GASTOS_AGENCIA_KEYWORDS = /\b(viaje|coworking|comida\s+(del\s+)?equipo)\b/i;

function normKey(s: string): string {
  return (s || '').trim().toUpperCase();
}

function main() {
  const csvPath = process.argv[2] || join(process.cwd(), 'CUENTAS DINERO PRESUPUESTO final_limpias.csv');
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
  const idxCategoria = headers.findIndex((h) => /CATEGOR[IÍ]A\/DETALLE|^CATEGOR[IÍ]A$/i.test(h));
  const idxDetalle = headers.findIndex((h) => /^DETALLE$/i.test(h));
  const idxDescripcion = headers.findIndex((h) => /DESCRIPCI[OÓ]N/i.test(h));

  if (idxCategoria < 0) {
    console.error('No se encontró columna CATEGORIA');
    process.exit(1);
  }

  const stats = { renombres: 0, fusiones: 0, detalle_global: 0, detalle_gasto: 0, por_descripcion: 0 };

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    let cat = (row[idxCategoria] || '').trim();
    const det = (idxDetalle >= 0 ? (row[idxDetalle] || '').trim() : '');
    const desc = (idxDescripcion >= 0 ? (row[idxDescripcion] || '').trim() : '');

    // 0. Reasignar por descripción o detalle (viajes, coworking, comidas) → Gastos de la Agencia
    const texto = [desc, det, cat].filter(Boolean).join(' ');
    if (GASTOS_AGENCIA_KEYWORDS.test(texto)) {
      row[idxCategoria] = 'Gastos de la Agencia';
      cat = 'Gastos de la Agencia';
      // Actualizar detalle si estaba vacío, genérico o incorrecto
      if (idxDetalle >= 0) {
        const detGen = normKey(det) === 'GASTO NO IDENTIFICADO' || normKey(det) === 'PAGOS A TERCEROS' || !det;
        if (/\bviaje\b/i.test(texto)) {
          const m = texto.match(/viaje\s+(m[eé]xico|daniel|fran|mexico)/i)?.[0];
          row[idxDetalle] = m ? m.replace(/^(\w)/, (c) => c.toUpperCase()) : (/\bmexico\b/i.test(texto) ? 'Viaje México' : 'Viaje');
        } else if (/\bcoworking\b/i.test(texto)) {
          row[idxDetalle] = 'Coworking';
        } else if (detGen && /\bcomida\b/i.test(texto)) {
          row[idxDetalle] = 'Comida del equipo';
        }
      }
      stats.por_descripcion++;
    }

    // 1. Renombrar categoría
    if (RENOMBRAR_CATEGORIA[cat]) {
      row[idxCategoria] = RENOMBRAR_CATEGORIA[cat];
      cat = row[idxCategoria];
      stats.renombres++;
    }

    // 2. Fusionar categoría
    if (FUSION_CATEGORIA[cat]) {
      row[idxCategoria] = FUSION_CATEGORIA[cat];
      cat = row[idxCategoria];
      stats.fusiones++;
    }

    // 3. Reasignar por detalle global (busca sin importar categoría)
    const detalleGlobalKey = Object.keys(REASIGNAR_DETALLE_GLOBAL).find(
      (k) => normKey(k) === normKey(det)
    );
    if (detalleGlobalKey) {
      row[idxCategoria] = REASIGNAR_DETALLE_GLOBAL[detalleGlobalKey];
      cat = row[idxCategoria];
      stats.detalle_global++;
    }

    // 4. Reasignar por detalle dentro de GASTO NO IDENTIFICADO
    if (normKey(cat) === 'GASTO NO IDENTIFICADO' && det) {
      const gastoKey = Object.keys(REASIGNAR_GASTO_NO_ID).find(
        (k) => normKey(k) === normKey(det)
      );
      if (gastoKey) {
        row[idxCategoria] = REASIGNAR_GASTO_NO_ID[gastoKey];
        stats.detalle_gasto++;
      }
    }
  }

  const outDir = dirname(csvPath);
  const baseName = csvPath.replace(/\.[^/.]+$/, '').split(/[/\\]/).pop() || 'transacciones';
  const outPath = join(outDir, `${baseName}_fusionado.csv`);

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

  console.log(`\n✅ Fusiones aplicadas:`);
  console.log(`   📄 Salida: ${outPath}`);
  console.log(`   ✏️  Renombres de categoría:   ${stats.renombres}`);
  console.log(`   🔗 Fusiones de categoría:     ${stats.fusiones}`);
  console.log(`   🏷️  Reasignaciones por detalle: ${stats.detalle_global}`);
  console.log(`   🔎 Desde GASTO NO ID:          ${stats.detalle_gasto}`);
  console.log(`   📝 Por descripción (viajes/coworking): ${stats.por_descripcion}`);
}

main();
