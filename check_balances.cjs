const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);

    const entities = await mongoose.model('AcctEntity', new mongoose.Schema({ id: String, name: String }, { collection: 'acct_entities' })).find().lean();
    const entityMap = new Map(entities.map(e => [e.id, e.name]));

    const lines = await mongoose.model('AcctJournalEntryLine', new mongoose.Schema({
        account_id: String, entity_id: String, debit: Number, credit: Number, description: String
    }, { collection: 'acct_journal_entry_lines' })).find().lean();

    const accounts = await mongoose.model('AcctChartAccount', new mongoose.Schema({
        id: String, name: String, type: String
    }, { collection: 'acct_chart_accounts' })).find().lean();
    const accMap = new Map(accounts.map(a => [a.id, a]));

    let fl = 0, fl_inc = 0, fl_exp = 0, fl_eq = 0;
    let ax = 0, ax_inc = 0, ax_exp = 0, ax_eq = 0;

    for (const l of lines) {
        const acc = accMap.get(l.account_id);
        if (!acc) continue;

        const ename = entityMap.get(l.entity_id);
        if (ename === 'FONDO LIBRE') {
            if (acc.type === 'income') { fl_inc += (l.credit - l.debit); fl += (l.credit - l.debit); }
            if (acc.type === 'expense') { fl_exp += (l.debit - l.credit); fl -= (l.debit - l.credit); }
            if (acc.type === 'equity') { fl_eq += (l.credit - l.debit); }
        }
        if (ename === 'AGENCIA X') {
            if (acc.type === 'income') { ax_inc += (l.credit - l.debit); ax += (l.credit - l.debit); }
            if (acc.type === 'expense') { ax_exp += (l.debit - l.credit); ax -= (l.debit - l.credit); }
            if (acc.type === 'equity') { ax_eq += (l.credit - l.debit); }
        }
    }

    console.log('FONDO LIBRE:', { total: fl, income: fl_inc, expense: fl_exp, equity: fl_eq });
    console.log('AGENCIA X:', { total: ax, income: ax_inc, expense: ax_exp, equity: ax_eq });

    console.log("Details for Fondo Libre:");
    for (const l of lines) {
        const ename = entityMap.get(l.entity_id);
        if (ename === 'FONDO LIBRE') {
            const acc = accMap.get(l.account_id);
            if (['income', 'expense'].includes(acc.type)) {
                const amt = acc.type === 'income' ? l.credit - l.debit : -(l.debit - l.credit);
                console.log(acc.name, amt, l.description);
            }
        }
    }

    process.exit(0);
}
run().catch(console.error);
