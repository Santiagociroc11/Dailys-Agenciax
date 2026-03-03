import type { Request, Response } from 'express';
import { Router } from 'express';
import { parse } from 'csv-parse/sync';
import {
  AcctClient,
  AcctEntity,
  AcctCategory,
  AcctPaymentAccount,
  AcctTransaction,
  AcctChartAccount,
  AcctJournalEntry,
  AcctJournalEntryLine,
  AcctImportBatch,
  AuditLog,
} from '../models/index.js';

const router = Router();

const SPANISH_MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

function parseSpanishDate(str: string): Date | null {
  const m = str.trim().match(/^(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})$/i);
  if (!m) return null;
  const month = SPANISH_MONTHS[m[2].toLowerCase()];
  if (month == null) return null;
  const d = new Date(parseInt(m[3], 10), month, parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d;
}

function parseAmount(str: string): number | null {
  const s = String(str || '').trim().replace(/\s/g, '').replace(/\$/g, '').replace(/,/g, '');
  if (!s) return null;
  const neg = /^-/.test(s) || s.startsWith('-$');
  const num = parseFloat(s.replace(/^-\$?/, '').replace(/^\$?/, ''));
  if (isNaN(num)) return null;
  return neg ? -num : num;
}

// --- Clients ---
router.get('/clients', async (_req: Request, res: Response) => {
  try {
    const list = await AcctClient.find({}).sort({ sort_order: 1, name: 1 }).lean().exec();
    res.json(list);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.post('/clients', async (req: Request, res: Response) => {
  try {
    const { name, sort_order } = req.body;
    const created_by = req.body.created_by as string | undefined;
    if (!name) {
      res.status(400).json({ error: 'Falta name' });
      return;
    }
    const doc = await AcctClient.create({ name, sort_order: sort_order ?? 0 });
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_client',
        entity_id: doc.id,
        action: 'create',
        summary: `Cliente creado: ${name}`,
      });
    }
    res.status(201).json(doc.toObject ? doc.toObject() : doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.put('/clients/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, sort_order } = req.body;
    const created_by = req.body.created_by as string | undefined;
    const update: Record<string, unknown> = {};
    if (name != null) update.name = name;
    if (sort_order != null) update.sort_order = sort_order;
    const doc = await AcctClient.findOneAndUpdate(
      { id },
      Object.keys(update).length > 0 ? { $set: update } : {},
      { new: true }
    )
      .lean()
      .exec();
    if (!doc) {
      res.status(404).json({ error: 'Cliente no encontrado' });
      return;
    }
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_client',
        entity_id: id,
        action: 'update',
        summary: `Cliente actualizado: ${name}`,
      });
    }
    res.json(doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.delete('/clients/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const created_by = req.query.created_by as string | undefined;
    const count = await AcctEntity.countDocuments({ client_id: id }).exec();
    if (count > 0) {
      res.status(400).json({ error: `Hay ${count} entidades vinculadas a este cliente. Desvincula las entidades antes de eliminar.` });
      return;
    }
    const doc = await AcctClient.findOneAndDelete({ id }).lean().exec();
    if (!doc) {
      res.status(404).json({ error: 'Cliente no encontrado' });
      return;
    }
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_client',
        entity_id: id,
        action: 'delete',
        summary: `Cliente eliminado: ${(doc as { name: string }).name}`,
      });
    }
    res.json({ id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- Entities ---
router.get('/entities', async (_req: Request, res: Response) => {
  try {
    const list = await AcctEntity.find({}).sort({ sort_order: 1, name: 1 }).lean().exec();
    res.json(list);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.post('/entities', async (req: Request, res: Response) => {
  try {
    const { name, type, sort_order } = req.body;
    const created_by = req.body.created_by as string | undefined;
    if (!name || !type) {
      res.status(400).json({ error: 'Faltan name o type' });
      return;
    }
    const doc = await AcctEntity.create({ name, type, client_id: req.body.client_id ?? null, sort_order: sort_order ?? 0 });
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_entity',
        entity_id: doc.id,
        action: 'create',
        summary: `Entidad creada: ${name}`,
      });
    }
    res.status(201).json(doc.toObject ? doc.toObject() : doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.put('/entities/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, client_id, sort_order } = req.body;
    const created_by = req.body.created_by as string | undefined;
    const existing = await AcctEntity.findOne({ id }).select('id name type client_id sort_order').lean().exec();
    if (!existing) {
      res.status(404).json({ error: 'Entidad no encontrada' });
      return;
    }
    const nameNorm = (typeof name === 'string' ? name : '').trim();
    const existingName = (existing as { name: string }).name;
    const nameChanged = nameNorm && nameNorm.toLowerCase() !== existingName.toLowerCase();
    const otraConMismoNombre = nameNorm && nameChanged
      ? await AcctEntity.findOne({
          id: { $ne: id },
          name: { $regex: new RegExp(`^${nameNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        }).select('id name').lean().exec()
      : null;
    if (otraConMismoNombre) {
      const targetId = (otraConMismoNombre as { id: string }).id;
      const result = await AcctJournalEntryLine.updateMany({ entity_id: id }, { $set: { entity_id: targetId } }).exec();
      await AcctEntity.deleteOne({ id }).exec();
      if (created_by) {
        await AuditLog.create({
          user_id: created_by,
          entity_type: 'acct_entity',
          entity_id: targetId,
          action: 'merge',
          summary: `Entidad "${(existing as { name: string }).name}" renombrada y fusionada en "${name}" (${result.modifiedCount} líneas)`,
        });
      }
      const merged = await AcctEntity.findOne({ id: targetId }).lean().exec();
      return res.json({ ...merged, _merged: true, merged_count: result.modifiedCount });
    }
    const ex = existing as { name?: string; type?: string; client_id?: string | null; sort_order?: number };
    const doc = await AcctEntity.findOneAndUpdate(
      { id },
      { $set: { name: name ?? ex.name, type: type ?? ex.type, client_id: client_id !== undefined ? (client_id || null) : ex.client_id, sort_order: sort_order ?? ex.sort_order } },
      { new: true }
    )
      .lean()
      .exec();
    if (!doc) {
      res.status(404).json({ error: 'Entidad no encontrada' });
      return;
    }
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_entity',
        entity_id: id,
        action: 'update',
        summary: `Entidad actualizada: ${name}`,
      });
    }
    res.json(doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.delete('/entities/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const created_by = req.query.created_by as string | undefined;
    const count = await AcctJournalEntryLine.countDocuments({ entity_id: id }).exec();
    if (count > 0) {
      res.status(400).json({ error: `Hay ${count} línea(s) de asientos con esta entidad. Usa "Fusionar" para reasignarlas a otra entidad antes de eliminar.` });
      return;
    }
    const doc = await AcctEntity.findOneAndDelete({ id }).lean().exec();
    if (!doc) {
      res.status(404).json({ error: 'Entidad no encontrada' });
      return;
    }
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_entity',
        entity_id: id,
        action: 'delete',
        summary: `Entidad eliminada: ${(doc as { name: string }).name}`,
      });
    }
    res.json({ id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.post('/entities/:id/merge', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { target_entity_id } = req.body as { target_entity_id?: string };
    const created_by = req.body.created_by as string | undefined;
    if (!target_entity_id || target_entity_id === id) {
      res.status(400).json({ error: 'Selecciona una entidad destino diferente' });
      return;
    }
    const [source, target] = await Promise.all([
      AcctEntity.findOne({ id }).select('id name').lean().exec(),
      AcctEntity.findOne({ id: target_entity_id }).select('id name').lean().exec(),
    ]);
    if (!source) {
      res.status(404).json({ error: 'Entidad origen no encontrada' });
      return;
    }
    if (!target) {
      res.status(404).json({ error: 'Entidad destino no encontrada' });
      return;
    }
    const result = await AcctJournalEntryLine.updateMany(
      { entity_id: id },
      { $set: { entity_id: target_entity_id } }
    ).exec();
    await AcctEntity.findOneAndDelete({ id }).exec();
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_entity',
        entity_id: id,
        action: 'merge',
        summary: `Entidad "${(source as { name: string }).name}" fusionada en "${(target as { name: string }).name}" (${result.modifiedCount} transacciones)`,
      });
    }
    res.json({ merged: result.modifiedCount, deleted_entity_id: id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- Categories ---
router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const list = await AcctCategory.find({}).lean().exec();
    if (list.length === 0) return res.json([]);

    // Contar desde asientos (AcctJournalEntryLine): categoría se vincula por nombre de cuenta PUC = nombre de categoría
    const countMap = new Map<string, number>();
    const lastDateMap = new Map<string, Date>();

    for (const c of list as { id: string; name: string }[]) {
      const accIds = (await AcctChartAccount.find({ name: c.name }).select('id').lean().exec()).map((a) => (a as { id: string }).id);
      if (accIds.length === 0) {
        countMap.set(c.id, 0);
        continue;
      }
      const agg = await AcctJournalEntryLine.aggregate([
        { $match: { account_id: { $in: accIds } } },
        { $group: { _id: '$journal_entry_id' } },
        { $lookup: { from: 'acct_journal_entries', localField: '_id', foreignField: 'id', as: 'entry' } },
        { $unwind: '$entry' },
        { $group: { _id: null, count: { $sum: 1 }, lastDate: { $max: '$entry.date' } } },
      ]).exec();
      const r = agg[0] as { count: number; lastDate: Date } | undefined;
      countMap.set(c.id, r?.count ?? 0);
      if (r?.lastDate) lastDateMap.set(c.id, r.lastDate);
    }

    const enriched = (list as { id: string; name: string; type: string; parent_id?: string | null }[]).map((c) => ({
      ...c,
      transaction_count: countMap.get(c.id) ?? 0,
      last_transaction_date: lastDateMap.get(c.id) ?? null,
    }));
    enriched.sort((a, b) => {
      const da = (a as { last_transaction_date?: Date | null }).last_transaction_date?.getTime() ?? 0;
      const db = (b as { last_transaction_date?: Date | null }).last_transaction_date?.getTime() ?? 0;
      return db - da;
    });
    res.json(enriched.map(({ last_transaction_date, ...rest }) => rest));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.post('/categories', async (req: Request, res: Response) => {
  try {
    const { name, type, parent_id } = req.body;
    const created_by = req.body.created_by as string | undefined;
    if (!name || !type) {
      res.status(400).json({ error: 'Faltan name o type' });
      return;
    }
    const doc = await AcctCategory.create({ name, type, parent_id: parent_id ?? null });
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_category',
        entity_id: doc.id,
        action: 'create',
        summary: `Categoría creada: ${name}`,
      });
    }
    res.status(201).json(doc.toObject ? doc.toObject() : doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.put('/categories/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, parent_id } = req.body;
    const created_by = req.body.created_by as string | undefined;
    const existing = await AcctCategory.findOne({ id }).select('id name type parent_id').lean().exec();
    if (!existing) {
      res.status(404).json({ error: 'Categoría no encontrada' });
      return;
    }
    const nameNorm = (typeof name === 'string' ? name : '').trim();
    const existingName = (existing as { name: string }).name;
    const nameChanged = nameNorm && nameNorm.toLowerCase() !== existingName.toLowerCase();
    const otraConMismoNombre = nameNorm && nameChanged
      ? await AcctCategory.findOne({
          id: { $ne: id },
          name: { $regex: new RegExp(`^${nameNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        }).select('id name').lean().exec()
      : null;
    if (otraConMismoNombre) {
      const targetId = (otraConMismoNombre as { id: string }).id;
      const targetCat = await AcctCategory.findOne({ id: targetId }).select('name').lean().exec();
      const result = targetCat
        ? await AcctChartAccount.updateMany({ name: (existing as { name: string }).name }, { $set: { name: (targetCat as { name: string }).name } }).exec()
        : { modifiedCount: 0 };
      await AcctCategory.deleteOne({ id }).exec();
      if (created_by) {
        await AuditLog.create({
          user_id: created_by,
          entity_type: 'acct_category',
          entity_id: targetId,
          action: 'merge',
          summary: `Categoría "${(existing as { name: string }).name}" renombrada y fusionada en "${name}" (${result.modifiedCount} cuentas)`,
        });
      }
      const merged = await AcctCategory.findOne({ id: targetId }).lean().exec();
      return res.json({ ...merged, _merged: true, merged_count: result.modifiedCount });
    }
    const doc = await AcctCategory.findOneAndUpdate(
      { id },
      { $set: { name: name ?? existingName, type: type ?? (existing as { type?: string }).type, parent_id: parent_id !== undefined ? (parent_id ?? null) : (existing as { parent_id?: string | null }).parent_id } },
      { new: true }
    )
      .lean()
      .exec();
    if (!doc) {
      res.status(404).json({ error: 'Categoría no encontrada' });
      return;
    }
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_category',
        entity_id: id,
        action: 'update',
        summary: `Categoría actualizada: ${name}`,
      });
    }
    res.json(doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.delete('/categories/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const created_by = req.query.created_by as string | undefined;
    const cat = await AcctCategory.findOne({ id }).select('name').lean().exec();
    const count = cat ? await AcctChartAccount.countDocuments({ name: (cat as { name: string }).name }).exec() : 0;
    if (count > 0) {
      res.status(400).json({ error: `Hay ${count} cuenta(s) contable(s) con este nombre. Usa "Fusionar" para reasignarlas antes de eliminar.` });
      return;
    }
    const doc = await AcctCategory.findOneAndDelete({ id }).lean().exec();
    if (!doc) {
      res.status(404).json({ error: 'Categoría no encontrada' });
      return;
    }
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_category',
        entity_id: id,
        action: 'delete',
        summary: `Categoría eliminada: ${(doc as { name: string }).name}`,
      });
    }
    res.json({ id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.post('/categories/:id/merge', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { target_category_id } = req.body as { target_category_id?: string };
    const created_by = req.body.created_by as string | undefined;
    if (!target_category_id || target_category_id === id) {
      res.status(400).json({ error: 'Selecciona una categoría destino diferente' });
      return;
    }
    const [source, target] = await Promise.all([
      AcctCategory.findOne({ id }).select('id name').lean().exec(),
      AcctCategory.findOne({ id: target_category_id }).select('id name').lean().exec(),
    ]);
    if (!source) {
      res.status(404).json({ error: 'Categoría origen no encontrada' });
      return;
    }
    if (!target) {
      res.status(404).json({ error: 'Categoría destino no encontrada' });
      return;
    }
    const result = await AcctChartAccount.updateMany(
      { name: (source as { name: string }).name },
      { $set: { name: (target as { name: string }).name } }
    ).exec();
    await AcctCategory.findOneAndDelete({ id }).exec();
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_category',
        entity_id: id,
        action: 'merge',
        summary: `Categoría "${(source as { name: string }).name}" fusionada en "${(target as { name: string }).name}" (${result.modifiedCount} cuentas)`,
      });
    }
    res.json({ merged: result.modifiedCount, deleted_category_id: id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- Payment Accounts ---
router.get('/payment-accounts', async (_req: Request, res: Response) => {
  try {
    const list = await AcctPaymentAccount.find({}).sort({ name: 1 }).lean().exec();
    res.json(list);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.post('/payment-accounts', async (req: Request, res: Response) => {
  try {
    const { name, currency } = req.body;
    const created_by = req.body.created_by as string | undefined;
    if (!name) {
      res.status(400).json({ error: 'Falta name' });
      return;
    }
    const doc = await AcctPaymentAccount.create({ name, currency: currency ?? 'USD' });
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_payment_account',
        entity_id: doc.id,
        action: 'create',
        summary: `Cuenta de pago creada: ${name}`,
      });
    }
    res.status(201).json(doc.toObject ? doc.toObject() : doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.put('/payment-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, currency } = req.body;
    const created_by = req.body.created_by as string | undefined;
    const doc = await AcctPaymentAccount.findOneAndUpdate(
      { id },
      { $set: { name, currency: currency ?? 'USD' } },
      { new: true }
    )
      .lean()
      .exec();
    if (!doc) {
      res.status(404).json({ error: 'Cuenta no encontrada' });
      return;
    }
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_payment_account',
        entity_id: id,
        action: 'update',
        summary: `Cuenta actualizada: ${name}`,
      });
    }
    res.json(doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.delete('/payment-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const created_by = req.query.created_by as string | undefined;
    const doc = await AcctPaymentAccount.findOneAndDelete({ id }).lean().exec();
    if (!doc) {
      res.status(404).json({ error: 'Cuenta no encontrada' });
      return;
    }
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_payment_account',
        entity_id: id,
        action: 'delete',
        summary: `Cuenta eliminada: ${(doc as { name: string }).name}`,
      });
    }
    res.json({ id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- Ledger lines (Libro mayor desde asientos) ---
router.get('/ledger-lines', async (req: Request, res: Response) => {
  try {
    const { start, end, entity_id, account_id, client_id, category_id } = req.query;
    const entryFilter: Record<string, unknown> = {};
    if (start && end) {
      entryFilter.date = { $gte: new Date(start as string), $lte: new Date(end as string) };
    } else if (start) {
      entryFilter.date = { $gte: new Date(start as string) };
    } else if (end) {
      entryFilter.date = { $lte: new Date(end as string) };
    }
    const entryMatch = Object.keys(entryFilter).length > 0
      ? await AcctJournalEntry.find(entryFilter).select('id date description reference').lean().exec()
      : await AcctJournalEntry.find({}).select('id date description reference').lean().exec();
    const entryIds = (entryMatch as { id: string }[]).map((e) => e.id);
    const entryMap = new Map((entryMatch as { id: string; date: Date; description?: string; reference?: string }[]).map((e) => [e.id, e]));

    if (entryIds.length === 0) {
      return res.json([]);
    }

    const lineFilter: Record<string, unknown> = { journal_entry_id: { $in: entryIds } };
    if (entity_id !== undefined && entity_id !== null && entity_id !== '') {
      if (entity_id === '__null__' || entity_id === 'null') {
        lineFilter.entity_id = null;
      } else {
        lineFilter.entity_id = entity_id;
      }
    }
    if (account_id) lineFilter.account_id = account_id;
    if (category_id && typeof category_id === 'string') {
      const cat = await AcctCategory.findOne({ id: category_id }).select('name').lean().exec();
      if (cat) {
        const accIds = (await AcctChartAccount.find({ name: (cat as { name: string }).name }).select('id').lean().exec()).map((a) => (a as { id: string }).id);
        if (accIds.length > 0) lineFilter.account_id = { $in: accIds };
      }
    }
    if (client_id && typeof client_id === 'string' && (entity_id === undefined || entity_id === null || entity_id === '')) {
      const entityIds = (await AcctEntity.find({ client_id }).select('id').lean().exec()).map((e) => (e as { id: string }).id);
      if (entityIds.length === 0) return res.json([]);
      lineFilter.entity_id = { $in: entityIds };
    }

    const lines = await AcctJournalEntryLine.find(lineFilter).sort({ journal_entry_id: -1 }).lean().exec();
    const accountIds = [...new Set((lines as { account_id: string }[]).map((l) => l.account_id))];
    const entityIds = [...new Set((lines as { entity_id?: string | null }[]).map((l) => l.entity_id).filter(Boolean))];
    const accounts = accountIds.length > 0 ? await AcctChartAccount.find({ id: { $in: accountIds } }).select('id code name type').lean().exec() : [];
    const entities = entityIds.length > 0 ? await AcctEntity.find({ id: { $in: entityIds } }).select('id name').lean().exec() : [];
    const accountMap = new Map((accounts as { id: string; code: string; name: string; type: string }[]).map((a) => [a.id, a]));
    const entityMap = new Map((entities as { id: string; name: string }[]).map((e) => [e.id, e.name]));

    const enriched = (lines as { id: string; journal_entry_id: string; account_id: string; entity_id?: string | null; debit: number; credit: number; description?: string; currency?: string }[]).map((l) => {
      const entry = entryMap.get(l.journal_entry_id);
      const acc = accountMap.get(l.account_id);
      return {
        id: l.id,
        journal_entry_id: l.journal_entry_id,
        date: entry?.date,
        description: l.description || entry?.description || '',
        reference: entry?.reference,
        account_id: l.account_id,
        account_code: acc?.code ?? '',
        account_name: acc?.name ?? '',
        account_type: acc?.type ?? '',
        entity_id: l.entity_id,
        entity_name: l.entity_id ? entityMap.get(l.entity_id) ?? null : null,
        debit: l.debit,
        credit: l.credit,
        currency: l.currency ?? 'USD',
      };
    });
    enriched.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });
    res.json(enriched);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- P&G Cell Lines: registros que componen una celda del P&G Matrix ---
router.get('/pyg-cell-lines', async (req: Request, res: Response) => {
  try {
    const { start, end, entity_id, client_id, pyg_group } = req.query;
    if (!start || !end || !pyg_group || !['A', 'B', 'C'].includes(pyg_group as string)) {
      return res.status(400).json({ error: 'Requiere start, end y pyg_group (A|B|C)' });
    }
    const entryIds = (await AcctJournalEntry.find({
      date: { $gte: new Date(start as string), $lte: new Date(end as string) },
    })
      .select('id date description reference')
      .lean()
      .exec()) as { id: string; date?: Date; description?: string; reference?: string }[];
    const eids = entryIds.map((e) => e.id);
    const entryMap = new Map(entryIds.map((e) => [e.id, e]));
    if (eids.length === 0) return res.json([]);

    const excludedIds = (await AcctChartAccount.find({ name: { $regex: TRASLADO_UTILIDADES_REGEX } }).select('id').lean().exec()).map((a) => (a as { id: string }).id);

    const groupMatch: Record<string, unknown> =
      pyg_group === 'A'
        ? { 'acc.type': 'income' }
        : pyg_group === 'B'
          ? { 'acc.type': 'expense', 'acc.code': { $regex: /^[56]/ }, entity_id: { $ne: null } }
          : { 'acc.type': 'expense', 'acc.code': { $regex: /^[56]/ }, $or: [{ entity_id: null }, { entity_id: { $exists: false } }] };

    let entityFilter: Record<string, unknown> = {};
    if (client_id && typeof client_id === 'string') {
      const ids = (await AcctEntity.find({ client_id }).select('id').lean().exec()).map((e) => (e as { id: string }).id);
      if (ids.length === 0) return res.json([]);
      entityFilter = { entity_id: { $in: ids } };
    } else if (entity_id !== undefined && entity_id !== null && entity_id !== '') {
      if (entity_id === '__null__' || entity_id === 'null') {
        entityFilter = { entity_id: null };
      } else {
        entityFilter = { entity_id: entity_id as string };
      }
    }

    const pipeline: Record<string, unknown>[] = [
      { $match: { journal_entry_id: { $in: eids } } },
      { $lookup: { from: 'acct_chart_accounts', localField: 'account_id', foreignField: 'id', as: 'acc' } },
      { $unwind: '$acc' },
      { $match: { 'acc.type': { $in: ['income', 'expense'] } } },
      ...(excludedIds.length > 0 ? [{ $match: { account_id: { $nin: excludedIds } } }] : []),
      { $match: groupMatch },
      ...(Object.keys(entityFilter).length > 0 ? [{ $match: entityFilter }] : []),
    ];

    const raw = await AcctJournalEntryLine.aggregate(pipeline as object[]).exec();
    const accountIds = [...new Set((raw as { account_id: string }[]).map((l) => l.account_id))];
    const entityIds = [...new Set((raw as { entity_id?: string | null }[]).map((l) => l.entity_id).filter(Boolean))];
    const accounts = accountIds.length > 0 ? await AcctChartAccount.find({ id: { $in: accountIds } }).select('id code name type').lean().exec() : [];
    const entities = entityIds.length > 0 ? await AcctEntity.find({ id: { $in: entityIds } }).select('id name').lean().exec() : [];
    const accountMap = new Map((accounts as { id: string; code: string; name: string; type: string }[]).map((a) => [a.id, a]));
    const entityMap = new Map((entities as { id: string; name: string }[]).map((e) => [e.id, e.name]));

    const enriched = (raw as { id: string; journal_entry_id: string; account_id: string; entity_id?: string | null; debit: number; credit: number; description?: string; currency?: string }[]).map((l) => {
      const entry = entryMap.get(l.journal_entry_id);
      const acc = accountMap.get(l.account_id);
      return {
        id: l.id,
        journal_entry_id: l.journal_entry_id,
        date: entry?.date,
        description: l.description || entry?.description || '',
        reference: entry?.reference,
        account_id: l.account_id,
        account_code: acc?.code ?? '',
        account_name: acc?.name ?? '',
        account_type: acc?.type ?? '',
        entity_id: l.entity_id,
        entity_name: l.entity_id ? entityMap.get(l.entity_id) ?? null : null,
        debit: l.debit,
        credit: l.credit,
        currency: l.currency ?? 'USD',
      };
    });
    enriched.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });
    res.json(enriched);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- Transactions (deprecado: usar ledger-lines) - mantiene compatibilidad para merge/delete de entidades/categorías ---
router.get('/transactions', async (_req: Request, res: Response) => {
  try {
    res.json([]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.post('/transactions', async (req: Request, res: Response) => {
  try {
    const { date, amount, currency, type, entity_id, category_id, payment_account_id, description } = req.body;
    const created_by = req.body.created_by as string | undefined;
    if (!date || amount == null || !type || !payment_account_id) {
      res.status(400).json({ error: 'Faltan date, amount, type o payment_account_id' });
      return;
    }
    const doc = await AcctTransaction.create({
      date: new Date(date),
      amount: Number(amount),
      currency: currency ?? 'USD',
      type,
      entity_id: entity_id ?? null,
      category_id: category_id ?? null,
      payment_account_id,
      description: description ?? '',
      created_by: created_by ?? null,
    });
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_transaction',
        entity_id: doc.id,
        action: 'create',
        summary: `Transacción creada: ${amount} ${currency ?? 'USD'}`,
      });
    }
    res.status(201).json(doc.toObject ? doc.toObject() : doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.put('/transactions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date, amount, currency, type, entity_id, category_id, payment_account_id, description } = req.body;
    const created_by = req.body.created_by as string | undefined;
    const update: Record<string, unknown> = {};
    if (date != null) update.date = new Date(date);
    if (amount != null) update.amount = Number(amount);
    if (currency != null) update.currency = currency;
    if (type != null) update.type = type;
    if (entity_id !== undefined) update.entity_id = entity_id ?? null;
    if (category_id !== undefined) update.category_id = category_id ?? null;
    if (payment_account_id != null) update.payment_account_id = payment_account_id;
    if (description !== undefined) update.description = description ?? '';
    const doc = await AcctTransaction.findOneAndUpdate({ id }, { $set: update }, { new: true })
      .lean()
      .exec();
    if (!doc) {
      res.status(404).json({ error: 'Transacción no encontrada' });
      return;
    }
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_transaction',
        entity_id: id,
        action: 'update',
        summary: `Transacción actualizada: ${amount}`,
      });
    }
    res.json(doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.delete('/transactions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const created_by = req.query.created_by as string | undefined;
    const doc = await AcctTransaction.findOneAndDelete({ id }).lean().exec();
    if (!doc) {
      res.status(404).json({ error: 'Transacción no encontrada' });
      return;
    }
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_transaction',
        entity_id: id,
        action: 'delete',
        summary: `Transacción eliminada`,
      });
    }
    res.json({ id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

function normCurrency(c: string): 'USD' | 'COP' {
  return (c || 'USD').toUpperCase() === 'COP' ? 'COP' : 'USD';
}

// --- Balance (desde asientos: resultado por entidad = ingresos - gastos) ---
// Con ?liquidacion=1 resta las distribuciones (créditos a cuentas Utilidades por entidad) para mostrar saldo pendiente de liquidar
router.get('/balance', async (req: Request, res: Response) => {
  try {
    const { start, end, liquidacion } = req.query;
    const entryMatch: Record<string, unknown> = {};
    if (start && end) {
      entryMatch.date = { $gte: new Date(start as string), $lte: new Date(end as string) };
    } else if (start) {
      entryMatch.date = { $gte: new Date(start as string) };
    } else if (end) {
      entryMatch.date = { $lte: new Date(end as string) };
    }
    const entryIds = Object.keys(entryMatch).length > 0
      ? (await AcctJournalEntry.find(entryMatch).select('id').lean().exec()).map((e) => (e as { id: string }).id)
      : (await AcctJournalEntry.find({}).select('id').lean().exec()).map((e) => (e as { id: string }).id);
    if (entryIds.length === 0) {
      return res.json({ rows: [], total_usd: 0, total_cop: 0 });
    }

    const pipeline = [
      { $match: { journal_entry_id: { $in: entryIds } } },
      { $lookup: { from: 'acct_chart_accounts', localField: 'account_id', foreignField: 'id', as: 'acc' } },
      { $unwind: '$acc' },
      { $match: { 'acc.type': { $in: ['income', 'expense'] } } },
      {
        $addFields: {
          amount: {
            $cond: [
              { $eq: ['$acc.type', 'income'] },
              { $subtract: ['$credit', '$debit'] },
              { $subtract: [0, { $subtract: ['$debit', '$credit'] }] },
            ],
          },
        },
      },
      { $group: { _id: { entity_id: '$entity_id', currency: '$currency' }, total_amount: { $sum: '$amount' } } },
    ];
    const results = await AcctJournalEntryLine.aggregate(pipeline).exec();
    const entityIds = [...new Set((results as { _id: { entity_id: string | null } }[]).map((r) => r._id.entity_id).filter(Boolean))];
    const entities = entityIds.length > 0
      ? await AcctEntity.find({ id: { $in: entityIds } }).select('id name type').lean().exec()
      : [];
    const entityMap = new Map(
      (entities as { id: string; name: string; type: string }[]).map((e) => [e.id, { name: e.name, type: e.type }])
    );

    const rowMap = new Map<string, { entity_id: string | null; entity_name: string; entity_type: string | null; usd: number; cop: number }>();
    for (const r of results as { _id: { entity_id: string | null; currency: string }; total_amount: number }[]) {
      const eid = r._id.entity_id;
      const key = eid ?? 'null';
      const cur = normCurrency(r._id.currency || 'USD');
      const amt = Math.round(r.total_amount * 100) / 100;
      if (!rowMap.has(key)) {
        rowMap.set(key, {
          entity_id: eid,
          entity_name: eid ? (entityMap.get(eid)?.name ?? 'Sin asignar') : 'Sin asignar',
          entity_type: eid ? (entityMap.get(eid)?.type ?? null) : null,
          usd: 0,
          cop: 0,
        });
      }
      const row = rowMap.get(key)!;
      if (cur === 'COP') row.cop += amt;
      else row.usd += amt;
    }
    if (liquidacion === '1' || liquidacion === 'true') {
      const equityAccounts = await AcctChartAccount.find({ type: 'equity', name: { $regex: /^Utilidades\s+/i } }).select('id name').lean().exec();
      const equityIds = (equityAccounts as { id: string }[]).map((a) => a.id);
      if (equityIds.length > 0) {
        const distPipeline = [
          { $match: { journal_entry_id: { $in: entryIds }, account_id: { $in: equityIds } } },
          { $group: { _id: { entity_id: '$entity_id', currency: '$currency' }, credit: { $sum: '$credit' } } },
        ];
        const distResults = await AcctJournalEntryLine.aggregate(distPipeline).exec();
        for (const d of distResults as { _id: { entity_id: string | null; currency: string }; credit: number }[]) {
          const eid = d._id.entity_id;
          const key = eid ?? 'null';
          const cur = normCurrency(d._id.currency || 'USD');
          const amt = Math.round(d.credit * 100) / 100;
          if (rowMap.has(key)) {
            const row = rowMap.get(key)!;
            if (cur === 'COP') row.cop -= amt;
            else row.usd -= amt;
          }
        }
      }
    }
    const rows = Array.from(rowMap.values()).sort((a, b) => (b.usd + b.cop) - (a.usd + a.cop));
    const totalUsd = rows.reduce((acc, r) => acc + r.usd, 0);
    const totalCop = rows.reduce((acc, r) => acc + r.cop, 0);

    res.json({ rows, total_usd: Math.round(totalUsd * 100) / 100, total_cop: Math.round(totalCop * 100) / 100 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- P&G (Pérdidas y Ganancias) por proyecto ---
// Excluye traslados de utilidades para que el resultado operativo de cada proyecto sea visible
const TRASLADO_UTILIDADES_REGEX = /traslado.*utilidad|utilidad.*traslado|traslado\s+utilidades|^utilidades\s|utilidades\s+[a-z0-9]/i;

// --- P&G Matrix (layout horizontal: columnas = proyectos, filas = conceptos) ---
// Grupos: A=Ingresos (4xx), B=Costos Directos (5xx/6xx con entity_id), C=Gastos Indirectos (5xx/6xx sin entity_id)
router.get('/pyg-matrix', async (req: Request, res: Response) => {
  try {
    const { start, end, entity_ids, projects_only } = req.query;
    const entryMatch: Record<string, unknown> = {};
    if (start && end) {
      entryMatch.date = { $gte: new Date(start as string), $lte: new Date(end as string) };
    } else if (start) {
      entryMatch.date = { $gte: new Date(start as string) };
    } else if (end) {
      entryMatch.date = { $lte: new Date(end as string) };
    }
    const entryIds = Object.keys(entryMatch).length > 0
      ? (await AcctJournalEntry.find(entryMatch).select('id').lean().exec()).map((e) => (e as { id: string }).id)
      : (await AcctJournalEntry.find({}).select('id').lean().exec()).map((e) => (e as { id: string }).id);

    if (entryIds.length === 0) {
      return res.json({
        columns: [],
        rows: [],
        total_column: null,
      });
    }

    const excludedAccountIds = (await AcctChartAccount.find({ name: { $regex: TRASLADO_UTILIDADES_REGEX } }).select('id').lean().exec())
      .map((a) => (a as { id: string }).id);

    let entityFilter: string[] | null = null;
    if (entity_ids && typeof entity_ids === 'string') {
      entityFilter = entity_ids.split(',').map((s) => s.trim()).filter(Boolean);
    }

    const pipeline: Record<string, unknown>[] = [
      { $match: { journal_entry_id: { $in: entryIds } } },
      { $lookup: { from: 'acct_chart_accounts', localField: 'account_id', foreignField: 'id', as: 'acc' } },
      { $unwind: '$acc' },
      { $match: { 'acc.type': { $in: ['income', 'expense'] } } },
    ];
    if (excludedAccountIds.length > 0) {
      pipeline.push({ $match: { account_id: { $nin: excludedAccountIds } } });
    }
    if (entityFilter && entityFilter.length > 0) {
      pipeline.push({ $match: { $or: [{ entity_id: { $in: entityFilter } }, { entity_id: null }] } });
    }
    pipeline.push({
      $addFields: {
        codeFirst: { $substr: [{ $ifNull: ['$acc.code', '0'] }, 0, 1] },
        amount_income: { $cond: [{ $eq: ['$acc.type', 'income'] }, { $subtract: ['$credit', '$debit'] }, 0] },
        amount_expense: { $cond: [{ $eq: ['$acc.type', 'expense'] }, { $subtract: ['$debit', '$credit'] }, 0] },
      },
    });
    pipeline.push({
      $addFields: {
        group: {
          $cond: [
            { $eq: ['$acc.type', 'income'] },
            'A',
            {
              $cond: [
                { $and: [{ $in: ['$codeFirst', ['5', '6']] }, { $ne: ['$entity_id', null] }] },
                'B',
                { $cond: [{ $in: ['$codeFirst', ['5', '6']] }, 'C', 'B'] },
          ],
        },
      ],
        },
      },
    });
    pipeline.push({
      $group: {
        _id: { entity_id: '$entity_id', currency: '$currency', group: '$group' },
        amount: { $sum: { $add: ['$amount_income', '$amount_expense'] } },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await AcctJournalEntryLine.aggregate(pipeline as any[]).exec();

    const entityIds = [...new Set((results as { _id: { entity_id: string | null } }[]).map((r) => r._id.entity_id).filter(Boolean))];
    const entities = entityIds.length > 0
      ? await AcctEntity.find({ id: { $in: entityIds } }).select('id name type').lean().exec()
      : [];
    const entityMap = new Map(
      (entities as { id: string; name: string; type: string }[]).map((e) => [e.id, { name: e.name, type: e.type }])
    );

    const projectsOnlyFilter = projects_only === 'true';
    const columns: { id: string; name: string; type: string | null }[] = [];
    const entityIdsOrdered = entityIds.filter((eid) => {
      const ent = entityMap.get(eid);
      if (projectsOnlyFilter && ent?.type !== 'project') return false;
      return true;
    });
    for (const eid of entityIdsOrdered) {
      const ent = entityMap.get(eid);
      columns.push({ id: eid, name: ent?.name ?? 'Sin nombre', type: ent?.type ?? null });
    }
    columns.push({ id: '__null__', name: 'No asignado', type: null });
    columns.push({ id: '__total__', name: 'TOTAL', type: null });

    const colKeys = [...entityIdsOrdered, '__null__', '__total__'];
    const dataMap = new Map<string, Record<string, { usd: number; cop: number }>>();
    for (const col of colKeys) {
      dataMap.set(col, { A: { usd: 0, cop: 0 }, B: { usd: 0, cop: 0 }, C: { usd: 0, cop: 0 } });
    }

    for (const r of results as { _id: { entity_id: string | null; currency: string; group: string }; amount: number }[]) {
      const eid = r._id.entity_id;
      const col = eid ?? '__null__';
      if (!colKeys.includes(col)) continue;
      const cur = normCurrency(r._id.currency || 'USD');
      const amt = Math.round(r.amount * 100) / 100;
      const row = dataMap.get(col)!;
      const g = (r._id.group || 'B') as 'A' | 'B' | 'C';
      if (cur === 'COP') row[g].cop += amt;
      else row[g].usd += amt;

      const totalRow = dataMap.get('__total__')!;
      if (cur === 'COP') totalRow[g].cop += amt;
      else totalRow[g].usd += amt;
    }

    const conceptRows = [
      { key: 'ingresos', label: '(+) Ingresos Operacionales', group: 'A' as const },
      { key: 'costos_directos', label: '(-) Costos Directos', group: 'B' as const },
      { key: 'utilidad_bruta', label: '(=) UTILIDAD BRUTA', computed: (col: string) => {
        const d = dataMap.get(col)!;
        return { usd: d.A.usd - d.B.usd, cop: d.A.cop - d.B.cop };
      }},
      { key: 'margen_bruto_pct', label: 'Margen Bruto (%)', computed: (col: string) => {
        const d = dataMap.get(col)!;
        const ingUsd = d.A.usd;
        const ubUsd = d.A.usd - d.B.usd;
        const ingCop = d.A.cop;
        const ubCop = d.A.cop - d.B.cop;
        const pctUsd = ingUsd !== 0 ? Math.round((ubUsd / ingUsd) * 10000) / 100 : 0;
        const pctCop = ingCop !== 0 ? Math.round((ubCop / ingCop) * 10000) / 100 : 0;
        return { usd: pctUsd, cop: pctCop };
      }},
      { key: 'gastos_indirectos', label: '(-) Gastos Operativos', group: 'C' as const },
      { key: 'utilidad_operativa', label: '(=) UTILIDAD OPERATIVA', computed: (col: string) => {
        const d = dataMap.get(col)!;
        return { usd: d.A.usd - d.B.usd - d.C.usd, cop: d.A.cop - d.B.cop - d.C.cop };
      }},
      { key: 'margen_operativo_pct', label: 'Margen Operativo (%)', computed: (col: string) => {
        const d = dataMap.get(col)!;
        const ingUsd = d.A.usd;
        const uoUsd = d.A.usd - d.B.usd - d.C.usd;
        const ingCop = d.A.cop;
        const uoCop = d.A.cop - d.B.cop - d.C.cop;
        const pctUsd = ingUsd !== 0 ? Math.round((uoUsd / ingUsd) * 10000) / 100 : 0;
        const pctCop = ingCop !== 0 ? Math.round((uoCop / ingCop) * 10000) / 100 : 0;
        return { usd: pctUsd, cop: pctCop };
      }},
    ];

    const rows = conceptRows.map((cr) => {
      const cells: Record<string, { usd: number; cop: number }> = {};
      for (const col of colKeys) {
        if ('group' in cr && cr.group) {
          cells[col] = { ...dataMap.get(col)![cr.group] };
        } else if ('computed' in cr && cr.computed) {
          cells[col] = cr.computed(col);
        } else {
          cells[col] = { usd: 0, cop: 0 };
        }
      }
      return { key: cr.key, label: cr.label, cells };
    });

    res.json({
      columns,
      rows,
      col_keys: colKeys,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- P&G Matrix por Cliente (misma estructura, columnas = clientes) ---
router.get('/pyg-matrix-by-client', async (req: Request, res: Response) => {
  try {
    const { start, end, client_ids } = req.query;
    const entryMatch: Record<string, unknown> = {};
    if (start && end) {
      entryMatch.date = { $gte: new Date(start as string), $lte: new Date(end as string) };
    } else if (start) {
      entryMatch.date = { $gte: new Date(start as string) };
    } else if (end) {
      entryMatch.date = { $lte: new Date(end as string) };
    }
    const entryIds = Object.keys(entryMatch).length > 0
      ? (await AcctJournalEntry.find(entryMatch).select('id').lean().exec()).map((e) => (e as { id: string }).id)
      : (await AcctJournalEntry.find({}).select('id').lean().exec()).map((e) => (e as { id: string }).id);

    if (entryIds.length === 0) {
      return res.json({ columns: [], rows: [], col_keys: [] });
    }

    const excludedAccountIds = (await AcctChartAccount.find({ name: { $regex: TRASLADO_UTILIDADES_REGEX } }).select('id').lean().exec())
      .map((a) => (a as { id: string }).id);

    const pipeline: Record<string, unknown>[] = [
      { $match: { journal_entry_id: { $in: entryIds } } },
      { $lookup: { from: 'acct_chart_accounts', localField: 'account_id', foreignField: 'id', as: 'acc' } },
      { $unwind: '$acc' },
      { $match: { 'acc.type': { $in: ['income', 'expense'] } } },
      { $lookup: { from: 'acct_entities', localField: 'entity_id', foreignField: 'id', as: 'entity' } },
      { $addFields: { client_id: { $ifNull: [{ $arrayElemAt: ['$entity.client_id', 0] }, '__null__'] } } },
    ];
    if (excludedAccountIds.length > 0) {
      pipeline.push({ $match: { account_id: { $nin: excludedAccountIds } } });
    }
    let clientFilter: string[] | null = null;
    if (client_ids && typeof client_ids === 'string') {
      clientFilter = client_ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (clientFilter.length > 0) {
        pipeline.push({ $match: { $or: [{ client_id: { $in: clientFilter } }, { client_id: '__null__' }] } });
      }
    }
    pipeline.push({
      $addFields: {
        codeFirst: { $substr: [{ $ifNull: ['$acc.code', '0'] }, 0, 1] },
        amount_income: { $cond: [{ $eq: ['$acc.type', 'income'] }, { $subtract: ['$credit', '$debit'] }, 0] },
        amount_expense: { $cond: [{ $eq: ['$acc.type', 'expense'] }, { $subtract: ['$debit', '$credit'] }, 0] },
      },
    });
    pipeline.push({
      $addFields: {
        group: {
          $cond: [
            { $eq: ['$acc.type', 'income'] },
            'A',
            { $cond: [{ $and: [{ $in: ['$codeFirst', ['5', '6']] }, { $ne: ['$entity_id', null] }] }, 'B', { $cond: [{ $in: ['$codeFirst', ['5', '6']] }, 'C', 'B'] }] },
          ],
        },
      },
    });
    pipeline.push({
      $group: {
        _id: { client_id: '$client_id', currency: '$currency', group: '$group' },
        amount: { $sum: { $add: ['$amount_income', '$amount_expense'] } },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await AcctJournalEntryLine.aggregate(pipeline as any[]).exec();

    const clientIds = [...new Set((results as { _id: { client_id: string } }[]).map((r) => r._id.client_id).filter((id) => id && id !== '__null__'))];
    const clients = clientIds.length > 0
      ? await AcctClient.find({ id: { $in: clientIds } }).select('id name').lean().exec()
      : [];
    const clientMap = new Map((clients as { id: string; name: string }[]).map((c) => [c.id, c.name]));

    const columns: { id: string; name: string }[] = clientIds.map((cid) => ({ id: cid, name: clientMap.get(cid) ?? 'Sin nombre' }));
    columns.push({ id: '__null__', name: 'No asignado' });
    columns.push({ id: '__total__', name: 'TOTAL' });

    const colKeys = [...clientIds, '__null__', '__total__'];
    const dataMap = new Map<string, Record<string, { usd: number; cop: number }>>();
    for (const col of colKeys) {
      dataMap.set(col, { A: { usd: 0, cop: 0 }, B: { usd: 0, cop: 0 }, C: { usd: 0, cop: 0 } });
    }

    for (const r of results as { _id: { client_id: string; currency: string; group: string }; amount: number }[]) {
      const cid = r._id.client_id === '__null__' ? '__null__' : r._id.client_id;
      if (!colKeys.includes(cid)) continue;
      const cur = normCurrency(r._id.currency || 'USD');
      const amt = Math.round(r.amount * 100) / 100;
      const g = (r._id.group || 'B') as 'A' | 'B' | 'C';
      const row = dataMap.get(cid)!;
      if (cur === 'COP') row[g].cop += amt;
      else row[g].usd += amt;
      const totalRow = dataMap.get('__total__')!;
      if (cur === 'COP') totalRow[g].cop += amt;
      else totalRow[g].usd += amt;
    }

    const conceptRows = [
      { key: 'ingresos', label: '(+) Ingresos Operacionales', group: 'A' as const },
      { key: 'costos_directos', label: '(-) Costos Directos', group: 'B' as const },
      { key: 'utilidad_bruta', label: '(=) UTILIDAD BRUTA', computed: (col: string) => { const d = dataMap.get(col)!; return { usd: d.A.usd - d.B.usd, cop: d.A.cop - d.B.cop }; }},
      { key: 'margen_bruto_pct', label: 'Margen Bruto (%)', computed: (col: string) => { const d = dataMap.get(col)!; const ingUsd = d.A.usd, ubUsd = d.A.usd - d.B.usd, ingCop = d.A.cop, ubCop = d.A.cop - d.B.cop; return { usd: ingUsd !== 0 ? Math.round((ubUsd / ingUsd) * 10000) / 100 : 0, cop: ingCop !== 0 ? Math.round((ubCop / ingCop) * 10000) / 100 : 0 }; }},
      { key: 'gastos_indirectos', label: '(-) Gastos Operativos', group: 'C' as const },
      { key: 'utilidad_operativa', label: '(=) UTILIDAD OPERATIVA', computed: (col: string) => { const d = dataMap.get(col)!; return { usd: d.A.usd - d.B.usd - d.C.usd, cop: d.A.cop - d.B.cop - d.C.cop }; }},
      { key: 'margen_operativo_pct', label: 'Margen Operativo (%)', computed: (col: string) => { const d = dataMap.get(col)!; const ingUsd = d.A.usd, uoUsd = d.A.usd - d.B.usd - d.C.usd, ingCop = d.A.cop, uoCop = d.A.cop - d.B.cop - d.C.cop; return { usd: ingUsd !== 0 ? Math.round((uoUsd / ingUsd) * 10000) / 100 : 0, cop: ingCop !== 0 ? Math.round((uoCop / ingCop) * 10000) / 100 : 0 }; }},
    ];

    const rows = conceptRows.map((cr) => {
      const cells: Record<string, { usd: number; cop: number }> = {};
      for (const col of colKeys) {
        if ('group' in cr && cr.group) cells[col] = { ...dataMap.get(col)![cr.group] };
        else if ('computed' in cr && cr.computed) cells[col] = cr.computed(col);
        else cells[col] = { usd: 0, cop: 0 };
      }
      return { key: cr.key, label: cr.label, cells };
    });

    res.json({ columns, rows, col_keys: colKeys });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.get('/pyg', async (req: Request, res: Response) => {
  try {
    const { start, end, client_id } = req.query;
    const entryMatch: Record<string, unknown> = {};
    if (start && end) {
      entryMatch.date = { $gte: new Date(start as string), $lte: new Date(end as string) };
    } else if (start) {
      entryMatch.date = { $gte: new Date(start as string) };
    } else if (end) {
      entryMatch.date = { $lte: new Date(end as string) };
    }
    const entryIds = Object.keys(entryMatch).length > 0
      ? (await AcctJournalEntry.find(entryMatch).select('id').lean().exec()).map((e) => (e as { id: string }).id)
      : (await AcctJournalEntry.find({}).select('id').lean().exec()).map((e) => (e as { id: string }).id);

    if (entryIds.length === 0) {
      return res.json({
        rows: [],
        total_usd: { ingresos: 0, gastos: 0, resultado: 0 },
        total_cop: { ingresos: 0, gastos: 0, resultado: 0 },
      });
    }

    let entityFilter: string[] | null = null;
    if (client_id && typeof client_id === 'string') {
      entityFilter = (await AcctEntity.find({ client_id }).select('id').lean().exec()).map((e) => (e as { id: string }).id);
      if (entityFilter.length === 0) {
        return res.json({
          rows: [],
          total_usd: { ingresos: 0, gastos: 0, resultado: 0 },
          total_cop: { ingresos: 0, gastos: 0, resultado: 0 },
        });
      }
    }

    const excludedAccountIds = (await AcctChartAccount.find({ name: { $regex: TRASLADO_UTILIDADES_REGEX } }).select('id').lean().exec())
      .map((a) => (a as { id: string }).id);

    const pipeline: Record<string, unknown>[] = [
      { $match: { journal_entry_id: { $in: entryIds } } },
      { $lookup: { from: 'acct_chart_accounts', localField: 'account_id', foreignField: 'id', as: 'acc' } },
      { $unwind: '$acc' },
      { $match: { 'acc.type': { $in: ['income', 'expense'] } } },
    ];
    if (excludedAccountIds.length > 0) {
      pipeline.push({ $match: { account_id: { $nin: excludedAccountIds } } });
    }
    if (entityFilter) {
      pipeline.push({ $match: { entity_id: { $in: entityFilter } } });
    }
    pipeline.push({
      $group: {
        _id: { entity_id: '$entity_id', currency: '$currency' },
        ingresos: { $sum: { $cond: [{ $eq: ['$acc.type', 'income'] }, { $subtract: ['$credit', '$debit'] }, 0] } },
        gastos: { $sum: { $cond: [{ $eq: ['$acc.type', 'expense'] }, { $subtract: ['$debit', '$credit'] }, 0] } },
      },
    });
    pipeline.push({ $addFields: { resultado: { $subtract: ['$ingresos', '$gastos'] } } });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await AcctJournalEntryLine.aggregate(pipeline as any[]).exec();
    const entityIds = [...new Set((results as { _id: { entity_id: string | null } }[]).map((r) => r._id.entity_id).filter(Boolean))];
    const entities = entityIds.length > 0
      ? await AcctEntity.find({ id: { $in: entityIds } }).select('id name type').lean().exec()
      : [];
    const entityMap = new Map(
      (entities as { id: string; name: string; type: string }[]).map((e) => [e.id, { name: e.name, type: e.type }])
    );

    const rowMap = new Map<string, { entity_id: string | null; entity_name: string; entity_type: string | null; usd: { ingresos: number; gastos: number; resultado: number }; cop: { ingresos: number; gastos: number; resultado: number } }>();
    for (const r of results as { _id: { entity_id: string | null; currency: string }; ingresos: number; gastos: number; resultado: number }[]) {
      const eid = r._id.entity_id;
      const key = eid ?? 'null';
      const cur = normCurrency(r._id.currency || 'USD');
      const ing = Math.round(r.ingresos * 100) / 100;
      const gas = Math.round(r.gastos * 100) / 100;
      const res = Math.round(r.resultado * 100) / 100;
      if (!rowMap.has(key)) {
        rowMap.set(key, {
          entity_id: eid,
          entity_name: eid ? (entityMap.get(eid)?.name ?? 'Sin asignar') : 'Sin asignar',
          entity_type: eid ? (entityMap.get(eid)?.type ?? null) : null,
          usd: { ingresos: 0, gastos: 0, resultado: 0 },
          cop: { ingresos: 0, gastos: 0, resultado: 0 },
        });
      }
      const row = rowMap.get(key)!;
      const c = cur === 'COP' ? row.cop : row.usd;
      c.ingresos += ing;
      c.gastos += gas;
      c.resultado += res;
    }
    let rows = Array.from(rowMap.values()).map((r) => ({
      ...r,
      usd: { ingresos: Math.round(r.usd.ingresos * 100) / 100, gastos: Math.round(r.usd.gastos * 100) / 100, resultado: Math.round(r.usd.resultado * 100) / 100 },
      cop: { ingresos: Math.round(r.cop.ingresos * 100) / 100, gastos: Math.round(r.cop.gastos * 100) / 100, resultado: Math.round(r.cop.resultado * 100) / 100 },
    }));

    const projectsOnly = req.query.projects_only === 'true';
    if (projectsOnly) {
      rows = rows.filter((r) => r.entity_type === 'project');
    }

    rows.sort((a, b) => (b.usd.resultado + b.cop.resultado) - (a.usd.resultado + a.cop.resultado));

    const totalUsd = { ingresos: rows.reduce((a, r) => a + r.usd.ingresos, 0), gastos: rows.reduce((a, r) => a + r.usd.gastos, 0), resultado: rows.reduce((a, r) => a + r.usd.resultado, 0) };
    const totalCop = { ingresos: rows.reduce((a, r) => a + r.cop.ingresos, 0), gastos: rows.reduce((a, r) => a + r.cop.gastos, 0), resultado: rows.reduce((a, r) => a + r.cop.resultado, 0) };

    res.json({
      rows,
      total_usd: { ingresos: Math.round(totalUsd.ingresos * 100) / 100, gastos: Math.round(totalUsd.gastos * 100) / 100, resultado: Math.round(totalUsd.resultado * 100) / 100 },
      total_cop: { ingresos: Math.round(totalCop.ingresos * 100) / 100, gastos: Math.round(totalCop.gastos * 100) / 100, resultado: Math.round(totalCop.resultado * 100) / 100 },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- P&G por cliente ---
router.get('/pyg-by-client', async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;
    const entryMatch: Record<string, unknown> = {};
    if (start && end) {
      entryMatch.date = { $gte: new Date(start as string), $lte: new Date(end as string) };
    } else if (start) {
      entryMatch.date = { $gte: new Date(start as string) };
    } else if (end) {
      entryMatch.date = { $lte: new Date(end as string) };
    }
    const entryIds = Object.keys(entryMatch).length > 0
      ? (await AcctJournalEntry.find(entryMatch).select('id').lean().exec()).map((e) => (e as { id: string }).id)
      : (await AcctJournalEntry.find({}).select('id').lean().exec()).map((e) => (e as { id: string }).id);

    if (entryIds.length === 0) {
      return res.json({
        rows: [],
        total_usd: { ingresos: 0, gastos: 0, resultado: 0 },
        total_cop: { ingresos: 0, gastos: 0, resultado: 0 },
      });
    }

    const excludedAccountIds = (await AcctChartAccount.find({ name: { $regex: TRASLADO_UTILIDADES_REGEX } }).select('id').lean().exec())
      .map((a) => (a as { id: string }).id);

    const pipeline: Record<string, unknown>[] = [
      { $match: { journal_entry_id: { $in: entryIds } } },
      { $lookup: { from: 'acct_chart_accounts', localField: 'account_id', foreignField: 'id', as: 'acc' } },
      { $unwind: '$acc' },
      { $match: { 'acc.type': { $in: ['income', 'expense'] } } },
    ];
    if (excludedAccountIds.length > 0) {
      pipeline.push({ $match: { account_id: { $nin: excludedAccountIds } } });
    }
    pipeline.push({
      $lookup: { from: 'acct_entities', localField: 'entity_id', foreignField: 'id', as: 'entity' },
    });
    pipeline.push({
      $addFields: {
        client_id: { $ifNull: [{ $arrayElemAt: ['$entity.client_id', 0] }, '__no_client__'] },
      },
    });
    pipeline.push({
      $group: {
        _id: { client_id: '$client_id', currency: '$currency' },
        ingresos: { $sum: { $cond: [{ $eq: ['$acc.type', 'income'] }, { $subtract: ['$credit', '$debit'] }, 0] } },
        gastos: { $sum: { $cond: [{ $eq: ['$acc.type', 'expense'] }, { $subtract: ['$debit', '$credit'] }, 0] } },
      },
    });
    pipeline.push({ $addFields: { resultado: { $subtract: ['$ingresos', '$gastos'] } } });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await AcctJournalEntryLine.aggregate(pipeline as any[]).exec();
    const clientIds = [...new Set((results as { _id: { client_id: string } }[]).map((r) => r._id.client_id).filter((id) => id && id !== '__no_client__'))];
    const clients = clientIds.length > 0
      ? await AcctClient.find({ id: { $in: clientIds } }).select('id name').lean().exec()
      : [];
    const clientMap = new Map(
      (clients as { id: string; name: string }[]).map((c) => [c.id, c.name])
    );

    const rowMap = new Map<string, { client_id: string | null; client_name: string; usd: { ingresos: number; gastos: number; resultado: number }; cop: { ingresos: number; gastos: number; resultado: number } }>();
    for (const r of results as { _id: { client_id: string; currency: string }; ingresos: number; gastos: number; resultado: number }[]) {
      const cid = r._id.client_id === '__no_client__' ? null : r._id.client_id;
      const key = cid ?? '__no_client__';
      const cur = normCurrency(r._id.currency || 'USD');
      const ing = Math.round(r.ingresos * 100) / 100;
      const gas = Math.round(r.gastos * 100) / 100;
      const res = Math.round(r.resultado * 100) / 100;
      if (!rowMap.has(key)) {
        rowMap.set(key, {
          client_id: cid,
          client_name: cid ? (clientMap.get(cid) ?? 'Sin asignar') : 'Sin cliente',
          usd: { ingresos: 0, gastos: 0, resultado: 0 },
          cop: { ingresos: 0, gastos: 0, resultado: 0 },
        });
      }
      const row = rowMap.get(key)!;
      const c = cur === 'COP' ? row.cop : row.usd;
      c.ingresos += ing;
      c.gastos += gas;
      c.resultado += res;
    }
    let rows = Array.from(rowMap.values()).map((r) => ({
      ...r,
      usd: { ingresos: Math.round(r.usd.ingresos * 100) / 100, gastos: Math.round(r.usd.gastos * 100) / 100, resultado: Math.round(r.usd.resultado * 100) / 100 },
      cop: { ingresos: Math.round(r.cop.ingresos * 100) / 100, gastos: Math.round(r.cop.gastos * 100) / 100, resultado: Math.round(r.cop.resultado * 100) / 100 },
    }));

    rows.sort((a, b) => (b.usd.resultado + b.cop.resultado) - (a.usd.resultado + a.cop.resultado));

    const totalUsd = { ingresos: rows.reduce((a, r) => a + r.usd.ingresos, 0), gastos: rows.reduce((a, r) => a + r.usd.gastos, 0), resultado: rows.reduce((a, r) => a + r.usd.resultado, 0) };
    const totalCop = { ingresos: rows.reduce((a, r) => a + r.cop.ingresos, 0), gastos: rows.reduce((a, r) => a + r.cop.gastos, 0), resultado: rows.reduce((a, r) => a + r.cop.resultado, 0) };

    res.json({
      rows,
      total_usd: { ingresos: Math.round(totalUsd.ingresos * 100) / 100, gastos: Math.round(totalUsd.gastos * 100) / 100, resultado: Math.round(totalUsd.resultado * 100) / 100 },
      total_cop: { ingresos: Math.round(totalCop.ingresos * 100) / 100, gastos: Math.round(totalCop.gastos * 100) / 100, resultado: Math.round(totalCop.resultado * 100) / 100 },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- Balance de cuentas (ubicación del dinero, desde asientos: cuentas tipo asset) ---
router.get('/account-balances', async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;
    const entryMatch: Record<string, unknown> = {};
    if (start && end) {
      entryMatch.date = { $gte: new Date(start as string), $lte: new Date(end as string) };
    } else if (start) {
      entryMatch.date = { $gte: new Date(start as string) };
    } else if (end) {
      entryMatch.date = { $lte: new Date(end as string) };
    }
    const entryIds = Object.keys(entryMatch).length > 0
      ? (await AcctJournalEntry.find(entryMatch).select('id').lean().exec()).map((e) => (e as { id: string }).id)
      : (await AcctJournalEntry.find({}).select('id').lean().exec()).map((e) => (e as { id: string }).id);

    if (entryIds.length === 0) {
      return res.json({ rows: [], total_usd: 0, total_cop: 0 });
    }

    const pipeline = [
      { $match: { journal_entry_id: { $in: entryIds } } },
      { $lookup: { from: 'acct_chart_accounts', localField: 'account_id', foreignField: 'id', as: 'acc' } },
      { $unwind: '$acc' },
      { $match: { 'acc.type': 'asset' } },
      {
        $group: {
          _id: { account_id: '$account_id', currency: '$currency' },
          total_amount: { $sum: { $subtract: ['$debit', '$credit'] } },
        },
      },
    ];
    const results = await AcctJournalEntryLine.aggregate(pipeline).exec();
    const accountIds = [...new Set((results as { _id: { account_id: string } }[]).map((r) => r._id.account_id).filter(Boolean))];
    const accounts = accountIds.length > 0
      ? await AcctChartAccount.find({ id: { $in: accountIds } }).select('id name').lean().exec()
      : [];
    const accountMap = new Map(
      (accounts as { id: string; name: string }[]).map((a) => [a.id, { name: a.name }])
    );

    const rowMap = new Map<string, { payment_account_id: string; account_name: string; usd: number; cop: number }>();
    for (const r of results as { _id: { account_id: string; currency: string }; total_amount: number }[]) {
      const aid = r._id.account_id;
      const cur = normCurrency(r._id.currency || 'USD');
      const amt = Math.round(r.total_amount * 100) / 100;
      if (!rowMap.has(aid)) {
        rowMap.set(aid, {
          payment_account_id: aid,
          account_name: accountMap.get(aid)?.name ?? 'Cuenta desconocida',
          usd: 0,
          cop: 0,
        });
      }
      const row = rowMap.get(aid)!;
      if (cur === 'COP') row.cop += amt;
      else row.usd += amt;
    }
    const rows = Array.from(rowMap.values()).sort((a, b) => (b.usd + b.cop) - (a.usd + a.cop));
    const totalUsd = rows.reduce((acc, r) => acc + r.usd, 0);
    const totalCop = rows.reduce((acc, r) => acc + r.cop, 0);

    res.json({ rows, total_usd: Math.round(totalUsd * 100) / 100, total_cop: Math.round(totalCop * 100) / 100 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- Balance General (jerarquía PUC: 1xxx Activos, 2xxx Pasivos, 3xxx Patrimonio) ---
// Incluye Utilidad del Ejercicio en Patrimonio para que cuadre
router.get('/balance-general', async (req: Request, res: Response) => {
  try {
    const { end } = req.query;
    const entryMatch: Record<string, unknown> = {};
    if (end) {
      entryMatch.date = { $lte: new Date(end as string) };
    }
    const entryIds = Object.keys(entryMatch).length > 0
      ? (await AcctJournalEntry.find(entryMatch).select('id').lean().exec()).map((e) => (e as { id: string }).id)
      : (await AcctJournalEntry.find({}).select('id').lean().exec()).map((e) => (e as { id: string }).id);

    if (entryIds.length === 0) {
      return res.json({
        activos: [],
        pasivos: [],
        patrimonio: [],
        utilidad_ejercicio: { usd: 0, cop: 0 },
        total_activos: { usd: 0, cop: 0 },
        total_pasivos_patrimonio: { usd: 0, cop: 0 },
        cuadra: true,
      });
    }

    const pipeline = [
      { $match: { journal_entry_id: { $in: entryIds } } },
      { $lookup: { from: 'acct_chart_accounts', localField: 'account_id', foreignField: 'id', as: 'acc' } },
      { $unwind: '$acc' },
      {
        $group: {
          _id: { account_id: '$account_id', code: '$acc.code', name: '$acc.name', type: '$acc.type' },
          debit_usd: { $sum: { $cond: [{ $or: [{ $eq: ['$currency', 'USD'] }, { $eq: ['$currency', null] }, { $eq: ['$currency', ''] }] }, '$debit', 0] } },
          credit_usd: { $sum: { $cond: [{ $or: [{ $eq: ['$currency', 'USD'] }, { $eq: ['$currency', null] }, { $eq: ['$currency', ''] }] }, '$credit', 0] } },
          debit_cop: { $sum: { $cond: [{ $eq: ['$currency', 'COP'] }, '$debit', 0] } },
          credit_cop: { $sum: { $cond: [{ $eq: ['$currency', 'COP'] }, '$credit', 0] } },
        },
      },
    ];
    const results = await AcctJournalEntryLine.aggregate(pipeline).exec();

    const activos: { code: string; name: string; usd: number; cop: number }[] = [];
    const pasivos: { code: string; name: string; usd: number; cop: number }[] = [];
    const patrimonio: { code: string; name: string; usd: number; cop: number }[] = [];
    let utilidadUsd = 0;
    let utilidadCop = 0;

    for (const r of results as { _id: { account_id: string; code: string; name: string; type: string }; debit_usd: number; credit_usd: number; debit_cop: number; credit_cop: number }[]) {
      const code = r._id.code || '0';
      const first = code.charAt(0);
      let balUsd = 0;
      let balCop = 0;
      if (r._id.type === 'asset') {
        balUsd = r.debit_usd - r.credit_usd;
        balCop = r.debit_cop - r.credit_cop;
      } else if (r._id.type === 'liability' || r._id.type === 'equity') {
        balUsd = r.credit_usd - r.debit_usd;
        balCop = r.credit_cop - r.debit_cop;
      } else if (r._id.type === 'income') {
        utilidadUsd += r.credit_usd - r.debit_usd;
        utilidadCop += r.credit_cop - r.debit_cop;
        continue;
      } else if (r._id.type === 'expense') {
        utilidadUsd -= r.debit_usd - r.credit_usd;
        utilidadCop -= r.debit_cop - r.credit_cop;
        continue;
      } else {
        continue;
      }
      const row = { code: r._id.code, name: r._id.name, usd: Math.round(balUsd * 100) / 100, cop: Math.round(balCop * 100) / 100 };
      if (first === '1') activos.push(row);
      else if (first === '2') pasivos.push(row);
      else if (first === '3') patrimonio.push(row);
    }

    patrimonio.push({
      code: '36xx',
      name: 'Utilidad del Ejercicio (Ingresos - Gastos)',
      usd: Math.round(utilidadUsd * 100) / 100,
      cop: Math.round(utilidadCop * 100) / 100,
    });

    const sum = (arr: { usd: number; cop: number }[]) => ({
      usd: arr.reduce((s, x) => s + x.usd, 0),
      cop: arr.reduce((s, x) => s + x.cop, 0),
    });
    const totalActivos = sum(activos);
    const totalPasivos = sum(pasivos);
    const totalPatrimonio = sum(patrimonio);
    const totalPasivosPatrimonio = {
      usd: totalPasivos.usd + totalPatrimonio.usd,
      cop: totalPasivos.cop + totalPatrimonio.cop,
    };
    const cuadra =
      Math.abs(totalActivos.usd - totalPasivosPatrimonio.usd) < 0.02 &&
      Math.abs(totalActivos.cop - totalPasivosPatrimonio.cop) < 0.02;

    res.json({
      activos,
      pasivos,
      patrimonio,
      utilidad_ejercicio: { usd: Math.round(utilidadUsd * 100) / 100, cop: Math.round(utilidadCop * 100) / 100 },
      total_activos: totalActivos,
      total_pasivos_patrimonio: totalPasivosPatrimonio,
      cuadra,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- Import CSV Preview (sin crear registros) ---
interface ImportPreviewItem {
  rowIndex: number;
  fecha: string;
  tipo: 'ingreso' | 'gasto' | 'traslado_bancos' | 'traslado_utilidades' | 'reparto';
  proyecto: string;
  descripcion: string;
  concepto?: string;
  cuenta?: string;
  monto: number;
  currency: string;
  explicacion: string;
}

router.post('/import/preview', async (req: Request, res: Response) => {
  try {
    const { csv_text, default_currency = 'USD' } = req.body as { csv_text?: string; default_currency?: string };
    if (!csv_text || typeof csv_text !== 'string') {
      res.status(400).json({ error: 'Falta csv_text' });
      return;
    }

    const records = parse(csv_text, { relax_column_count: true, trim: true, skip_empty_lines: true }) as string[][];
    if (records.length < 2) {
      res.status(400).json({ error: 'CSV vacío o sin datos' });
      return;
    }

    let headerRow = 0;
    for (let i = 0; i < Math.min(10, records.length); i++) {
      const row = records[i];
      const first = (row[0] || '').toUpperCase();
      const hasProyecto = row.some((c) => (c || '').toUpperCase().includes('PROYECTO'));
      if (first.includes('FECHA') || hasProyecto) {
        headerRow = i;
        break;
      }
    }

    const headers = records[headerRow].map((h) => (h || '').trim());
    const idxFecha = headers.findIndex((h) => /FECHA/i.test(h));
    const idxProyecto = headers.findIndex((h) => /PROYECTO/i.test(h));
    const idxSubcategoria = headers.findIndex((h) => /SUBCATEGORIA/i.test(h));
    let idxDescripcion = headers.findIndex((h) => /DESCRIPCI[OÓ]N/i.test(h));
    if (idxDescripcion < 0) idxDescripcion = headers.findIndex((h) => /NOTA|CONCEPTO|OBSERVACI[OÓ]N/i.test(h));
    let idxCategoria = headers.findIndex((h) => /CATEGOR[IÍ]A\/DETALLE|^CATEGOR[IÍ]A$/i.test(h));
    if (idxCategoria < 0) idxCategoria = headers.findIndex((h) => /^DETALLE$/i.test(h));
    const idxDetalle = headers.findIndex((h, i) => i !== idxCategoria && /^DETALLE$/i.test((h || '').trim()));
    const idxImporteContable = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
    const idxTipo = headers.findIndex((h) => /TIPO/i.test(h));

    if (idxFecha < 0 || idxProyecto < 0) {
      res.status(400).json({ error: 'CSV debe tener columnas FECHA y PROYECTO' });
      return;
    }

    const accountColStart = idxImporteContable >= 0 ? idxImporteContable + 1 : 7;
    const accountHeaders = headers.slice(accountColStart).filter((h) => h && !/^\s*$/.test(h));

    const preview: ImportPreviewItem[] = [];
    let skipped = 0;
    let skipNext = false;
    const COP_RE_PREVIEW = /BANCOLOMBIA|DAVIVIENDA|NEQUI\s*COP/i;
    const previewCurrency = (acctName: string, amt: number): string => {
      if (COP_RE_PREVIEW.test(acctName)) return 'COP';
      if (amt > 100000) return 'COP';
      return default_currency;
    };

    for (let i = headerRow + 1; i < records.length; i++) {
      if (skipNext) {
        skipNext = false;
        continue;
      }
      const row = records[i];
      const fechaStr = (row[idxFecha] || '').trim();
      let proyectoStr = (row[idxProyecto] || '').trim();
      const tipoStr = (idxTipo >= 0 ? (row[idxTipo] || '') : '').trim();
      const rawCategoria = (idxCategoria >= 0 ? (row[idxCategoria] || '').trim() : '');
      const rawDetalle = (idxDetalle >= 0 ? (row[idxDetalle] || '').trim() : '');
      const descripcion = ((idxDescripcion >= 0 ? (row[idxDescripcion] || '').trim() : '') || rawCategoria).trim() || 'Sin descripción';
      const subcategoria = (idxSubcategoria >= 0 ? (row[idxSubcategoria] || '').trim() : '');

      let catForAccount = (subcategoria && rawCategoria && subcategoria !== rawCategoria)
        ? `${subcategoria} (${rawCategoria})`
        : (subcategoria || rawCategoria || 'Importación');
      let detForAccount = rawDetalle;
      const categoryName = detForAccount ? `${catForAccount} - ${detForAccount}` : catForAccount;

      if (proyectoStr === 'TRASLADO') proyectoStr = 'AGENCIA X';
      if (proyectoStr === 'RETIRO HOTMART') proyectoStr = 'HOTMART';

      const tipoForzado = /SALIDA/i.test(tipoStr) && !/CONTABLE/i.test(tipoStr) ? 'gasto'
        : /INGRESO/i.test(tipoStr) && !/CONTABLE/i.test(tipoStr) ? 'ingreso' : null;

      const date = parseSpanishDate(fechaStr);
      if (!date) {
        skipped++;
        continue;
      }

      const accountAmounts: { accountName: string; amount: number }[] = [];
      for (let c = 0; c < accountHeaders.length; c++) {
        const cell = (row[accountColStart + c] || '').trim();
        const amount = parseAmount(cell);
        if (amount == null || amount === 0) continue;
        const accountName = accountHeaders[c];
        if (!accountName) continue;
        accountAmounts.push({ accountName, amount: Math.round(amount * 100) / 100 });
      }

      const isReparto = /REPARTO|REPARTICI[OÓ]N/i.test(rawCategoria) || /REPARTO|REPARTICI[OÓ]N/i.test(descripcion);
      const totalSum = accountAmounts.reduce((s, a) => s + a.amount, 0);
      const totalAbs = accountAmounts.reduce((s, a) => s + Math.abs(a.amount), 0);
      const isTrasladoBancos = accountAmounts.length >= 2 && (
        Math.abs(totalSum) < 0.02 || (totalAbs > 0 && Math.abs(totalSum) / totalAbs < 0.005)
      );
      if (isTrasladoBancos) {
        const currency = accountAmounts.some((a) => COP_RE_PREVIEW.test(a.accountName) || Math.abs(a.amount) > 100000) ? 'COP' : default_currency;
        const cuentas = accountAmounts.map((a) => `${a.accountName}: ${a.amount > 0 ? '+' : ''}${a.amount}`).join(' ↔ ');
        preview.push({
          rowIndex: i + 1,
          fecha: fechaStr,
          tipo: 'traslado_bancos',
          proyecto: proyectoStr,
          descripcion,
          monto: 0,
          currency,
          explicacion: `Traslado entre cuentas de banco (no es ingreso ni gasto): ${cuentas}`,
        });
      } else if (accountAmounts.length === 1) {
        const { accountName, amount } = accountAmounts[0];
        const amt = Math.abs(amount);
        const currency = previewCurrency(accountName, amt);
        const isExpense = tipoForzado === 'gasto' || (tipoForzado == null && amount < 0);
        if (isReparto) {
          preview.push({
            rowIndex: i + 1,
            fecha: fechaStr,
            tipo: 'reparto',
            proyecto: proyectoStr,
            descripcion,
            cuenta: accountName,
            concepto: categoryName,
            monto: amt,
            currency,
            explicacion: `Pago a socio/colaborador desde utilidades (no es gasto operativo)`,
          });
        } else {
          const tipo = isExpense ? 'gasto' : 'ingreso';
          preview.push({
            rowIndex: i + 1,
            fecha: fechaStr,
            tipo,
            proyecto: proyectoStr,
            descripcion,
            cuenta: accountName,
            concepto: categoryName,
            monto: amt,
            currency,
            explicacion: isExpense
              ? `Gasto: sale dinero de ${accountName} por ${categoryName}`
              : `Ingreso: entra dinero a ${accountName} por ${categoryName}`,
          });
        }
      } else if (accountAmounts.length > 1 && !isTrasladoBancos) {
        for (const { accountName, amount } of accountAmounts) {
          const amt = Math.abs(amount);
          const currency = previewCurrency(accountName, amt);
          const isExpense = tipoForzado === 'gasto' || (tipoForzado == null && amount < 0);
          if (isReparto) {
            preview.push({
              rowIndex: i + 1,
              fecha: fechaStr,
              tipo: 'reparto',
              proyecto: proyectoStr,
              descripcion,
              cuenta: accountName,
              concepto: categoryName,
              monto: amt,
              currency,
              explicacion: `Pago a socio desde utilidades`,
            });
          } else {
            const tipo = isExpense ? 'gasto' : 'ingreso';
            preview.push({
              rowIndex: i + 1,
              fecha: fechaStr,
              tipo,
              proyecto: proyectoStr,
              descripcion,
              cuenta: accountName,
              concepto: categoryName,
              monto: amt,
              currency,
              explicacion: isExpense ? `Gasto desde ${accountName}` : `Ingreso en ${accountName}`,
            });
          }
        }
      }

      if (accountAmounts.length === 0) {
        const importeCell = idxImporteContable >= 0 ? (row[idxImporteContable] || '').trim() : '';
        const amount = parseAmount(importeCell);
        const isSalida = /SALIDA\s*CONTABLE/i.test(tipoStr);
        const isIngreso = /INGRESO\s*CONTABLE/i.test(tipoStr);
        const isMovContable = isSalida || isIngreso;

        if (amount != null && amount !== 0 && (isMovContable || accountHeaders.length > 0)) {
          const amt = Math.round(Math.abs(amount) * 100) / 100;
          const currency = amt > 100000 ? 'COP' : default_currency;

          if (isMovContable) {
            let entityOrigen = proyectoStr;
            let entityDestino = 'AGENCIA X';
            if (isSalida && i + 1 < records.length) {
              const nextRow = records[i + 1];
              const nextTipo = (idxTipo >= 0 ? (nextRow[idxTipo] || '') : '').trim();
              const nextProyecto = (nextRow[idxProyecto] || '').trim();
              const nextImporte = parseAmount((idxImporteContable >= 0 ? (nextRow[idxImporteContable] || '') : '').trim());
              const nextDesc = (idxDescripcion >= 0 ? (nextRow[idxDescripcion] || '') : '').trim();
              const descSimilar = descripcion.slice(0, 30).toUpperCase() === nextDesc.slice(0, 30).toUpperCase()
                || /UTILIDADES|CORTE/i.test(nextDesc);
              if (/INGRESO\s*CONTABLE/i.test(nextTipo) && nextImporte != null
                && Math.abs(Math.abs(nextImporte) - amt) < 0.02 && descSimilar) {
                entityDestino = nextProyecto || entityDestino;
                skipNext = true;
              }
            } else if (isIngreso) {
              const sourceMatch = descripcion.match(/\[([^\]]+)\]|UTILIDADES\s+([A-Z0-9\s]+?)(?:\s+15|\s+CORTE|$)/i)
                || rawCategoria.match(/(?:ADRIANA|GERSSON|INFOPRODUCTOS|GIORGIO|NELLY|VCAPITAL|FONDO)/i);
              entityOrigen = sourceMatch ? (sourceMatch[1] || sourceMatch[2] || '').trim().replace(/\s+15.*$/i, '').trim() || 'Sin asignar' : 'Sin asignar';
              entityDestino = proyectoStr;
            }
            preview.push({
              rowIndex: i + 1,
              fecha: fechaStr,
              tipo: 'traslado_utilidades',
              proyecto: proyectoStr,
              descripcion,
              concepto: categoryName,
              monto: amt,
              currency,
              explicacion: `Traslado de utilidades: de ${entityOrigen} → ${entityDestino} (corte de balance del proyecto)`,
            });
          } else {
            const accountName = accountHeaders[0] || 'Cuenta';
            const tipo = amount > 0 ? 'ingreso' : 'gasto';
            preview.push({
              rowIndex: i + 1,
              fecha: fechaStr,
              tipo,
              proyecto: proyectoStr,
              descripcion,
              cuenta: accountName,
              concepto: categoryName,
              monto: amt,
              currency,
              explicacion: amount > 0 ? `Ingreso en ${accountName}` : `Gasto desde ${accountName}`,
            });
          }
        }
      }
    }

    const byTipo = preview.reduce((acc, p) => {
      acc[p.tipo] = (acc[p.tipo] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const uniqueCategories = [...new Set(preview.map((p) => (p.concepto || '').trim()).filter(Boolean))].sort();

    res.json({
      preview,
      summary: {
        total: preview.length,
        ...byTipo,
      },
      skipped,
      accountHeaders,
      uniqueCategories,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- Import CSV ---
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { csv_text, default_currency = 'USD', category_mapping } = req.body as {
      csv_text?: string;
      default_currency?: string;
      category_mapping?: Record<string, string>;
    };
    const created_by = req.body.created_by as string | undefined;
    if (!csv_text || typeof csv_text !== 'string') {
      res.status(400).json({ error: 'Falta csv_text' });
      return;
    }

    const records = parse(csv_text, { relax_column_count: true, trim: true, skip_empty_lines: true }) as string[][];
    if (records.length < 2) {
      res.status(400).json({ error: 'CSV vacío o sin datos' });
      return;
    }

    // Buscar fila de encabezado (contiene FECHA, PROYECTO)
    let headerRow = 0;
    for (let i = 0; i < Math.min(10, records.length); i++) {
      const row = records[i];
      const first = (row[0] || '').toUpperCase();
      const hasProyecto = row.some((c) => (c || '').toUpperCase().includes('PROYECTO'));
      if (first.includes('FECHA') || hasProyecto) {
        headerRow = i;
        break;
      }
    }

    const headers = records[headerRow].map((h) => (h || '').trim());
    const idxFecha = headers.findIndex((h) => /FECHA/i.test(h));
    const idxProyecto = headers.findIndex((h) => /PROYECTO/i.test(h));
    const idxSubcategoria = headers.findIndex((h) => /SUBCATEGORIA/i.test(h));
    let idxDescripcion = headers.findIndex((h) => /DESCRIPCI[OÓ]N/i.test(h));
    if (idxDescripcion < 0) idxDescripcion = headers.findIndex((h) => /NOTA|CONCEPTO|OBSERVACI[OÓ]N/i.test(h));
    let idxCategoria = headers.findIndex((h) => /CATEGOR[IÍ]A\/DETALLE|^CATEGOR[IÍ]A$/i.test(h));
    if (idxCategoria < 0) idxCategoria = headers.findIndex((h) => /^DETALLE$/i.test(h));
    const idxDetalle = headers.findIndex((h, i) => i !== idxCategoria && /^DETALLE$/i.test((h || '').trim()));
    const idxImporteContable = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
    const idxTipo = headers.findIndex((h) => /TIPO/i.test(h));

    if (idxFecha < 0 || idxProyecto < 0) {
      res.status(400).json({ error: 'CSV debe tener columnas FECHA y PROYECTO' });
      return;
    }

    // Columnas de cuentas: desde después de IMPORTE CONTABLE (o col 7) hasta el final
    const accountColStart = idxImporteContable >= 0 ? idxImporteContable + 1 : 7;
    const accountHeaders = headers.slice(accountColStart).filter((h) => h && !/^\s*$/.test(h));

    const batchRef = `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const journalEntryIds: string[] = [];
    const createdChartAccountIds: string[] = [];
    const createdEntityIds: string[] = [];
    const createdCategoryIds: string[] = [];
    const createdPaymentAccountIds: string[] = [];

    // ── Pre-carga masiva de registros existentes (elimina N+1 queries) ──
    const entityByName = new Map<string, { id: string; type: string }>();
    const categoryByName = new Map<string, string>();
    const accountByName = new Map<string, string>();
    const chartAccountByBankName = new Map<string, string>();
    const chartAccountByCategoryName = new Map<string, string>();
    const chartAccountByEquityName = new Map<string, string>();
    const parentExpenseByCategoria = new Map<string, { id: string; code: string; childCount: number }>();
    const parentIncomeByCategoria = new Map<string, { id: string; code: string; childCount: number }>();

    const [preEntities, preCategories, preAccounts, preChartAccounts] = await Promise.all([
      AcctEntity.find({}).select('id name type').lean().exec(),
      AcctCategory.find({}).select('id name parent_id').lean().exec(),
      AcctPaymentAccount.find({}).select('id name').lean().exec(),
      AcctChartAccount.find({}).select('id code name type parent_id is_header').lean().exec(),
    ]);
    for (const e of preEntities) {
      entityByName.set((e as any).name, { id: (e as any).id, type: (e as any).type });
    }
    for (const c of preCategories) {
      categoryByName.set((c as any).name, (c as any).id);
    }
    for (const a of preAccounts) {
      accountByName.set((a as any).name, (a as any).id);
    }
    let bankCounter = 0, incomeCounter = 0, expenseCounter = 0, equityCounter = 0;
    for (const ca of preChartAccounts) {
      const a = ca as any;
      const m2 = a.code.match(/^(\d{4})-(\d{2})$/);
      if (m2) {
        const num = parseInt(m2[2], 10);
        if (m2[1] === '1110') { if (num > bankCounter) bankCounter = num; chartAccountByBankName.set(a.name, a.id); }
        if (m2[1] === '4135') { if (num > incomeCounter) incomeCounter = num; }
        if (m2[1] === '5195') { if (num > expenseCounter) expenseCounter = num; }
        if (m2[1] === '3605') { if (num > equityCounter) equityCounter = num; chartAccountByEquityName.set(a.name.replace(/^Utilidades\s+/i, '').trim() || 'Sin asignar', a.id); }
      }
      if (a.is_header && /^(5195|4135)-\d{2}$/.test(a.code)) {
        const childCount = preChartAccounts.filter((c: any) => (c as any).parent_id === a.id).length;
        const map = a.type === 'expense' ? parentExpenseByCategoria : parentIncomeByCategoria;
        map.set(a.name, { id: a.id, code: a.code, childCount });
      }
      if (!a.is_header && a.parent_id && /^(5195|4135)-\d{2}-\d{2}$/.test(a.code)) {
        const parent = preChartAccounts.find((p: any) => (p as any).id === a.parent_id) as any;
        if (parent) {
          const typeStr = a.type === 'expense' ? 'expense' : 'income';
          chartAccountByCategoryName.set(`${parent.name}\x00${a.name}\x00${typeStr}`, a.id);
        }
      }
      if (!a.is_header && !a.parent_id && /^(5195|4135)-\d{2}$/.test(a.code)) {
        const typeStr = a.type === 'expense' ? 'expense' : 'income';
        chartAccountByCategoryName.set(`${a.name}\x00\x00${typeStr}`, a.id);
      }
    }

    // Protección contra duplicados: hash incluye fecha+desc+proyecto+montos para no marcar
    // como duplicadas filas distintas (ej. mismo día "SALDOS INICIALES" en distintas cuentas).
    const existingImportEntries = await AcctJournalEntry.find({ reference: /^Import / }).select('date description').lean().exec();
    const existingHashes = new Set<string>();
    for (const e of existingImportEntries) {
      const d = (e as any).date instanceof Date ? (e as any).date.toISOString().slice(0, 10) : '';
      existingHashes.add(`${d}\x00${((e as any).description || '').slice(0, 200)}`);
    }

    // Detección de moneda por nombre de cuenta bancaria
    const COP_ACCOUNT_RE = /BANCOLOMBIA|DAVIVIENDA|NEQUI\s*COP/i;
    const detectCurrency = (accountName: string, amt: number): string => {
      if (COP_ACCOUNT_RE.test(accountName)) return 'COP';
      if (amt > 100000) return 'COP';
      return default_currency;
    };

    // ── Funciones getOrCreate (buscan por nombre, no por código) ──

    const getOrCreateChartAccountForEquity = async (entityName: string): Promise<string> => {
      const n = (entityName || '').trim() || 'Sin asignar';
      if (chartAccountByEquityName.has(n)) return chartAccountByEquityName.get(n)!;
      const existing = await AcctChartAccount.findOne({ name: `Utilidades ${n}`, type: 'equity' }).select('id').lean().exec();
      if (existing) {
        chartAccountByEquityName.set(n, (existing as any).id);
        return (existing as any).id;
      }
      equityCounter++;
      let code = `3605-${String(equityCounter).padStart(2, '0')}`;
      while (await AcctChartAccount.findOne({ code }).select('id').lean().exec()) {
        equityCounter++;
        code = `3605-${String(equityCounter).padStart(2, '0')}`;
      }
      const doc = await AcctChartAccount.create({ code, name: `Utilidades ${n}`, type: 'equity', is_header: false, sort_order: equityCounter });
      createdChartAccountIds.push(doc.id);
      chartAccountByEquityName.set(n, doc.id);
      return doc.id;
    }

    const getOrCreateChartAccountForBank = async (name: string): Promise<string> => {
      const n = (name || '').trim() || 'Sin cuenta';
      if (chartAccountByBankName.has(n)) return chartAccountByBankName.get(n)!;
      const existing = await AcctChartAccount.findOne({ name: n, type: 'asset' }).select('id').lean().exec();
      if (existing) {
        chartAccountByBankName.set(n, (existing as any).id);
        return (existing as any).id;
      }
      bankCounter++;
      let code = `1110-${String(bankCounter).padStart(2, '0')}`;
      while (await AcctChartAccount.findOne({ code }).select('id').lean().exec()) {
        bankCounter++;
        code = `1110-${String(bankCounter).padStart(2, '0')}`;
      }
      const doc = await AcctChartAccount.create({ code, name: n, type: 'asset', is_header: false, sort_order: bankCounter });
      createdChartAccountIds.push(doc.id);
      chartAccountByBankName.set(n, doc.id);
      return doc.id;
    }

    const getOrCreateChartAccountForCategory = async (categoria: string, detalle: string, isExpense: boolean): Promise<string> => {
      const catName = (categoria || '').trim() || 'Importación';
      const detName = (detalle || '').trim();
      const acctType = isExpense ? 'expense' : 'income';
      const codePrefix = isExpense ? '5195' : '4135';
      const parentMap = isExpense ? parentExpenseByCategoria : parentIncomeByCategoria;
      const key = `${catName}\x00${detName}\x00${acctType}`;
      if (chartAccountByCategoryName.has(key)) return chartAccountByCategoryName.get(key)!;

      if (detName) {
        let parent = parentMap.get(catName);
        if (!parent) {
          const existingParent = await AcctChartAccount.findOne({ name: catName, type: acctType, is_header: true }).select('id code').lean().exec();
          if (existingParent) {
            const childCount = await AcctChartAccount.countDocuments({ parent_id: (existingParent as any).id }).exec();
            parent = { id: (existingParent as any).id, code: (existingParent as any).code, childCount };
          } else {
            if (isExpense) expenseCounter++; else incomeCounter++;
            let parentCode = `${codePrefix}-${String(isExpense ? expenseCounter : incomeCounter).padStart(2, '0')}`;
            while (await AcctChartAccount.findOne({ code: parentCode }).select('id').lean().exec()) {
              if (isExpense) expenseCounter++; else incomeCounter++;
              parentCode = `${codePrefix}-${String(isExpense ? expenseCounter : incomeCounter).padStart(2, '0')}`;
            }
            const parentDoc = await AcctChartAccount.create({
              code: parentCode, name: catName, type: acctType, is_header: true, parent_id: null,
              sort_order: isExpense ? expenseCounter : incomeCounter,
            });
            createdChartAccountIds.push(parentDoc.id);
            parent = { id: parentDoc.id, code: parentCode, childCount: 0 };
          }
          parentMap.set(catName, parent);
        }
        const existingChild = await AcctChartAccount.findOne({ name: detName, parent_id: parent.id, type: acctType }).select('id').lean().exec();
        if (existingChild) {
          chartAccountByCategoryName.set(key, (existingChild as any).id);
          return (existingChild as any).id;
        }
        parent.childCount++;
        let childCode = `${parent.code}-${String(parent.childCount).padStart(2, '0')}`;
        while (await AcctChartAccount.findOne({ code: childCode }).select('id').lean().exec()) {
          parent.childCount++;
          childCode = `${parent.code}-${String(parent.childCount).padStart(2, '0')}`;
        }
        const childDoc = await AcctChartAccount.create({
          code: childCode, name: detName, type: acctType, is_header: false, parent_id: parent.id,
          sort_order: parent.childCount,
        });
        createdChartAccountIds.push(childDoc.id);
        chartAccountByCategoryName.set(key, childDoc.id);
        return childDoc.id;
      }

      const existingFlat = await AcctChartAccount.findOne({ name: catName, type: acctType, is_header: false, parent_id: null }).select('id').lean().exec();
      if (existingFlat) {
        chartAccountByCategoryName.set(key, (existingFlat as any).id);
        return (existingFlat as any).id;
      }
      if (isExpense) expenseCounter++; else incomeCounter++;
      let code = `${codePrefix}-${String(isExpense ? expenseCounter : incomeCounter).padStart(2, '0')}`;
      while (await AcctChartAccount.findOne({ code }).select('id').lean().exec()) {
        if (isExpense) expenseCounter++; else incomeCounter++;
        code = `${codePrefix}-${String(isExpense ? expenseCounter : incomeCounter).padStart(2, '0')}`;
      }
      const doc = await AcctChartAccount.create({ code, name: catName, type: acctType, is_header: false, sort_order: isExpense ? expenseCounter : incomeCounter });
      createdChartAccountIds.push(doc.id);
      chartAccountByCategoryName.set(key, doc.id);
      return doc.id;
    }

    const getOrCreateEntity = async (name: string): Promise<string | null> => {
      const n = (name || '').trim();
      if (!n || n === 'NA') return null;
      if (entityByName.has(n)) return entityByName.get(n)!.id;
      const type = /AGENCIA\s*X/i.test(n) ? 'agency' : /UTILIDADES|HOTMART|EQUIPO|NA/i.test(n) ? 'internal' : 'project';
      const existing = await AcctEntity.findOne({ name: n }).select('id').lean().exec();
      if (existing) {
        entityByName.set(n, { id: (existing as any).id, type });
        return (existing as any).id;
      }
      const doc = await AcctEntity.create({ name: n, type, sort_order: 0 });
      createdEntityIds.push(doc.id);
      if (created_by) {
        await AuditLog.create({ user_id: created_by, entity_type: 'acct_entity', entity_id: doc.id, action: 'create', summary: `Import: ${n}` });
      }
      entityByName.set(n, { id: doc.id, type });
      return doc.id;
    }

    const getOrCreateCategory = async (categoria: string, detalle: string, isExpense: boolean): Promise<string | null> => {
      const catName = (categoria || '').trim() || 'Importación';
      const detName = (detalle || '').trim();
      const fullName = detName ? `${catName} - ${detName}` : catName;
      if (categoryByName.has(fullName)) return categoryByName.get(fullName)!;
      const existing = await AcctCategory.findOne({ name: fullName }).select('id').lean().exec();
      if (existing) {
        categoryByName.set(fullName, (existing as any).id);
        return (existing as any).id;
      }
      let parentId: string | null = null;
      if (detName) {
        if (!categoryByName.has(catName)) {
          const existingParent = await AcctCategory.findOne({ name: catName }).select('id').lean().exec();
          if (existingParent) {
            categoryByName.set(catName, (existingParent as any).id);
          } else {
            const parentDoc = await AcctCategory.create({ name: catName, type: isExpense ? 'expense' : 'income', parent_id: null });
            createdCategoryIds.push(parentDoc.id);
            categoryByName.set(catName, parentDoc.id);
          }
        }
        parentId = categoryByName.get(catName) ?? null;
      }
      const doc = await AcctCategory.create({ name: fullName, type: isExpense ? 'expense' : 'income', parent_id: parentId });
      createdCategoryIds.push(doc.id);
      if (created_by) {
        await AuditLog.create({ user_id: created_by, entity_type: 'acct_category', entity_id: doc.id, action: 'create', summary: `Import: ${fullName}` });
      }
      categoryByName.set(fullName, doc.id);
      return doc.id;
    }

    const getOrCreateAccount = async (name: string): Promise<string> => {
      const n = (name || '').trim() || 'Sin cuenta';
      if (accountByName.has(n)) return accountByName.get(n)!;
      const existing = await AcctPaymentAccount.findOne({ name: n }).select('id').lean().exec();
      if (existing) {
        accountByName.set(n, (existing as any).id);
        return (existing as any).id;
      }
      const doc = await AcctPaymentAccount.create({ name: n, currency: default_currency });
      createdPaymentAccountIds.push(doc.id);
      if (created_by) {
        await AuditLog.create({ user_id: created_by, entity_type: 'acct_payment_account', entity_id: doc.id, action: 'create', summary: `Import: ${n}` });
      }
      accountByName.set(n, doc.id);
      return doc.id;
    }

    let created = 0;
    let skipped = 0;
    let duplicates = 0;
    let skipNext = false;

    for (let i = headerRow + 1; i < records.length; i++) {
      if (skipNext) {
        skipNext = false;
        continue;
      }
      const row = records[i];
      const fechaStr = (row[idxFecha] || '').trim();
      let proyectoStr = (row[idxProyecto] || '').trim();
      const tipoStr = (idxTipo >= 0 ? (row[idxTipo] || '') : '').trim();
      const rawCategoria = (idxCategoria >= 0 ? (row[idxCategoria] || '').trim() : '');
      const rawDetalle = (idxDetalle >= 0 ? (row[idxDetalle] || '').trim() : '');
      const descripcion = ((idxDescripcion >= 0 ? (row[idxDescripcion] || '').trim() : '') || rawCategoria).trim() || 'Sin descripción';
      const subcategoria = (idxSubcategoria >= 0 ? (row[idxSubcategoria] || '').trim() : '');

      // Construir categoria y detalle como parámetros separados (no concatenar con " - ")
      let catForAccount = (subcategoria && rawCategoria && subcategoria !== rawCategoria)
        ? `${subcategoria} (${rawCategoria})`
        : (subcategoria || rawCategoria || 'Importación');
      let detForAccount = rawDetalle;

      // category_mapping sobre el nombre combinado para display
      const categoryDisplay = detForAccount ? `${catForAccount} - ${detForAccount}` : catForAccount;
      if (category_mapping && category_mapping[categoryDisplay]) {
        const mapped = category_mapping[categoryDisplay];
        if (mapped.includes(' - ')) {
          const mapParts = mapped.split(/ - (.+)/, 2);
          catForAccount = mapParts[0].trim();
          detForAccount = (mapParts[1] || '').trim();
        } else {
          catForAccount = mapped;
          detForAccount = '';
        }
      }

      if (proyectoStr === 'TRASLADO') proyectoStr = 'AGENCIA X';
      if (proyectoStr === 'RETIRO HOTMART') proyectoStr = 'HOTMART';

      // Usar TIPO para forzar clasificación cuando la columna está disponible
      const tipoForzado = /SALIDA/i.test(tipoStr) && !/CONTABLE/i.test(tipoStr) ? 'gasto'
        : /INGRESO/i.test(tipoStr) && !/CONTABLE/i.test(tipoStr) ? 'ingreso' : null;

      const date = parseSpanishDate(fechaStr);
      if (!date) {
        skipped++;
        continue;
      }

      const entityId = await getOrCreateEntity(proyectoStr);
      let rowCreated = 0;

      const accountAmounts: { accountName: string; amount: number }[] = [];
      for (let c = 0; c < accountHeaders.length; c++) {
        const cell = (row[accountColStart + c] || '').trim();
        const amount = parseAmount(cell);
        if (amount == null || amount === 0) continue;
        const accountName = accountHeaders[c];
        if (!accountName) continue;
        accountAmounts.push({ accountName, amount: Math.round(amount * 100) / 100 });
      }

      // Firma única: índice de fila + fecha + desc + proyecto + montos.
      // Incluimos el índice para que cada fila sea distinta (evita falsos duplicados cuando
      // varias filas comparten fecha/desc/proyecto/montos, ej. SALDOS INICIALES por cuenta).
      const amountsSig = accountAmounts.length > 0
        ? accountAmounts
            .sort((a, b) => a.accountName.localeCompare(b.accountName))
            .map((a) => `${a.accountName}:${a.amount}`)
            .join('|')
        : `importe:${parseAmount((idxImporteContable >= 0 ? (row[idxImporteContable] || '') : '').trim()) ?? 0}`;
      const dupHash = `${i}\x00${date.toISOString().slice(0, 10)}\x00${descripcion.slice(0, 200)}\x00${proyectoStr}\x00${amountsSig}`;
      if (existingHashes.has(dupHash)) {
        duplicates++;
        skipped++;
        continue;
      }

      const isReparto = /REPARTO|REPARTICI[OÓ]N/i.test(rawCategoria) || /REPARTO|REPARTICI[OÓ]N/i.test(descripcion);

      // Tolerancia absoluta + porcentual para detectar traslados entre bancos
      const totalSum = accountAmounts.reduce((s, a) => s + a.amount, 0);
      const totalAbs = accountAmounts.reduce((s, a) => s + Math.abs(a.amount), 0);
      const isTrasladoBancos = accountAmounts.length >= 2 && (
        Math.abs(totalSum) < 0.02 || (totalAbs > 0 && Math.abs(totalSum) / totalAbs < 0.005)
      );

      if (isTrasladoBancos) {
        const entry = await AcctJournalEntry.create({
          date,
          description: descripcion.slice(0, 500),
          reference: `Import ${i + 1} (traslado)`,
          created_by: created_by ?? null,
        });
        journalEntryIds.push(entry.id);
        for (const { accountName, amount } of accountAmounts) {
          await getOrCreateAccount(accountName);
          const bankChartId = await getOrCreateChartAccountForBank(accountName);
          const amt = Math.abs(amount);
          const currency = detectCurrency(accountName, amt);
          if (amount > 0) {
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: bankChartId, entity_id: entityId, debit: amt, credit: 0, description: descripcion.slice(0, 200), currency });
          } else {
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: bankChartId, entity_id: entityId, debit: 0, credit: amt, description: descripcion.slice(0, 200), currency });
          }
        }
        existingHashes.add(dupHash);
        created++;
        rowCreated++;
      } else if (accountAmounts.length === 1) {
        const { accountName, amount } = accountAmounts[0];
        await getOrCreateAccount(accountName);
        const isExpense = tipoForzado === 'gasto' || (tipoForzado == null && amount < 0);
        await getOrCreateCategory(catForAccount, detForAccount, isExpense && !isReparto);
        const amt = Math.abs(amount);
        const currency = detectCurrency(accountName, amt);
        const bankChartId = await getOrCreateChartAccountForBank(accountName);

        if (isReparto) {
          const equityChartId = await getOrCreateChartAccountForEquity(proyectoStr);
          const entry = await AcctJournalEntry.create({
            date, description: descripcion.slice(0, 500), reference: `Import ${i + 1}`, created_by: created_by ?? null,
          });
          journalEntryIds.push(entry.id);
          await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: equityChartId, entity_id: entityId, debit: amt, credit: 0, description: descripcion.slice(0, 200), currency });
          await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: bankChartId, entity_id: entityId, debit: 0, credit: amt, description: descripcion.slice(0, 200), currency });
        } else {
          const categoryChartId = await getOrCreateChartAccountForCategory(catForAccount, detForAccount, isExpense);
          const entry = await AcctJournalEntry.create({
            date, description: descripcion.slice(0, 500), reference: `Import ${i + 1}`, created_by: created_by ?? null,
          });
          journalEntryIds.push(entry.id);
          if (amount > 0) {
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: bankChartId, entity_id: entityId, debit: amt, credit: 0, description: descripcion.slice(0, 200), currency });
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: categoryChartId, entity_id: entityId, debit: 0, credit: amt, description: descripcion.slice(0, 200), currency });
          } else {
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: categoryChartId, entity_id: entityId, debit: amt, credit: 0, description: descripcion.slice(0, 200), currency });
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: bankChartId, entity_id: entityId, debit: 0, credit: amt, description: descripcion.slice(0, 200), currency });
          }
        }
        existingHashes.add(dupHash);
        created++;
        rowCreated++;
      } else if (accountAmounts.length > 1 && !isTrasladoBancos) {
        for (const { accountName, amount } of accountAmounts) {
          await getOrCreateAccount(accountName);
          const isExpense = tipoForzado === 'gasto' || (tipoForzado == null && amount < 0);
          await getOrCreateCategory(catForAccount, detForAccount, isExpense && !isReparto);
          const amt = Math.abs(amount);
          const currency = detectCurrency(accountName, amt);
          const bankChartId = await getOrCreateChartAccountForBank(accountName);
          const categoryChartId = isReparto
            ? await getOrCreateChartAccountForEquity(proyectoStr)
            : await getOrCreateChartAccountForCategory(catForAccount, detForAccount, isExpense);
          const entry = await AcctJournalEntry.create({
            date, description: descripcion.slice(0, 500), reference: `Import ${i + 1}`, created_by: created_by ?? null,
          });
          journalEntryIds.push(entry.id);
          if (amount > 0) {
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: bankChartId, entity_id: entityId, debit: amt, credit: 0, description: descripcion.slice(0, 200), currency });
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: categoryChartId, entity_id: entityId, debit: 0, credit: amt, description: descripcion.slice(0, 200), currency });
          } else {
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: categoryChartId, entity_id: entityId, debit: amt, credit: 0, description: descripcion.slice(0, 200), currency });
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: bankChartId, entity_id: entityId, debit: 0, credit: amt, description: descripcion.slice(0, 200), currency });
          }
          created++;
          rowCreated++;
        }
        existingHashes.add(dupHash);
      }

      if (rowCreated === 0) {
        const importeCell = idxImporteContable >= 0 ? (row[idxImporteContable] || '').trim() : '';
        const amount = parseAmount(importeCell);
        const isSalida = /SALIDA\s*CONTABLE/i.test(tipoStr);
        const isIngreso = /INGRESO\s*CONTABLE/i.test(tipoStr);
        const isMovContable = isSalida || isIngreso;

        if (amount != null && amount !== 0 && (isMovContable || accountHeaders.length > 0)) {
          const amt = Math.round(Math.abs(amount) * 100) / 100;
          const currency = amt > 100000 ? 'COP' : default_currency;

          if (isMovContable) {
            let entityOrigen = proyectoStr;
            let entityDestino = 'AGENCIA X';
            if (isSalida && i + 1 < records.length) {
              const nextRow = records[i + 1];
              const nextTipo = (idxTipo >= 0 ? (nextRow[idxTipo] || '') : '').trim();
              const nextProyecto = (nextRow[idxProyecto] || '').trim();
              const nextImporte = parseAmount((idxImporteContable >= 0 ? (nextRow[idxImporteContable] || '') : '').trim());
              const nextDesc = (idxDescripcion >= 0 ? (nextRow[idxDescripcion] || '') : '').trim();
              const descSimilar = descripcion.slice(0, 30).toUpperCase() === nextDesc.slice(0, 30).toUpperCase()
                || /UTILIDADES|CORTE/i.test(nextDesc);
              if (/INGRESO\s*CONTABLE/i.test(nextTipo) && nextImporte != null
                && Math.abs(Math.abs(nextImporte) - amt) < 0.02 && descSimilar) {
                entityDestino = nextProyecto || entityDestino;
                skipNext = true;
              }
            } else if (isIngreso) {
              const sourceMatch = descripcion.match(/\[([^\]]+)\]|UTILIDADES\s+([A-Z0-9\s]+?)(?:\s+15|\s+CORTE|$)/i)
                || rawCategoria.match(/(?:ADRIANA|GERSSON|INFOPRODUCTOS|GIORGIO|NELLY|VCAPITAL|FONDO)/i);
              entityOrigen = sourceMatch ? (sourceMatch[1] || sourceMatch[2] || '').trim().replace(/\s+15.*$/i, '').trim() || 'Sin asignar' : 'Sin asignar';
              entityDestino = proyectoStr;
            }
            const equityOrigenId = await getOrCreateChartAccountForEquity(entityOrigen);
            const equityDestinoId = await getOrCreateChartAccountForEquity(entityDestino);
            const entry = await AcctJournalEntry.create({
              date, description: descripcion.slice(0, 500),
              reference: `Import ${i + 1} (traslado utilidades)`,
              created_by: created_by ?? null,
            });
            journalEntryIds.push(entry.id);
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: equityDestinoId, entity_id: await getOrCreateEntity(entityDestino), debit: amt, credit: 0, description: descripcion.slice(0, 200), currency });
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: equityOrigenId, entity_id: await getOrCreateEntity(entityOrigen), debit: 0, credit: amt, description: descripcion.slice(0, 200), currency });
          } else {
            const accountName = accountHeaders[0];
            await getOrCreateAccount(accountName);
            const isExpense = tipoForzado === 'gasto' || (tipoForzado == null && amount < 0);
            await getOrCreateCategory(catForAccount, detForAccount, isExpense);
            const bankChartId = await getOrCreateChartAccountForBank(accountName);
            const categoryChartId = await getOrCreateChartAccountForCategory(catForAccount, detForAccount, isExpense);
            const entry = await AcctJournalEntry.create({
              date, description: descripcion.slice(0, 500), reference: `Import ${i + 1}`, created_by: created_by ?? null,
            });
            journalEntryIds.push(entry.id);
            if (amount > 0) {
              await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: bankChartId, entity_id: entityId, debit: amt, credit: 0, description: descripcion.slice(0, 200), currency });
              await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: categoryChartId, entity_id: entityId, debit: 0, credit: amt, description: descripcion.slice(0, 200), currency });
            } else {
              await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: categoryChartId, entity_id: entityId, debit: amt, credit: 0, description: descripcion.slice(0, 200), currency });
              await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: bankChartId, entity_id: entityId, debit: 0, credit: amt, description: descripcion.slice(0, 200), currency });
            }
          }
          existingHashes.add(dupHash);
          created++;
        }
      }
    }

    const batch = await AcctImportBatch.create({
      batch_ref: batchRef,
      journal_entry_ids: journalEntryIds,
      created_by: created_by ?? null,
      created_count: created,
      skipped_count: skipped,
      created_chart_account_ids: createdChartAccountIds,
      created_entity_ids: createdEntityIds,
      created_category_ids: createdCategoryIds,
      created_payment_account_ids: createdPaymentAccountIds,
    });

    res.json({
      created,
      skipped,
      duplicates,
      entities: entityByName.size,
      categories: categoryByName.size,
      accounts: accountByName.size,
      chart_accounts: chartAccountByBankName.size + chartAccountByCategoryName.size,
      batch_id: batch.id,
      batch_ref: batchRef,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- Import Batches (historial para rollback) ---
router.get('/import/batches', async (_req: Request, res: Response) => {
  try {
    const list = await AcctImportBatch.find({})
      .sort({ created_at: -1 })
      .limit(100)
      .lean()
      .exec();
    res.json(list);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.delete('/import/:batchId/rollback', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const batch = await AcctImportBatch.findOne({ id: batchId }).lean().exec();
    if (!batch) {
      res.status(404).json({ error: 'Import no encontrado' });
      return;
    }
    const b = batch as {
      journal_entry_ids?: string[];
      created_chart_account_ids?: string[];
      created_entity_ids?: string[];
      created_category_ids?: string[];
      created_payment_account_ids?: string[];
    };
    const journalEntryIds = b.journal_entry_ids || [];
    const createdChartIds = b.created_chart_account_ids || [];
    const createdEntityIds = b.created_entity_ids || [];
    const createdCategoryIds = b.created_category_ids || [];
    const createdPaymentIds = b.created_payment_account_ids || [];

    if (journalEntryIds.length === 0 && createdChartIds.length === 0 && createdEntityIds.length === 0 && createdCategoryIds.length === 0 && createdPaymentIds.length === 0) {
      await AcctImportBatch.findOneAndDelete({ id: batchId }).exec();
      res.json({ rolled_back: 0, message: 'Import no tenía asientos ni registros creados' });
      return;
    }

    let rolledBack = 0;

    if (journalEntryIds.length > 0) {
      await AcctJournalEntryLine.deleteMany({ journal_entry_id: { $in: journalEntryIds } }).exec();
      const result = await AcctJournalEntry.deleteMany({ id: { $in: journalEntryIds } }).exec();
      rolledBack += result.deletedCount ?? journalEntryIds.length;
    }

    if (createdChartIds.length > 0) {
      const chartAccounts = await AcctChartAccount.find({ id: { $in: createdChartIds } }).select('id parent_id').lean().exec();
      const childIds = chartAccounts.filter((a) => a.parent_id && createdChartIds.includes(a.parent_id)).map((a) => a.id);
      const parentIds = chartAccounts.filter((a) => !a.parent_id || !createdChartIds.includes(a.parent_id)).map((a) => a.id);
      const toDelete = [...childIds, ...parentIds];
      if (toDelete.length > 0) {
        await AcctChartAccount.deleteMany({ id: { $in: toDelete } }).exec();
      }
    }

    if (createdCategoryIds.length > 0) {
      await AcctCategory.deleteMany({ id: { $in: createdCategoryIds } }).exec();
    }
    if (createdEntityIds.length > 0) {
      await AcctEntity.deleteMany({ id: { $in: createdEntityIds } }).exec();
    }
    if (createdPaymentIds.length > 0) {
      await AcctPaymentAccount.deleteMany({ id: { $in: createdPaymentIds } }).exec();
    }

    await AcctImportBatch.findOneAndDelete({ id: batchId }).exec();
    res.json({ rolled_back: rolledBack });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- Plan de Cuentas (Chart of Accounts) ---
router.get('/chart-accounts', async (_req: Request, res: Response) => {
  try {
    const list = await AcctChartAccount.find({}).sort({ code: 1 }).lean().exec();
    res.json(list);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

const PUC_BASICO = [
  { code: '1105', name: 'Caja', type: 'asset' },
  { code: '1110', name: 'Bancos', type: 'asset' },
  { code: '1305', name: 'Clientes', type: 'asset' },
  { code: '2105', name: 'Obligaciones bancarias', type: 'liability' },
  { code: '2205', name: 'Proveedores', type: 'liability' },
  { code: '3105', name: 'Capital social', type: 'equity' },
  { code: '3605', name: 'Utilidades acumuladas', type: 'equity' },
  { code: '4135', name: 'Ingresos operacionales', type: 'income' },
  { code: '5105', name: 'Gastos de personal', type: 'expense' },
  { code: '5110', name: 'Honorarios', type: 'expense' },
  { code: '5120', name: 'Arrendamientos', type: 'expense' },
  { code: '5160', name: 'Gastos legales', type: 'expense' },
  { code: '5195', name: 'Otros gastos', type: 'expense' },
];

router.post('/chart-accounts/seed', async (req: Request, res: Response) => {
  try {
    const count = await AcctChartAccount.countDocuments({}).exec();
    if (count > 0) {
      res.status(400).json({ error: 'Ya existen cuentas. Solo se puede cargar PUC básico cuando el plan está vacío.' });
      return;
    }
    for (const c of PUC_BASICO) {
      await AcctChartAccount.create(c);
    }
    const list = await AcctChartAccount.find({}).sort({ code: 1 }).lean().exec();
    res.json({ created: PUC_BASICO.length, accounts: list });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.post('/chart-accounts', async (req: Request, res: Response) => {
  try {
    const { code, name, type, parent_id, is_header, sort_order } = req.body;
    const created_by = req.body.created_by as string | undefined;
    if (!code || !name || !type) {
      res.status(400).json({ error: 'Faltan code, name o type' });
      return;
    }
    const existing = await AcctChartAccount.findOne({ code }).lean().exec();
    if (existing) {
      res.status(400).json({ error: `Ya existe una cuenta con código ${code}` });
      return;
    }
    const doc = await AcctChartAccount.create({
      code: String(code).trim(),
      name: String(name).trim(),
      type,
      parent_id: parent_id ?? null,
      is_header: is_header ?? false,
      sort_order: sort_order ?? 0,
    });
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_chart_account',
        entity_id: doc.id,
        action: 'create',
        summary: `Cuenta creada: ${code} ${name}`,
      });
    }
    res.status(201).json(doc.toObject ? doc.toObject() : doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.put('/chart-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code, name, type, parent_id, is_header, sort_order } = req.body;
    const created_by = req.body.created_by as string | undefined;
    const update: Record<string, unknown> = {};
    if (code != null) update.code = String(code).trim();
    if (name != null) update.name = String(name).trim();
    if (type != null) update.type = type;
    if (parent_id !== undefined) update.parent_id = parent_id ?? null;
    if (is_header !== undefined) update.is_header = is_header;
    if (sort_order !== undefined) update.sort_order = sort_order;
    const doc = await AcctChartAccount.findOneAndUpdate(
      { id },
      { $set: update },
      { new: true }
    )
      .lean()
      .exec();
    if (!doc) {
      res.status(404).json({ error: 'Cuenta no encontrada' });
      return;
    }
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_chart_account',
        entity_id: id,
        action: 'update',
        summary: `Cuenta actualizada: ${code ?? name}`,
      });
    }
    res.json(doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.delete('/chart-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const created_by = req.query.created_by as string | undefined;
    const count = await AcctJournalEntryLine.countDocuments({ account_id: id }).exec();
    if (count > 0) {
      res.status(400).json({ error: `Hay ${count} líneas de asientos con esta cuenta. No se puede eliminar.` });
      return;
    }
    const doc = await AcctChartAccount.findOneAndDelete({ id }).lean().exec();
    if (!doc) {
      res.status(404).json({ error: 'Cuenta no encontrada' });
      return;
    }
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_chart_account',
        entity_id: id,
        action: 'delete',
        summary: `Cuenta eliminada: ${(doc as { code: string; name: string }).code} ${(doc as { name: string }).name}`,
      });
    }
    res.json({ id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- Asientos Contables (Journal Entries) ---
router.get('/journal-entries', async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;
    const filter: Record<string, unknown> = {};
    if (start && end) {
      filter.date = { $gte: new Date(start as string), $lte: new Date(end as string) };
    } else if (start) {
      filter.date = { $gte: new Date(start as string) };
    } else if (end) {
      filter.date = { $lte: new Date(end as string) };
    }
    const list = await AcctJournalEntry.find(filter).sort({ date: -1 }).lean().exec();
    res.json(list);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.get('/journal-entries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entry = await AcctJournalEntry.findOne({ id }).lean().exec();
    if (!entry) {
      res.status(404).json({ error: 'Asiento no encontrado' });
      return;
    }
    const lines = await AcctJournalEntryLine.find({ journal_entry_id: id }).lean().exec();
    const accountIds = [...new Set(lines.map((l) => (l as { account_id: string }).account_id))];
    const entityIds = [...new Set(lines.map((l) => (l as { entity_id?: string | null }).entity_id).filter(Boolean))];
    const accounts = accountIds.length > 0
      ? await AcctChartAccount.find({ id: { $in: accountIds } }).select('id code name type').lean().exec()
      : [];
    const entities = entityIds.length > 0
      ? await AcctEntity.find({ id: { $in: entityIds } }).select('id name').lean().exec()
      : [];
    const accountMap = new Map((accounts as { id: string; code: string; name: string; type: string }[]).map((a) => [a.id, a]));
    const entityMap = new Map((entities as { id: string; name: string }[]).map((e) => [e.id, e.name]));
    const enrichedLines = lines.map((l) => {
      const line = l as { account_id: string; entity_id?: string | null; debit: number; credit: number };
      const acc = accountMap.get(line.account_id);
      return {
        ...l,
        account_code: acc?.code,
        account_name: acc?.name,
        account_type: acc?.type,
        entity_name: line.entity_id ? entityMap.get(line.entity_id) ?? null : null,
      };
    });
    res.json({ ...entry, lines: enrichedLines });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- Liquidar proyecto (traslado de utilidades a FONDO LIBRE) ---
router.post('/liquidar', async (req: Request, res: Response) => {
  try {
    const { entity_id, amount_usd, amount_cop, date } = req.body as {
      entity_id?: string;
      amount_usd?: number;
      amount_cop?: number;
      date?: string;
    };
    const created_by = req.body.created_by as string | undefined;
    if (!entity_id || (amount_usd == null && amount_cop == null)) {
      res.status(400).json({ error: 'Faltan entity_id y (amount_usd o amount_cop)' });
      return;
    }
    const amtUsd = Math.round((Number(amount_usd) || 0) * 100) / 100;
    const amtCop = Math.round((Number(amount_cop) || 0) * 100) / 100;
    if (amtUsd <= 0 && amtCop <= 0) {
      res.status(400).json({ error: 'El monto debe ser positivo' });
      return;
    }
    const entity = await AcctEntity.findOne({ id: entity_id }).select('id name').lean().exec();
    if (!entity) {
      res.status(404).json({ error: 'Entidad no encontrada' });
      return;
    }
    const entityName = (entity as { name: string }).name;
    let fondoLibreEntity = await AcctEntity.findOne({ name: 'FONDO LIBRE' }).select('id').lean().exec();
    if (!fondoLibreEntity) {
      const doc = await AcctEntity.create({ name: 'FONDO LIBRE', type: 'internal', sort_order: 0 });
      fondoLibreEntity = { id: doc.id } as { id: string };
    }
    const getOrCreateEquityAccount = async (name: string): Promise<string> => {
      const accName = `Utilidades ${name}`;
      const existing = await AcctChartAccount.findOne({ name: accName, type: 'equity' }).select('id').lean().exec();
      if (existing) return (existing as { id: string }).id;
      const maxCode = await AcctChartAccount.find({ code: { $regex: /^3605-\d{2}$/ } }).select('code').lean().exec();
      let num = 1;
      for (const a of maxCode as { code: string }[]) {
        const m = a.code.match(/^3605-(\d+)$/);
        if (m) num = Math.max(num, parseInt(m[1], 10) + 1);
      }
      const code = `3605-${String(num).padStart(2, '0')}`;
      const doc = await AcctChartAccount.create({ code, name: accName, type: 'equity', is_header: false, sort_order: num });
      return doc.id;
    };
    const equityProyecto = await getOrCreateEquityAccount(entityName);
    const equityFondo = await getOrCreateEquityAccount('FONDO LIBRE');
    const entryDate = date ? new Date(date) : new Date();
    const lines: Array<{ account_id: string; entity_id: string; debit: number; credit: number; description: string; currency: string }> = [];
    if (amtUsd > 0) {
      lines.push({ account_id: equityFondo, entity_id: (fondoLibreEntity as { id: string }).id, debit: amtUsd, credit: 0, description: `Traslado utilidades ${entityName}`, currency: 'USD' });
      lines.push({ account_id: equityProyecto, entity_id, debit: 0, credit: amtUsd, description: `Traslado utilidades ${entityName}`, currency: 'USD' });
    }
    if (amtCop > 0) {
      lines.push({ account_id: equityFondo, entity_id: (fondoLibreEntity as { id: string }).id, debit: amtCop, credit: 0, description: `Traslado utilidades ${entityName}`, currency: 'COP' });
      lines.push({ account_id: equityProyecto, entity_id, debit: 0, credit: amtCop, description: `Traslado utilidades ${entityName}`, currency: 'COP' });
    }
    const entry = await AcctJournalEntry.create({
      date: entryDate,
      description: `Corte utilidades ${entityName}`,
      reference: 'Liquidación desde plataforma',
      created_by: created_by ?? null,
    });
    for (const line of lines) {
      await AcctJournalEntryLine.create({
        journal_entry_id: entry.id,
        account_id: line.account_id,
        entity_id: line.entity_id,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
        currency: line.currency,
      });
    }
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_journal_entry',
        entity_id: entry.id,
        action: 'create',
        summary: `Liquidación: ${entityName} → FONDO LIBRE`,
      });
    }
    res.status(201).json({ id: entry.id, entity_name: entityName, amount_usd: amtUsd, amount_cop: amtCop });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.post('/journal-entries', async (req: Request, res: Response) => {
  try {
    const { date, description, reference, lines } = req.body as {
      date?: string;
      description?: string;
      reference?: string;
      lines?: Array<{ account_id: string; entity_id?: string | null; debit: number; credit: number; description?: string; currency?: string }>;
    };
    const created_by = req.body.created_by as string | undefined;
    if (!date || !lines || !Array.isArray(lines) || lines.length < 2) {
      res.status(400).json({ error: 'Faltan date y lines (mínimo 2 líneas)' });
      return;
    }
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
      const d = Number(line.debit) || 0;
      const c = Number(line.credit) || 0;
      if (d < 0 || c < 0) {
        res.status(400).json({ error: 'Débitos y créditos deben ser >= 0' });
        return;
      }
      totalDebit += d;
      totalCredit += c;
    }
    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.01) {
      res.status(400).json({ error: `La partida no cuadra: débitos ${totalDebit.toFixed(2)} ≠ créditos ${totalCredit.toFixed(2)}` });
      return;
    }
    const entry = await AcctJournalEntry.create({
      date: new Date(date),
      description: description ?? '',
      reference: reference ?? '',
      created_by: created_by ?? null,
    });
    for (const line of lines) {
      await AcctJournalEntryLine.create({
        journal_entry_id: entry.id,
        account_id: line.account_id,
        entity_id: line.entity_id ?? null,
        debit: Math.round((Number(line.debit) || 0) * 100) / 100,
        credit: Math.round((Number(line.credit) || 0) * 100) / 100,
        description: line.description ?? '',
        currency: line.currency ?? 'USD',
      });
    }
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_journal_entry',
        entity_id: entry.id,
        action: 'create',
        summary: `Asiento creado: ${description ?? date}`,
      });
    }
    const created = await AcctJournalEntry.findOne({ id: entry.id }).lean().exec();
    const createdLines = await AcctJournalEntryLine.find({ journal_entry_id: entry.id }).lean().exec();
    res.status(201).json({ ...created, lines: createdLines });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.put('/journal-entries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date, description, reference, lines } = req.body as {
      date?: string;
      description?: string;
      reference?: string;
      lines?: Array<{ account_id: string; entity_id?: string | null; debit: number; credit: number; description?: string; currency?: string }>;
    };
    const created_by = req.body.created_by as string | undefined;
    const existing = await AcctJournalEntry.findOne({ id }).lean().exec();
    if (!existing) {
      res.status(404).json({ error: 'Asiento no encontrado' });
      return;
    }
    const update: Record<string, unknown> = {};
    if (date != null) update.date = new Date(date);
    if (description !== undefined) update.description = description;
    if (reference !== undefined) update.reference = reference;
    if (Object.keys(update).length > 0) {
      await AcctJournalEntry.updateOne({ id }, { $set: update }).exec();
    }
    if (lines && Array.isArray(lines) && lines.length >= 2) {
      let totalDebit = 0;
      let totalCredit = 0;
      for (const line of lines) {
        const d = Number(line.debit) || 0;
        const c = Number(line.credit) || 0;
        if (d < 0 || c < 0) {
          res.status(400).json({ error: 'Débitos y créditos deben ser >= 0' });
          return;
        }
        totalDebit += d;
        totalCredit += c;
      }
      const diff = Math.abs(totalDebit - totalCredit);
      if (diff > 0.01) {
        res.status(400).json({ error: `La partida no cuadra: débitos ${totalDebit.toFixed(2)} ≠ créditos ${totalCredit.toFixed(2)}` });
        return;
      }
      const oldLines = await AcctJournalEntryLine.find({ journal_entry_id: id }).lean().exec();
      const newLinesNormalized = lines.map((l) => ({
        account_id: l.account_id,
        entity_id: l.entity_id ?? null,
        debit: Math.round((Number(l.debit) || 0) * 100) / 100,
        credit: Math.round((Number(l.credit) || 0) * 100) / 100,
      }));
      if (created_by) {
        for (let i = 0; i < Math.max(oldLines.length, newLinesNormalized.length); i++) {
          const oldL = oldLines[i] as { account_id: string; entity_id?: string | null; debit: number; credit: number } | undefined;
          const newL = newLinesNormalized[i];
          if (!oldL && newL) {
            await AuditLog.create({
              user_id: created_by,
              entity_type: 'acct_journal_entry',
              entity_id: id,
              action: 'update',
              field_name: `line_${i + 1}`,
              old_value: null,
              new_value: newL,
              summary: `Línea ${i + 1} agregada: cuenta ${newL.account_id} D ${newL.debit} C ${newL.credit}`,
            });
          } else if (oldL && !newL) {
            await AuditLog.create({
              user_id: created_by,
              entity_type: 'acct_journal_entry',
              entity_id: id,
              action: 'update',
              field_name: `line_${i + 1}`,
              old_value: { account_id: oldL.account_id, entity_id: oldL.entity_id, debit: oldL.debit, credit: oldL.credit },
              new_value: null,
              summary: `Línea ${i + 1} eliminada: cuenta ${oldL.account_id} D ${oldL.debit} C ${oldL.credit}`,
            });
          } else if (oldL && newL) {
            const changed = oldL.account_id !== newL.account_id || String(oldL.entity_id ?? '') !== String(newL.entity_id ?? '') || Math.abs(oldL.debit - newL.debit) > 0.01 || Math.abs(oldL.credit - newL.credit) > 0.01;
            if (changed) {
              await AuditLog.create({
                user_id: created_by,
                entity_type: 'acct_journal_entry',
                entity_id: id,
                action: 'update',
                field_name: `line_${i + 1}`,
                old_value: { account_id: oldL.account_id, entity_id: oldL.entity_id, debit: oldL.debit, credit: oldL.credit },
                new_value: newL,
                summary: `Línea ${i + 1} modificada: ${oldL.account_id} D${oldL.debit}/C${oldL.credit} → ${newL.account_id} D${newL.debit}/C${newL.credit}`,
              });
            }
          }
        }
      }
      await AcctJournalEntryLine.deleteMany({ journal_entry_id: id }).exec();
      for (const line of lines) {
        await AcctJournalEntryLine.create({
          journal_entry_id: id,
          account_id: line.account_id,
          entity_id: line.entity_id ?? null,
          debit: Math.round((Number(line.debit) || 0) * 100) / 100,
          credit: Math.round((Number(line.credit) || 0) * 100) / 100,
          description: line.description ?? '',
          currency: line.currency ?? 'USD',
        });
      }
    }
    if (created_by && (!lines || !Array.isArray(lines) || lines.length < 2)) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_journal_entry',
        entity_id: id,
        action: 'update',
        summary: `Asiento actualizado (cabecera): ${description ?? id}`,
      });
    }
    const updated = await AcctJournalEntry.findOne({ id }).lean().exec();
    const updatedLines = await AcctJournalEntryLine.find({ journal_entry_id: id }).lean().exec();
    res.json({ ...updated, lines: updatedLines });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

router.delete('/journal-entries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const created_by = req.query.created_by as string | undefined;
    const doc = await AcctJournalEntry.findOneAndDelete({ id }).lean().exec();
    if (!doc) {
      res.status(404).json({ error: 'Asiento no encontrado' });
      return;
    }
    await AcctJournalEntryLine.deleteMany({ journal_entry_id: id }).exec();
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_journal_entry',
        entity_id: id,
        action: 'delete',
        summary: `Asiento eliminado`,
      });
    }
    res.json({ id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

// --- Trial Balance (Balance de Comprobación) ---
router.get('/trial-balance', async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;
    const matchStage: Record<string, unknown> = {};
    if (start && end) {
      matchStage.date = { $gte: new Date(start as string), $lte: new Date(end as string) };
    } else if (start) {
      matchStage.date = { $gte: new Date(start as string) };
    } else if (end) {
      matchStage.date = { $lte: new Date(end as string) };
    }
    const entryMatch = Object.keys(matchStage).length > 0
      ? await AcctJournalEntry.find(matchStage).select('id').lean().exec()
      : await AcctJournalEntry.find({}).select('id').lean().exec();
    const entryIds = (entryMatch as { id: string }[]).map((e) => e.id);
    if (entryIds.length === 0) {
      return res.json({ rows: [], total_debit: 0, total_credit: 0 });
    }
    const pipeline = [
      { $match: { journal_entry_id: { $in: entryIds } } },
      { $group: { _id: '$account_id', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
    ];
    const results = await AcctJournalEntryLine.aggregate(pipeline).exec();
    const accountIds = (results as { _id: string }[]).map((r) => r._id);
    const accounts = accountIds.length > 0
      ? await AcctChartAccount.find({ id: { $in: accountIds } }).select('id code name type').lean().exec()
      : [];
    const accountMap = new Map((accounts as { id: string; code: string; name: string; type: string }[]).map((a) => [a.id, a]));
    const rows = (results as { _id: string; debit: number; credit: number }[])
      .map((r) => {
        const acc = accountMap.get(r._id);
        const debit = Math.round(r.debit * 100) / 100;
        const credit = Math.round(r.credit * 100) / 100;
        const balance = debit - credit;
        return {
          account_id: r._id,
          account_code: acc?.code ?? '',
          account_name: acc?.name ?? '',
          account_type: acc?.type ?? '',
          debit,
          credit,
          balance,
        };
      })
      .filter((r) => r.debit !== 0 || r.credit !== 0)
      .sort((a, b) => a.account_code.localeCompare(b.account_code));
    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    res.json({
      rows,
      total_debit: Math.round(totalDebit * 100) / 100,
      total_credit: Math.round(totalCredit * 100) / 100,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

export const contabilidadRouter = router;
