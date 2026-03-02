/**
 * Revisión INTERACTIVA de huérfanas (transacciones con categoría/detalle únicos).
 * Muestra contexto amplio, transacciones similares y aprende de tus decisiones.
 *
 * Uso: npx tsx scripts/revisar-huerfanas.ts [csv]
 *
 * Comandos:
 *   A o Enter  = Aceptar sugerencia
 *   B          = Mantener como está
 *   C,d        = Corregir (ej: "Gastos de la Agencia, Viaje")
 *   S          = Saltar (mantener, no aprender)
 *   Q          = Salir y guardar
 */
import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import * as readline from 'readline';

const APREDIZAJE_PATH = 'huerfanas_aprendizaje.json';

interface AprendizajeHuerfanas {
  /** clave "descripcion|proyecto|categoria|detalle" → { categoria, detalle } */
  decisiones: Record<string, { categoria: string; detalle: string; nota?: string }>;
}

function escapeCsv(val: string): string {
  const s = String(val ?? '').replace(/"/g, '""');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
}

function formatearMonto(v: string): string {
  const s = (v || '').trim();
  if (!s) return '-';
  return s;
}

function sugerirHuerfana(
  desc: string,
  proy: string,
  cat: string,
  det: string,
  aprendizaje: AprendizajeHuerfanas
): { categoria: string; detalle: string; razon: string } {
  const descNorm = (desc || '').toUpperCase();
  const proyNorm = (proy || '').toUpperCase();

  // Buscar decisión previa por patrón similar
  for (const [key, val] of Object.entries(aprendizaje.decisiones)) {
    const [d, p] = key.split('|');
    if (descNorm.includes((d || '').toUpperCase()) || (d || '').toUpperCase().includes(descNorm.slice(0, 20))) {
      if (!p || proyNorm.includes((p || '').toUpperCase())) {
        return { ...val, razon: `Aprendizaje previo: "${key}"` };
      }
    }
  }

  // Reglas por descripción/proyecto
  if (/PARTE\s+JERWIN|ADELANTO.*JERWIN|JERWIN.*ADELANTO/i.test(desc)) {
    return { categoria: 'REPARTICION UTILIDADES SOCIOS', detalle: 'JERWIN', razon: 'Adelanto/parte a socio Jerwin' };
  }
  if (/PLATA\s+GIORGIO|GIORGIO\s+DEUDA/i.test(desc) && /GIGI/i.test(proy)) {
    return { categoria: 'Ingresos por Proyecto', detalle: 'GIGI', razon: 'Ingreso proyecto GIGI' };
  }
  if (/TRATO\s+DANIEL|DANIEL\s+CANIZO/i.test(desc)) {
    return { categoria: 'Gastos de la Agencia', detalle: 'Trato Daniel Canizo', razon: 'Trato comercial' };
  }
  if (/COSTO\s+ANUAL\s+PAYONEER|PAYONEER/i.test(desc) && /AGENCIA/i.test(proy)) {
    return { categoria: 'Gastos de la Agencia', detalle: 'Comisiones y costos bancarios', razon: 'Costo Payoneer' };
  }
  if (/SALDO\s+INICIAL|COMPENSACION\s+INICIAL/i.test(desc) && /JSD/i.test(proy)) {
    return { categoria: 'Ingresos por Proyecto', detalle: 'JSD', razon: 'Saldo inicial JSD' };
  }
  if (/TOKECHAT|CAPTIONS|IPSTACK|UCHAT|VOIP|SENDMAILS|EASYPANEL|SUPABASE|WHATZAPPER|CHATWOOT|COCOCUT|HEYGEN|ARTLIST|PRUEBA\s+PDF|AMERICAN\s+SWIPE/i.test(desc)) {
    return { categoria: 'Software y suscripciones', detalle: det || desc.slice(0, 30), razon: 'Software' };
  }
  if (/TIKTOK\s+ADS/i.test(desc)) {
    return { categoria: 'Gastos Publicitarios', detalle: 'TikTok Ads', razon: 'Publicidad TikTok' };
  }
  if (/DANIEL\s+ADELANTO|ADELANTO.*DANIEL/i.test(desc)) {
    return { categoria: 'REPARTICION UTILIDADES SOCIOS', detalle: 'DANIEL', razon: 'Adelanto a Daniel' };
  }
  if (/PAYONEER/i.test(desc) && /AGENCIA\s+X/i.test(proy)) {
    return { categoria: 'Ingresos por Proyecto', detalle: 'AGENCIA X', razon: 'Ingreso Payoneer' };
  }
  if (/CONTRATOS|ANDRES\s+RENDON/i.test(desc)) {
    return { categoria: 'Gastos de la Agencia', detalle: 'Nómina', razon: 'Contrato freelancer' };
  }
  if (/PRESTAMO|PRÉSTAMO|miembro del equipo/i.test(desc)) {
    return { categoria: 'PRESTAMOS', detalle: proy || 'Equipo', razon: 'Préstamo a equipo' };
  }
  if (/PAGO\s+COMISIONES|COMISIONES\s+L\d/i.test(desc)) {
    return { categoria: 'Gastos de la Agencia', detalle: 'PAGOS PENDIENTES', razon: 'Pago comisiones' };
  }
  if (/UTILIDADES\s+ADRIANA|ADRIANA/i.test(desc) && /AGENCIA/i.test(proy)) {
    return { categoria: 'CORTE UTILIDADES', detalle: 'ADRIANA', razon: 'Pago utilidades a Adriana' };
  }
  if (/FIVEER|FIVER|fiverr\.com/i.test(desc)) {
    return { categoria: 'Gastos de la Agencia', detalle: 'Fiverr', razon: 'Servicio Fiverr' };
  }
  if (/MEETING\s+MANAGER|IA\s+REUNIONES/i.test(desc)) {
    return { categoria: 'Software y suscripciones', detalle: 'IA Reuniones', razon: 'Software reuniones' };
  }
  if (/INFOPRODUCTOS|UTILIDADES\s+A\s+\d/i.test(desc)) {
    return { categoria: 'CORTE UTILIDADES', detalle: 'INFOPRODUCTOS X', razon: 'Corte utilidades' };
  }
  if (/EXCEDENTE|REPARTIR/i.test(desc)) {
    return { categoria: 'CORTE UTILIDADES', detalle: 'EXCEDENTE', razon: 'Traslado excedente' };
  }
  if (/Sin descripción|Sin clasificar/i.test(desc) || !desc.trim()) {
    return { categoria: 'Sin clasificar', detalle: 'Importación', razon: 'Sin clasificar' };
  }
  if (/ELEVATECH|MENTORIA|JUANITA/i.test(desc)) {
    return { categoria: 'Gastos de la Agencia', detalle: 'CURSOS', razon: 'Mentoría' };
  }
  if (/VANGUARD|CONTADORES|CONTADOR/i.test(desc)) {
    return { categoria: 'Gastos de la Agencia', detalle: 'Servicios profesionales', razon: 'Contadores' };
  }
  if (/PLATAFORMA\s+COPY|COPY/i.test(desc)) {
    return { categoria: 'Software y suscripciones', detalle: 'Plataforma Copy', razon: 'Software copy' };
  }
  if (/DLO\*Hotmart|HOTMART/i.test(desc) && /CURSO/i.test(cat)) {
    return { categoria: 'Gastos de la Agencia', detalle: 'CURSOS', razon: 'Curso Hotmart' };
  }
  if (/LATAM|AIRLINES|VIAJE/i.test(desc)) {
    return { categoria: 'Gastos de la Agencia', detalle: 'Viaje', razon: 'Vuelo' };
  }
  if (/ABESTPDF|PDF/i.test(desc)) {
    return { categoria: 'Software y suscripciones', detalle: 'PDF', razon: 'Herramienta PDF' };
  }
  if (/GERSON|GERSSON|Payment to Gersson/i.test(desc)) {
    return { categoria: 'REPARTICION UTILIDADES SOCIOS', detalle: 'GERSSON', razon: 'Pago a Gersson' };
  }
  if (/Bancolombia|Regalo|cliente/i.test(desc)) {
    return { categoria: 'Gastos de la Agencia', detalle: 'Regalos Clientes', razon: 'Regalo cliente' };
  }

  return { categoria: cat, detalle: det, razon: 'Sin regla específica' };
}

function pregunta(rl: readline.Interface, msg: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(msg, (ans) => resolve((ans || '').trim()));
  });
}

