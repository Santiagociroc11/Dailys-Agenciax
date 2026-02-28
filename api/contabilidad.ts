import type { Request, Response } from 'express';
import { Router } from 'express';
import {
  AcctEntity,
  AcctCategory,
  AcctPaymentAccount,
  AcctTransaction,
  AuditLog,
} from '../models/index.js';

const router = Router();

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
    const doc = await AcctEntity.findOneAndUpdate(
      { id },
      { $set: { name, type, sort_order } },
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

// --- Categories ---
router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const list = await AcctCategory.find({}).sort({ type: 1, name: 1 }).lean().exec();
    res.json(list);
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
    if (entity_id) filter.entity_id = entity_id;
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
      { $group: { _id: '$entity_id', total_amount: { $sum: '$amount' } } },
      { $sort: { total_amount: -1 } }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await AcctTransaction.aggregate(pipeline as any[]).exec();
    const entityIds = (results as { _id: string | null }[]).map((r) => r._id).filter(Boolean);
    const entities = entityIds.length > 0
      ? await AcctEntity.find({ id: { $in: entityIds } }).select('id name type').lean().exec()
      : [];
    const entityMap = new Map(
      (entities as { id: string; name: string; type: string }[]).map((e) => [e.id, { name: e.name, type: e.type }])
    );

    const rows = (results as { _id: string | null; total_amount: number }[]).map((r) => ({
      entity_id: r._id,
      entity_name: r._id ? (entityMap.get(r._id)?.name ?? 'Sin asignar') : 'Sin asignar',
      entity_type: r._id ? (entityMap.get(r._id)?.type ?? null) : null,
      total_amount: Math.round(r.total_amount * 100) / 100,
    }));

    const grandTotal = rows.reduce((acc, r) => acc + r.total_amount, 0);

    res.json({ rows, grand_total: Math.round(grandTotal * 100) / 100 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

export const contabilidadRouter = router;
