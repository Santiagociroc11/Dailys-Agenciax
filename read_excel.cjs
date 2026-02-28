const fs = require('fs');
let xlsx;
try {
    xlsx = require('xlsx');
} catch (e) {
    console.log("xlsx module not found. Run 'npm install xlsx' first.");
    process.exit(1);
}

const doc = xlsx.readFile('CUENTAS DINERO PRESUPUESTO1.xlsx');
doc.SheetNames.forEach(name => {
    console.log('--- SHEET:', name, '---');
    const csv = xlsx.utils.sheet_to_csv(doc.Sheets[name]);
    console.log(csv.split('\n').slice(0, 20).join('\n'));
});
