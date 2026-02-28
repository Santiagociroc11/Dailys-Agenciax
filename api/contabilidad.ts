import type { Request, Response } from 'express';
import { Router } from 'express';
import { parse } from 'csv-parse/sync';
import {
  AcctEntity,
  AcctCategory,
  AcctPaymentAccount,
  AcctTransaction,
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
    const doc = await AcctEntity.create({ name, type, sort_order: sort_order ?? 0 });
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
    const { name, type, sort_order } = req.body;
    const created_by = req.body.created_by as string | undefined;
    const existing = await AcctEntity.findOne({ id }).select('id name').lean().exec();
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
      const result = await AcctTransaction.updateMany({ entity_id: id }, { $set: { entity_id: targetId } }).exec();
      await AcctEntity.deleteOne({ id }).exec();
      if (created_by) {
        await AuditLog.create({
          user_id: created_by,
          entity_type: 'acct_entity',
          entity_id: targetId,
          action: 'merge',
          summary: `Entidad "${(existing as { name: string }).name}" renombrada y fusionada en "${name}" (${result.modifiedCount} transacciones)`,
        });
      }
      const merged = await AcctEntity.findOne({ id: targetId }).lean().exec();
      return res.json({ ...merged, _merged: true, merged_count: result.modifiedCount });
    }
    const doc = await AcctEntity.findOneAndUpdate(
      { id },
      { $set: { name: name ?? existing.name, type: type ?? (existing as { type?: string }).type, sort_order: sort_order ?? (existing as { sort_order?: number }).sort_order } },
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
    const count = await AcctTransaction.countDocuments({ entity_id: id }).exec();
    if (count > 0) {
      res.status(400).json({ error: `Hay ${count} transacciones con esta entidad. Usa "Fusionar" para reasignarlas a otra entidad antes de eliminar.` });
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
    const result = await AcctTransaction.updateMany(
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
    const doc = await AcctCategory.findOneAndUpdate(
      { id },
      { $set: { name, type, parent_id: parent_id ?? null } },
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
    const count = await AcctTransaction.countDocuments({ category_id: id }).exec();
    if (count > 0) {
      res.status(400).json({ error: `Hay ${count} transacciones con esta categoría. Usa "Fusionar" para reasignarlas antes de eliminar.` });
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
    const result = await AcctTransaction.updateMany(
      { category_id: id },
      { $set: { category_id: target_category_id } }
    ).exec();
    await AcctCategory.findOneAndDelete({ id }).exec();
    if (created_by) {
      await AuditLog.create({
        user_id: created_by,
        entity_type: 'acct_category',
        entity_id: id,
        action: 'merge',
        summary: `Categoría "${(source as { name: string }).name}" fusionada en "${(target as { name: string }).name}" (${result.modifiedCount} transacciones)`,
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

// --- Transactions ---
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const { start, end, entity_id, category_id, payment_account_id } = req.query;
    const filter: Record<string, unknown> = {};
    if (start && end) {
      filter.date = { $gte: new Date(start as string), $lte: new Date(end as string) };
    } else if (start) {
      filter.date = { $gte: new Date(start as string) };
    } else if (end) {
      filter.date = { $lte: new Date(end as string) };
    }
    if (entity_id !== undefined && entity_id !== null && entity_id !== '') {
      if (entity_id === '__null__' || entity_id === 'null') {
        filter.entity_id = null;
      } else {
        filter.entity_id = entity_id;
      }
    }
    if (category_id) filter.category_id = category_id;
    if (payment_account_id) filter.payment_account_id = payment_account_id;

    const list = await AcctTransaction.find(filter)
      .sort({ date: -1 })
      .lean()
      .exec();

    const entityIds = [...new Set((list as { entity_id?: string | null }[]).map((t) => t.entity_id).filter(Boolean))];
    const categoryIds = [...new Set((list as { category_id?: string | null }[]).map((t) => t.category_id).filter(Boolean))];
    const accountIds = [...new Set((list as { payment_account_id: string }[]).map((t) => t.payment_account_id))];

    const [entities, categories, accounts] = await Promise.all([
      entityIds.length > 0 ? AcctEntity.find({ id: { $in: entityIds } }).select('id name').lean().exec() : [],
      categoryIds.length > 0 ? AcctCategory.find({ id: { $in: categoryIds } }).select('id name').lean().exec() : [],
      accountIds.length > 0 ? AcctPaymentAccount.find({ id: { $in: accountIds } }).select('id name').lean().exec() : [],
    ]);

    const entityMap = new Map((entities as { id: string; name: string }[]).map((e) => [e.id, e.name]));
    const categoryMap = new Map((categories as { id: string; name: string }[]).map((c) => [c.id, c.name]));
    const accountMap = new Map((accounts as { id: string; name: string }[]).map((a) => [a.id, a.name]));

    const enriched = (list as { entity_id?: string | null; category_id?: string | null; payment_account_id: string }[]).map((t) => ({
      ...t,
      entity_name: t.entity_id ? entityMap.get(t.entity_id) ?? null : null,
      category_name: t.category_id ? categoryMap.get(t.category_id) ?? null : null,
      payment_account_name: accountMap.get(t.payment_account_id) ?? null,
    }));

    res.json(enriched);
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

// --- Balance ---
router.get('/balance', async (req: Request, res: Response) => {
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

    const pipeline: Record<string, unknown>[] = [];
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }
    pipeline.push(
      { $group: { _id: { entity_id: '$entity_id', currency: '$currency' }, total_amount: { $sum: '$amount' } } }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await AcctTransaction.aggregate(pipeline as any[]).exec();
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
    const { start, end } = req.query;
    const matchStage: Record<string, unknown> = {};
    if (start && end) {
      matchStage.date = { $gte: new Date(start as string), $lte: new Date(end as string) };
    } else if (start) {
      matchStage.date = { $gte: new Date(start as string) };
    } else if (end) {
      matchStage.date = { $lte: new Date(end as string) };
    }

    const excludedCategoryIds = (await AcctCategory.find({ name: { $regex: TRASLADO_UTILIDADES_REGEX } }).select('id').lean().exec())
      .map((c) => (c as { id: string }).id);

    const excludeTrasladoUtilidades: Record<string, unknown> = {
      $and: [
        { category_id: { $nin: excludedCategoryIds } },
        {
          $or: [
            { description: { $in: [null, ''] } },
            { description: { $not: { $regex: 'traslado.*utilidad|utilidad.*traslado|traslado\\s+utilidades', $options: 'i' } } },
          ],
        },
      ],
    };

    const pipeline: Record<string, unknown>[] = [];
    const fullMatch = Object.keys(matchStage).length > 0
      ? { $and: [matchStage, excludeTrasladoUtilidades] }
      : excludeTrasladoUtilidades;
    pipeline.push({ $match: fullMatch });
    pipeline.push({
      $group: {
        _id: { entity_id: '$entity_id', currency: '$currency' },
        ingresos: { $sum: { $cond: [{ $gte: ['$amount', 0] }, '$amount', 0] } },
        gastos: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } },
      },
    }, { $addFields: { resultado: { $subtract: ['$ingresos', '$gastos'] } } });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await AcctTransaction.aggregate(pipeline as any[]).exec();
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
    const rows = Array.from(rowMap.values()).map((r) => ({
      ...r,
      usd: { ingresos: Math.round(r.usd.ingresos * 100) / 100, gastos: Math.round(r.usd.gastos * 100) / 100, resultado: Math.round(r.usd.resultado * 100) / 100 },
      cop: { ingresos: Math.round(r.cop.ingresos * 100) / 100, gastos: Math.round(r.cop.gastos * 100) / 100, resultado: Math.round(r.cop.resultado * 100) / 100 },
    })).sort((a, b) => (b.usd.resultado + b.cop.resultado) - (a.usd.resultado + a.cop.resultado));

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

// --- Balance de cuentas (ubicación del dinero) ---
router.get('/account-balances', async (req: Request, res: Response) => {
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

    const pipeline: Record<string, unknown>[] = [];
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }
    pipeline.push(
      { $group: { _id: { payment_account_id: '$payment_account_id', currency: '$currency' }, total_amount: { $sum: '$amount' } } }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await AcctTransaction.aggregate(pipeline as any[]).exec();
    const accountIds = [...new Set((results as { _id: { payment_account_id: string } }[]).map((r) => r._id.payment_account_id).filter(Boolean))];
    const accounts = accountIds.length > 0
      ? await AcctPaymentAccount.find({ id: { $in: accountIds } }).select('id name currency').lean().exec()
      : [];
    const accountMap = new Map(
      (accounts as { id: string; name: string; currency?: string }[]).map((a) => [a.id, { name: a.name }])
    );

    const rowMap = new Map<string, { payment_account_id: string; account_name: string; usd: number; cop: number }>();
    for (const r of results as { _id: { payment_account_id: string; currency: string }; total_amount: number }[]) {
      const aid = r._id.payment_account_id;
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

      // Revisar columnas de cuentas
      for (let c = 0; c < accountHeaders.length; c++) {
        const cell = (row[accountColStart + c] || '').trim();
        const amount = parseAmount(cell);
        if (amount == null || amount === 0) continue;

        const accountName = accountHeaders[c];
        if (!accountName) continue;

        const accountId = await getOrCreateAccount(accountName);
        const categoryId = await getOrCreateCategory(categoryName, amount < 0);
        const type = amount >= 0 ? 'income' : 'expense';
        const amt = Math.round(amount * 100) / 100;
        const currency = Math.abs(amt) > 100000 ? 'COP' : default_currency;

        await AcctTransaction.create({
          date,
          amount: amt,
          currency,
          type,
          entity_id: entityId,
          category_id: categoryId,
          payment_account_id: accountId,
          description: descripcion.slice(0, 500),
          created_by: created_by ?? null,
        });
        created++;
        rowCreated++;
      }

      // Si no hubo montos en cuentas pero sí en IMPORTE CONTABLE, usar cuenta apropiada
      if (rowCreated === 0) {
        const importeCell = idxImporteContable >= 0 ? (row[idxImporteContable] || '').trim() : '';
        const amount = parseAmount(importeCell);
        const isMovContable = /SALIDA\s*CONTABLE|INGRESO\s*CONTABLE/i.test(tipoStr);
        if (amount != null && amount !== 0 && (isMovContable || accountHeaders.length > 0)) {
          const accountName = isMovContable ? 'Mov. Contable' : accountHeaders[0];
          const accountId = await getOrCreateAccount(accountName);
          const categoryId = await getOrCreateCategory(categoryName, amount < 0);
          const type = amount >= 0 ? 'income' : 'expense';
          const amt = Math.round(amount * 100) / 100;
          const currency = Math.abs(amt) > 100000 ? 'COP' : default_currency;
          await AcctTransaction.create({
            date,
            amount: amt,
            currency,
            type,
            entity_id: entityId,
            category_id: categoryId,
            payment_account_id: accountId,
            description: descripcion.slice(0, 500),
            created_by: created_by ?? null,
          });
          created++;
        }
      }
    }

    res.json({ created, skipped, entities: entityByName.size, categories: categoryByName.size, accounts: accountByName.size });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

export const contabilidadRouter = router;