async function main() {
  const csvPath = process.argv[2] || join(process.cwd(), 'CUENTAS DINERO PRESUPUESTO final_interactivo.csv');
  const csvText = readFileSync(csvPath, 'utf-8');
  const records = parse(csvText, { relax_column_count: true, trim: true, skip_empty_lines: true });

  const headers = records[0].map((h: string) => (h || '').trim());
  const idxFecha = headers.findIndex((h: string) => /FECHA/i.test(h || ''));
  const idxTipo = headers.findIndex((h: string) => /TIPO/i.test(h || ''));
  const idxProy = headers.findIndex((h: string) => /PROYECTO/i.test(h || ''));
  const idxDesc = headers.findIndex((h: string) => /DESCRIPCION/i.test(h || ''));
  const idxCat = headers.findIndex((h: string) => /CATEGORIA/i.test(h || ''));
  const idxDet = headers.findIndex((h: string, i: number) => i > idxCat && /^DETALLE$/i.test(h || ''));
  const idxImporte = headers.findIndex((h: string) => /IMPORTE\s*CONTABLE/i.test(h || ''));

  if (idxCat < 0 || idxDet < 0) {
    console.error('No se encontraron columnas CATEGORIA y DETALLE');
    process.exit(1);
  }

  // Contar combinaciones y encontrar huérfanas
  const combos: Record<string, number> = {};
  const filasPorCombo: Record<string, number[]> = {};
  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    const cat = (row[idxCat] || '').trim();
    const det = (row[idxDet] || '').trim();
    const key = `${cat} | ${det}`;
    combos[key] = (combos[key] || 0) + 1;
    if (!filasPorCombo[key]) filasPorCombo[key] = [];
    filasPorCombo[key].push(i);
  }

  const huerfanas = Object.entries(combos)
    .filter(([, c]) => c === 1)
    .map(([k]) => k)
    .sort();

  const filasHuerfanas: { key: string; rowIdx: number }[] = [];
  for (const [key, indices] of Object.entries(filasPorCombo)) {
    if (combos[key] === 1) filasHuerfanas.push({ key, rowIdx: indices[0] });
  }
  filasHuerfanas.sort((a, b) => a.rowIdx - b.rowIdx);

  // Cargar aprendizaje
  const outDir = dirname(csvPath);
  const aprendizajePath = join(outDir, APREDIZAJE_PATH);
  let aprendizaje: AprendizajeHuerfanas = { decisiones: {} };
  if (existsSync(aprendizajePath)) {
    aprendizaje = JSON.parse(readFileSync(aprendizajePath, 'utf-8'));
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(`
┌─────────────────────────────────────────────────────────────────────────┐
│  REVISIÓN DE HUÉRFANAS (${filasHuerfanas.length} transacciones)                          │
│                                                                         │
│  A = Aceptar sugerencia    B = Mantener    C,d = Corregir (cat, det)    │
│  S = Saltar (no aprender)  Q = Salir y guardar                          │
└─────────────────────────────────────────────────────────────────────────┘
`);

  const cambios: { rowIdx: number; categoria: string; detalle: string }[] = [];

  for (let n = 0; n < filasHuerfanas.length; n++) {
    const { key, rowIdx } = filasHuerfanas[n];
    const row = records[rowIdx];
    const fecha = idxFecha >= 0 ? row[idxFecha] : '';
    const tipo = idxTipo >= 0 ? row[idxTipo] : '';
    const proy = idxProy >= 0 ? row[idxProy] : '';
    const desc = idxDesc >= 0 ? row[idxDesc] : '';
    const cat = (row[idxCat] || '').trim();
    const det = (row[idxDet] || '').trim();

    const sug = sugerirHuerfana(desc, proy, cat, det, aprendizaje);

    // ─── Transacciones cercanas (2 antes, 2 después) ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
    const cercanas: string[] = [];
    for (let off = -2; off <= 2; off++) {
      if (off === 0) continue;
      const j = rowIdx + off;
      if (j >= 1 && j < records.length) {
        const r = records[j];
        const fc = idxFecha >= 0 ? r[idxFecha] : '';
        const pc = idxProy >= 0 ? r[idxProy] : '';
        const dc = (idxDesc >= 0 ? r[idxDesc] : '').slice(0, 50);
        const cc = (r[idxCat] || '').trim();
        const dt = (r[idxDet] || '').trim();
        cercanas.push(`  ${off > 0 ? '+' : ''}${off} | ${fc} | ${pc} | ${cc} / ${dt} | ${(r[idxDesc] || '').slice(0, 45)}${(r[idxDesc] || '').length > 45 ? '...' : ''}`);
      }
    }

    // Montos por cuenta
    const montos: string[] = [];
    for (let c = 6; c < Math.min(headers.length, 14); c++) {
      const v = (row[c] || '').trim();
      if (v) montos.push(`  ${headers[c]}: ${v}`);
    }

    // Transacciones similares (mismo proyecto O descripción similar)
    const similares: string[] = [];
    const descWords = (desc || '').toUpperCase().split(/\s+/).filter((w) => w.length > 3);
    const catWords = (cat + ' ' + det).toUpperCase().split(/\s+/).filter((w) => w.length > 2);
    for (let i = 1; i < records.length; i++) {
      if (i === rowIdx) continue;
      const r = records[i];
      const pc = (idxProy >= 0 ? r[idxProy] : '').toUpperCase();
      const dc = (idxDesc >= 0 ? r[idxDesc] : '').toUpperCase();
      const rc = (r[idxCat] || '').toUpperCase();
      const rdt = (r[idxDet] || '').toUpperCase();
      const matchProy = proy && pc.includes((proy || '').toUpperCase());
      const matchDesc = descWords.some((w) => dc.includes(w));
      const matchCat = catWords.some((w) => rc.includes(w) || rdt.includes(w));
      if ((matchProy && matchDesc) || (matchProy && matchCat) || (matchDesc && matchCat)) {
        if (similares.length < 5) {
          similares.push(`  ${r[idxFecha]} | ${r[idxProy]} | ${r[idxCat]} / ${r[idxDet]} | ${(r[idxDesc] || '').slice(0, 40)}${(r[idxDesc] || '').length > 40 ? '...' : ''}`);
        }
      }
    }

    // Todas las columnas de la fila actual (para inspección completa)
    const columnasCompletas: string[] = [];
    for (let c = 0; c < headers.length; c++) {
      const v = (row[c] || '').trim();
      if (v) columnasCompletas.push(`    ${headers[c]}: ${v.slice(0, 60)}${v.length > 60 ? '...' : ''}`);
    }

    // ─── Mostrar ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
    console.log('\n' + '═'.repeat(70));
    console.log(`  ${n + 1}/${filasHuerfanas.length}  [Fila ${rowIdx + 1}]  ${key}`);
    console.log('═'.repeat(70));
    console.log('\n  TRANSACCIÓN:');
    console.log(`    Fecha: ${fecha}  |  Tipo: ${tipo || '-'}  |  Proyecto: ${proy || '-'}`);
    console.log(`    Descripción: ${(desc || '-').slice(0, 100)}${(desc || '').length > 100 ? '...' : ''}`);
    console.log(`    Categoría: ${cat}  |  Detalle: ${det}`);
    if (montos.length > 0) {
      console.log('\n  MONTOS POR CUENTA:');
      montos.forEach((m) => console.log(m));
    }
    if (columnasCompletas.length > 0) {
      console.log('\n  TODAS LAS COLUMNAS (valores no vacíos):');
      columnasCompletas.forEach((c) => console.log(c));
    }
    if (cercanas.length > 0) {
      console.log('\n  TRANSACCIONES CERCANAS:');
      cercanas.forEach((c) => console.log(c));
    }
    if (similares.length > 0) {
      console.log('\n  SIMILARES (mismo proyecto + descripción):');
      similares.forEach((s) => console.log(s));
    }
    console.log('\n  SUGERENCIA:', sug.categoria, '/', sug.detalle);
    console.log('  Razón:', sug.razon);
    console.log('');

    const ans = await pregunta(rl, '> ');

    if (ans.toLowerCase() === 'q') {
      console.log('\nGuardando y saliendo...');
      break;
    }
    if (ans.toLowerCase() === 's') {
      continue;
    }

    let newCat = cat;
    let newDet = det;

    if (ans.toLowerCase() === 'a' || ans === '') {
      newCat = sug.categoria;
      newDet = sug.detalle;
    } else if (ans.toLowerCase() === 'b') {
      // Mantener
    } else if (ans.includes(',') && ans.length > 2) {
      const [c, d] = ans.split(',').map((x) => x.trim());
      newCat = c || cat;
      newDet = d || det;
    }

    if (newCat !== cat || newDet !== det) {
      row[idxCat] = newCat;
      row[idxDet] = newDet;
      cambios.push({ rowIdx, categoria: newCat, detalle: newDet });
    }

    // Aprender (excepto si saltó)
    if (ans.toLowerCase() !== 's' && ans.toLowerCase() !== 'q') {
      const clave = `${desc.slice(0, 60)}|${proy}`;
      aprendizaje.decisiones[clave] = { categoria: newCat, detalle: newDet };
    }
  }

  // Guardar CSV
  if (cambios.length > 0) {
    const lines = [headers.map(escapeCsv).join(',')];
    for (let i = 1; i < records.length; i++) {
      lines.push(
        records[i].map((c: string) => {
          const s = String(c ?? '');
          return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(',')
      );
    }
    const outPath = csvPath.replace(/\.csv$/i, '_revisado.csv');
    writeFileSync(outPath, '\ufeff' + lines.join('\n'), 'utf-8');
    console.log(`\n✅ ${cambios.length} cambios aplicados → ${outPath}`);
  }

  writeFileSync(aprendizajePath, JSON.stringify(aprendizaje, null, 2), 'utf-8');
  console.log(`📚 Aprendizaje guardado: ${aprendizajePath}`);
  rl.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
