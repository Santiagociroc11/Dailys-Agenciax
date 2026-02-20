import type { Request, Response } from 'express';
import { executeQuery } from '../lib/db/queryExecutor.js';
import type { QueryRequest } from '../lib/db/types.js';
import { Area, AreaUserAssignment, User, TaskWorkAssignment, Project } from '../models/index.js';

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
      const areaMap = new Map(areas.map((a) => [a.id, a]));
      data = assignments.map((a: { area_id: string }) => {
        const area = areaMap.get(a.area_id);
        return { area_id: a.area_id, area_name: area?.name, area_description: area?.description };
      });
    } else if (fn === 'get_users_by_area') {
      const areaId = params.area_uuid as string;
      const assignments = await AreaUserAssignment.find({ area_id: areaId }).lean().exec();
      const userIds = assignments.map((a: { user_id: string }) => a.user_id);
      const users = await User.find({ id: { $in: userIds } }).select('id name email').lean().exec();
      const userMap = new Map(users.map((u) => [u.id, u]));
      data = assignments.map((a: { user_id: string }) => {
        const user = userMap.get(a.user_id);
        return { user_id: a.user_id, user_name: user?.name, user_email: user?.email };
      });
    } else if (fn === 'get_daily_work_statistics') {
      const userId = params.user_id as string | undefined;
      const days = (params.days as number) ?? 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      const matchStage: Record<string, unknown> = { date: { $gte: cutoffStr } };
      if (userId) matchStage.user_id = userId;

      const pipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: { user_id: '$user_id', date: '$date' },
            total_tasks: { $sum: 1 },
            completed_tasks: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            total_estimated_minutes: { $sum: '$estimated_duration' },
            total_actual_minutes: {
              $sum: { $cond: [{ $ne: ['$actual_duration', null] }, '$actual_duration', 0] },
            },
            sum_actual_for_ratio: {
              $sum: { $cond: [{ $ne: ['$actual_duration', null] }, '$actual_duration', 0] },
            },
            sum_estimated_for_ratio: {
              $sum: {
                $cond: [{ $ne: ['$actual_duration', null] }, '$estimated_duration', 0] },
            },
          },
        },
        {
          $project: {
            user_id: '$_id.user_id',
            date: '$_id.date',
            total_tasks: 1,
            completed_tasks: 1,
            total_estimated_minutes: 1,
            total_actual_minutes: 1,
            efficiency_ratio: {
              $cond: [
                { $gt: ['$sum_estimated_for_ratio', 0] },
                { $divide: ['$sum_actual_for_ratio', '$sum_estimated_for_ratio'] },
                null,
              ],
            },
          },
        },
        { $sort: { date: -1 } },
        { $limit: days },
      ];

      const results = await TaskWorkAssignment.aggregate(pipeline).exec();
      data = results.map((r: { _id?: unknown }) => {
        const { _id, ...rest } = r;
        return rest;
      });
    } else if (fn === 'get_hours_for_billing') {
      const projectId = params.project_id as string | undefined;
      const startDate = params.start_date as string;
      const endDate = params.end_date as string;
      if (!startDate || !endDate) {
        res.status(400).json({ data: null, error: { message: 'Faltan start_date y end_date' } });
        return;
      }

      const matchStage: Record<string, unknown> = {
        date: { $gte: startDate, $lte: endDate },
        actual_duration: { $exists: true, $ne: null, $gt: 0 },
      };
      if (projectId) matchStage.project_id = projectId;

      const pipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: { project_id: '$project_id', user_id: '$user_id' },
            total_minutes: { $sum: '$actual_duration' },
            task_count: { $sum: 1 },
          },
        },
        { $sort: { '_id.project_id': 1, '_id.user_id': 1 } },
      ];

      const results = await TaskWorkAssignment.aggregate(pipeline).exec();
      const projectIds = [...new Set(results.map((r: { _id: { project_id?: string } }) => r._id.project_id).filter(Boolean))];
      const userIds = [...new Set(results.map((r: { _id: { user_id?: string } }) => r._id.user_id).filter(Boolean))];

      const [projects, users] = await Promise.all([
        Project.find({ id: { $in: projectIds } }).select('id name').lean().exec(),
        User.find({ id: { $in: userIds } }).select('id name email').lean().exec(),
      ]);
      const projectMap = new Map(projects.map((p: { id: string; name: string }) => [p.id, p.name]));
      const userMap = new Map(users.map((u: { id: string; name: string; email: string }) => [u.id, { name: u.name, email: u.email }]));

      data = results.map((r: { _id: { project_id?: string; user_id?: string }; total_minutes: number; task_count: number }) => ({
        project_id: r._id.project_id,
        project_name: projectMap.get(r._id.project_id || '') || 'Sin proyecto',
        user_id: r._id.user_id,
        user_name: r._id.user_id ? (userMap.get(r._id.user_id) as { name: string })?.name : null,
        user_email: r._id.user_id ? (userMap.get(r._id.user_id) as { email: string })?.email : null,
        total_minutes: r.total_minutes,
        total_hours: Math.round((r.total_minutes / 60) * 100) / 100,
        task_count: r.task_count,
      }));
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
