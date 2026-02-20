import type { Request, Response } from 'express';
import { executeQuery } from '../lib/db/queryExecutor.js';
import type { QueryRequest } from '../lib/db/types.js';
import { Area, AreaUserAssignment, User } from '../models/index.js';

export async function handleDbQuery(req: Request, res: Response): Promise<void> {
  try {
    const request = req.body as QueryRequest;

    if (!request?.table || !request?.operation) {
      res.status(400).json({
        data: null,
        error: { message: 'Faltan table u operation en el body' },
      });
      return;
    }

    const result = await executeQuery(request);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno';
    res.status(500).json({
      data: null,
      error: { message },
    });
  }
}

export async function handleDbRpc(req: Request, res: Response): Promise<void> {
  try {
    const { fn, params } = req.body as { fn: string; params: Record<string, unknown> };

    if (!fn || !params) {
      res.status(400).json({ data: null, error: { message: 'Faltan fn o params' } });
      return;
    }

    let data: unknown = null;

    if (fn === 'get_areas_by_user') {
      const userId = params.user_uuid as string;
      const assignments = await AreaUserAssignment.find({ user_id: userId }).lean().exec();
      const areaIds = assignments.map((a: { area_id: string }) => a.area_id);
      const areas = await Area.find({ id: { $in: areaIds } }).select('id name description').lean().exec();
      const areaMap = new Map(areas.map((a: { id: string }) => [a.id, a]));
      data = assignments.map((a: { area_id: string }) => {
        const area = areaMap.get(a.area_id);
        return { area_id: a.area_id, area_name: area?.name, area_description: area?.description };
      });
    } else if (fn === 'get_users_by_area') {
      const areaId = params.area_uuid as string;
      const assignments = await AreaUserAssignment.find({ area_id: areaId }).lean().exec();
      const userIds = assignments.map((a: { user_id: string }) => a.user_id);
      const users = await User.find({ id: { $in: userIds } }).select('id name email').lean().exec();
      const userMap = new Map(users.map((u: { id: string }) => [u.id, u]));
      data = assignments.map((a: { user_id: string }) => {
        const user = userMap.get(a.user_id);
        return { user_id: a.user_id, user_name: user?.name, user_email: user?.email };
      });
    } else {
      res.status(400).json({ data: null, error: { message: `RPC desconocida: ${fn}` } });
      return;
    }

    res.json({ data, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno';
    res.status(500).json({ data: null, error: { message } });
  }
}
