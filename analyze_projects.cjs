const xlsx = require('xlsx');
const fs = require('fs');

const doc = xlsx.readFile('CUENTAS DINERO PRESUPUESTO1.xlsx');
const sheet = doc.Sheets['CUENTAS DINERO PRESUPUESTO1'];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

const preJune = data.slice(4, 604);
const postJune = data.slice(604);

const validProjects = new Set();
postJune.forEach(row => {
    const proj = (row[2] || '').toString().trim().toUpperCase();
    if (proj) validProjects.add(proj);
});

const problematicProjects = new Set();
const utilityRows = [];

preJune.forEach((row, index) => {
    const originalRowIndex = index + 5;
    const proj = (row[2] || '').toString().trim().toUpperCase();
    const detail = (row[4] || '').toString().trim().toUpperCase();

    if (proj && !validProjects.has(proj)) {
        problematicProjects.add(proj);
    }

    if (detail.includes('UTILIDAD') || detail.includes('REPARTO') || detail.includes('PATRIMONIO')) {
        utilityRows.push({
            rowNumber: originalRowIndex,
            project: proj,
            detail: detail,
            amountCol: row.slice(6).reduce((acc, val) => acc || val, null) ? "Banco" : "Contable"
        });
    }
});

let output = "=== PROYECTOS OBSOLETOS O A ESTANDARIZAR ===\n";
Array.from(problematicProjects).forEach(p => output += `- ${p}\n`);

output += "\n=== FILAS DE UTILIDAD / REPARTO PARA CORREGIR ===\n";
utilityRows.forEach(u => {
    output += `Fila ${u.rowNumber} | Proyecto: ${u.project} | Detalle: ${u.detail} | Usa columna: ${u.amountCol}\n`;
});

fs.writeFileSync('C:\\Users\\SantiagoCiro\\.gemini\\antigravity\\brain\\9886e649-eeb6-4ad4-b3f1-a8e128fd5643\\analysis_results.txt', output, 'utf8');
console.log("Analysis complete.");
