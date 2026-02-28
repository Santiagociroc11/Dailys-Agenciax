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
    const ids = (list as { id: string }[]).map((c) => c.id);
    if (ids.length === 0) return res.json([]);
    const agg = await AcctTransaction.aggregate([
      { $match: { category_id: { $in: ids } } },
      { $group: { _id: '$category_id', count: { $sum: 1 }, lastDate: { $max: '$date' } } },
    ]).exec();
    const countMap = new Map<string, number>();
    const lastDateMap = new Map<string, Date>();
    for (const r of agg as { _id: string; count: number; lastDate: Date }[]) {
      countMap.set(r._id, r.count);
      lastDateMap.set(r._id, r.lastDate);
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
router.get('/balance', async (req: Request, res: Response) => {
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

// --- Import CSV ---
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { csv_text, default_currency = 'USD' } = req.body as { csv_text?: string; default_currency?: string };
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
    let idxCategoria = headers.findIndex((h) => /CATEGOR[IÍ]A\/DETALLE/i.test(h));
    if (idxCategoria < 0) idxCategoria = headers.findIndex((h) => /^DETALLE$/i.test(h));
    if (idxCategoria < 0) idxCategoria = headers.findIndex((h) => /^CATEGOR[IÍ]A$/i.test(h));
    const idxImporteContable = headers.findIndex((h) => /IMPORTE\s*CONTABLE/i.test(h));
    const idxTipo = headers.findIndex((h) => /TIPO/i.test(h));

    if (idxFecha < 0 || idxProyecto < 0) {
      res.status(400).json({ error: 'CSV debe tener columnas FECHA y PROYECTO' });
      return;
    }

    // Columnas de cuentas: desde después de IMPORTE CONTABLE (o col 7) hasta el final
    const accountColStart = idxImporteContable >= 0 ? idxImporteContable + 1 : 7;
    const accountHeaders = headers.slice(accountColStart).filter((h) => h && !/^\s*$/.test(h));

    const entityByName = new Map<string, { id: string; type: string }>();
    const categoryByName = new Map<string, string>();
    const accountByName = new Map<string, string>();
    const chartAccountByBankName = new Map<string, string>();
    const chartAccountByCategoryName = new Map<string, string>();
    const maxBank = await AcctChartAccount.findOne({ code: /^1110-\d+$/ }).sort({ code: -1 }).select('code').lean().exec();
    const maxIncome = await AcctChartAccount.findOne({ code: /^4135-\d+$/ }).sort({ code: -1 }).select('code').lean().exec();
    const maxExpense = await AcctChartAccount.findOne({ code: /^5195-\d+$/ }).sort({ code: -1 }).select('code').lean().exec();
    let bankCounter = maxBank?.code ? parseInt(maxBank.code.split('-')[1] || '0', 10) : 0;
    let incomeCounter = maxIncome?.code ? parseInt(maxIncome.code.split('-')[1] || '0', 10) : 0;
    let expenseCounter = maxExpense?.code ? parseInt(maxExpense.code.split('-')[1] || '0', 10) : 0;

    async function getOrCreateChartAccountForBank(name: string): Promise<string> {
      const n = (name || '').trim() || 'Sin cuenta';
      if (chartAccountByBankName.has(n)) return chartAccountByBankName.get(n)!;
      bankCounter++;
      const code = `1110-${String(bankCounter).padStart(2, '0')}`;
      const existing = await AcctChartAccount.findOne({ code }).select('id').lean().exec();
      if (existing) {
        chartAccountByBankName.set(n, (existing as { id: string }).id);
        return (existing as { id: string }).id;
      }
      const doc = await AcctChartAccount.create({ code, name: n, type: 'asset', is_header: false, sort_order: bankCounter });
      chartAccountByBankName.set(n, doc.id);
      return doc.id;
    }

    async function getOrCreateChartAccountForCategory(name: string, isExpense: boolean): Promise<string> {
      const n = (name || '').trim() || 'Importación';
      const key = `${n}::${isExpense ? 'expense' : 'income'}`;
      if (chartAccountByCategoryName.has(key)) return chartAccountByCategoryName.get(key)!;
      if (isExpense) {
        expenseCounter++;
        const code = `5195-${String(expenseCounter).padStart(2, '0')}`;
        const existing = await AcctChartAccount.findOne({ code }).select('id').lean().exec();
        if (existing) {
          chartAccountByCategoryName.set(key, (existing as { id: string }).id);
          return (existing as { id: string }).id;
        }
        const doc = await AcctChartAccount.create({ code, name: n, type: 'expense', is_header: false, sort_order: expenseCounter });
        chartAccountByCategoryName.set(key, doc.id);
        return doc.id;
      } else {
        incomeCounter++;
        const code = `4135-${String(incomeCounter).padStart(2, '0')}`;
        const existing = await AcctChartAccount.findOne({ code }).select('id').lean().exec();
        if (existing) {
          chartAccountByCategoryName.set(key, (existing as { id: string }).id);
          return (existing as { id: string }).id;
        }
        const doc = await AcctChartAccount.create({ code, name: n, type: 'income', is_header: false, sort_order: incomeCounter });
        chartAccountByCategoryName.set(key, doc.id);
        return doc.id;
      }
    }

    async function getOrCreateEntity(name: string): Promise<string | null> {
      const n = (name || '').trim();
      if (!n || n === 'NA') return null;
      if (entityByName.has(n)) return entityByName.get(n)!.id;
      const type = /AGENCIA\s*X/i.test(n) ? 'agency' : /UTILIDADES|HOTMART|EQUIPO|NA/i.test(n) ? 'internal' : 'project';
      const existing = await AcctEntity.findOne({ name: n }).select('id').lean().exec();
      if (existing) {
        entityByName.set(n, { id: (existing as { id: string }).id, type });
        return (existing as { id: string }).id;
      }
      const doc = await AcctEntity.create({ name: n, type, sort_order: 0 });
      if (created_by) {
        await AuditLog.create({ user_id: created_by, entity_type: 'acct_entity', entity_id: doc.id, action: 'create', summary: `Import: ${n}` });
      }
      entityByName.set(n, { id: doc.id, type });
      return doc.id;
    }

    async function getOrCreateCategory(name: string, isExpense: boolean): Promise<string | null> {
      const n = (name || '').trim() || 'Importación';
      if (categoryByName.has(n)) return categoryByName.get(n)!;
      const existing = await AcctCategory.findOne({ name: n }).select('id').lean().exec();
      if (existing) {
        categoryByName.set(n, (existing as { id: string }).id);
        return (existing as { id: string }).id;
      }
      const doc = await AcctCategory.create({ name: n, type: isExpense ? 'expense' : 'income', parent_id: null });
      if (created_by) {
        await AuditLog.create({ user_id: created_by, entity_type: 'acct_category', entity_id: doc.id, action: 'create', summary: `Import: ${n}` });
      }
      categoryByName.set(n, doc.id);
      return doc.id;
    }

    async function getOrCreateAccount(name: string): Promise<string> {
      const n = (name || '').trim() || 'Sin cuenta';
      if (accountByName.has(n)) return accountByName.get(n)!;
      const existing = await AcctPaymentAccount.findOne({ name: n }).select('id').lean().exec();
      if (existing) {
        accountByName.set(n, (existing as { id: string }).id);
        return (existing as { id: string }).id;
      }
      const doc = await AcctPaymentAccount.create({ name: n, currency: default_currency });
      if (created_by) {
        await AuditLog.create({ user_id: created_by, entity_type: 'acct_payment_account', entity_id: doc.id, action: 'create', summary: `Import: ${n}` });
      }
      accountByName.set(n, doc.id);
      return doc.id;
    }

    let created = 0;
    let skipped = 0;

    for (let i = headerRow + 1; i < records.length; i++) {
      const row = records[i];
      const fechaStr = (row[idxFecha] || '').trim();
      let proyectoStr = (row[idxProyecto] || '').trim();
      const tipoStr = (idxTipo >= 0 ? (row[idxTipo] || '') : '').trim();
      const categoriaDetalle = (idxCategoria >= 0 ? (row[idxCategoria] || '').trim() : '');
      const descripcion = ((idxDescripcion >= 0 ? (row[idxDescripcion] || '').trim() : '') || categoriaDetalle).trim() || 'Sin descripción';
      const subcategoria = (idxSubcategoria >= 0 ? (row[idxSubcategoria] || '').trim() : '');
      const categoryName = subcategoria || categoriaDetalle || 'Importación';

      if (proyectoStr === 'TRASLADO') proyectoStr = 'AGENCIA X';
      if (proyectoStr === 'RETIRO HOTMART') proyectoStr = 'HOTMART';

      const date = parseSpanishDate(fechaStr);
      if (!date) {
        skipped++;
        continue;
      }

      const entityId = await getOrCreateEntity(proyectoStr);
      let rowCreated = 0;

      // Revisar columnas de cuentas — crear asientos (partida doble)
      for (let c = 0; c < accountHeaders.length; c++) {
        const cell = (row[accountColStart + c] || '').trim();
        const amount = parseAmount(cell);
        if (amount == null || amount === 0) continue;

        const accountName = accountHeaders[c];
        if (!accountName) continue;

        await getOrCreateAccount(accountName);
        await getOrCreateCategory(categoryName, amount < 0);
        const amt = Math.round(Math.abs(amount) * 100) / 100;
        const currency = Math.abs(amt) > 100000 ? 'COP' : default_currency;

        const bankChartId = await getOrCreateChartAccountForBank(accountName);
        const categoryChartId = await getOrCreateChartAccountForCategory(categoryName, amount < 0);

        const entry = await AcctJournalEntry.create({
          date,
          description: descripcion.slice(0, 500),
          reference: `Import ${i + 1}`,
          created_by: created_by ?? null,
        });

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

      // Si no hubo montos en cuentas pero sí en IMPORTE CONTABLE
      if (rowCreated === 0) {
        const importeCell = idxImporteContable >= 0 ? (row[idxImporteContable] || '').trim() : '';
        const amount = parseAmount(importeCell);
        const isMovContable = /SALIDA\s*CONTABLE|INGRESO\s*CONTABLE/i.test(tipoStr);
        if (amount != null && amount !== 0 && (isMovContable || accountHeaders.length > 0)) {
          const accountName = isMovContable ? 'Mov. Contable' : accountHeaders[0];
          await getOrCreateAccount(accountName);
          await getOrCreateCategory(categoryName, amount < 0);
          const amt = Math.round(Math.abs(amount) * 100) / 100;
          const currency = Math.abs(amount) > 100000 ? 'COP' : default_currency;

          const bankChartId = await getOrCreateChartAccountForBank(accountName);
          const categoryChartId = await getOrCreateChartAccountForCategory(categoryName, amount < 0);

          const entry = await AcctJournalEntry.create({
            date,
            description: descripcion.slice(0, 500),
            reference: `Import ${i + 1}`,
            created_by: created_by ?? null,
          });

          if (amount > 0) {
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: bankChartId, entity_id: entityId, debit: amt, credit: 0, description: descripcion.slice(0, 200), currency });
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: categoryChartId, entity_id: entityId, debit: 0, credit: amt, description: descripcion.slice(0, 200), currency });
          } else {
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: categoryChartId, entity_id: entityId, debit: amt, credit: 0, description: descripcion.slice(0, 200), currency });
            await AcctJournalEntryLine.create({ journal_entry_id: entry.id, account_id: bankChartId, entity_id: entityId, debit: 0, credit: amt, description: descripcion.slice(0, 200), currency });
          }
          created++;
        }
      }
    }

    res.json({ created, skipped, entities: entityByName.size, categories: categoryByName.size, accounts: accountByName.size, chart_accounts: chartAccountByBankName.size + chartAccountByCategoryName.size });
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
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_journal_entry',
        entity_id: id,
        action: 'update',
        summary: `Asiento actualizado: ${description ?? id}`,
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
