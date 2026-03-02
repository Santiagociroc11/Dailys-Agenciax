const fs = require('fs');
const { parse } = require('csv-parse/sync');
const csv = fs.readFileSync('CUENTAS DINERO PRESUPUESTO final.csv', 'utf-8');
const rows = parse(csv, { relax_column_count: true, trim: true, skip_empty_lines: true });
const headers = rows[0];
const sample = [rows[0]];
let fb = 0, hotmart = 0;
for (let i = 1; i < rows.length; i++) {
  const cat = (rows[i][4] || '').toUpperCase();
  if (cat.includes('FACEBK') && fb < 3) { sample.push(rows[i]); fb++; }
  else if ((cat.includes('HOTMART') || cat.includes('RETIRO')) && hotmart < 3) { sample.push(rows[i]); hotmart++; }
  else if (sample.length < 25) sample.push(rows[i]);
}
function esc(c) {
  const s = String(c || '').replace(/"/g, '""');
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s + '"' : s;
}
const out = sample.map(r => r.map(esc).join(',')).join('\n');
fs.writeFileSync('test_muestra.csv', '\ufeff' + out, 'utf-8');
console.log('Filas de muestra:', sample.length - 1);
