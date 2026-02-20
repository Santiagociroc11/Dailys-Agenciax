import type { Request, Response } from 'express';
import { executeQuery } from '../lib/db/queryExecutor.js';
import type { QueryRequest } from '../lib/db/types.js';
import { Area, AreaUserAssignment, User, TaskWorkAssignment, Project, ProjectTemplate, Task, Subtask } from '../models/index.js';

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
        { $sort: { date: -1 as const } },
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
        { $sort: { '_id.project_id': 1 as const, '_id.user_id': 1 as const } },
      ];

      const results = await TaskWorkAssignment.aggregate(pipeline).exec();
      const projectIds = [...new Set(results.map((r: { _id: { project_id?: string } }) => r._id.project_id).filter(Boolean))];
      const userIds = [...new Set(results.map((r: { _id: { user_id?: string } }) => r._id.user_id).filter(Boolean))];

      const [projects, users] = await Promise.all([
        Project.find({ id: { $in: projectIds } }).select('id name client_id').lean().exec(),
        User.find({ id: { $in: userIds } }).select('id name email').lean().exec(),
      ]);
      const projectMap = new Map(
        projects.map((p: { id: string; name: string; client_id?: string | null }) => [p.id, { name: p.name, client_id: p.client_id }])
      );
      const userMap = new Map(users.map((u: { id: string; name: string; email: string }) => [u.id, { name: u.name, email: u.email }]));

      const clientIds = [...new Set(projects.map((p: { client_id?: string | null }) => p.client_id).filter(Boolean))];
      const { Client } = await import('../models/index.js');
      const clientList = await Client.find({ id: { $in: clientIds } }).select('id name').lean().exec();
      const clientMap = new Map(clientList.map((c: { id: string; name: string }) => [c.id, c.name]));

      data = results.map((r: { _id: { project_id?: string; user_id?: string }; total_minutes: number; task_count: number }) => {
        const proj = projectMap.get(r._id.project_id || '');
        const clientId = proj?.client_id;
        return {
          project_id: r._id.project_id,
          project_name: proj?.name || 'Sin proyecto',
          client_id: clientId || null,
          client_name: clientId ? clientMap.get(clientId) || 'Sin cliente' : null,
          user_id: r._id.user_id,
          user_name: r._id.user_id ? (userMap.get(r._id.user_id) as { name: string })?.name : null,
          user_email: r._id.user_id ? (userMap.get(r._id.user_id) as { email: string })?.email : null,
          total_minutes: r.total_minutes,
          total_hours: Math.round((r.total_minutes / 60) * 100) / 100,
          task_count: r.task_count,
        };
      });
    } else if (fn === 'get_project_hours_consumed') {
      const pipeline = [
        { $match: { project_id: { $ne: null }, actual_duration: { $exists: true, $gt: 0 } } },
        { $group: { _id: '$project_id', total_minutes: { $sum: '$actual_duration' } } },
      ];
      const results = await TaskWorkAssignment.aggregate(pipeline).exec();
      data = results.map((r: { _id: string; total_minutes: number }) => ({
        project_id: r._id,
        hours_consumed: Math.round((r.total_minutes / 60) * 100) / 100,
      }));
    } else if (fn === 'create_template_from_project') {
      const projectId = params.project_id as string;
      const templateName = (params.template_name as string) || 'Plantilla';
      const createdBy = params.created_by as string;
      if (!projectId || !createdBy) {
        res.status(400).json({ data: null, error: { message: 'Faltan project_id y created_by' } });
        return;
      }
      const project = await Project.findOne({ id: projectId }).lean().exec();
      if (!project) {
        res.status(404).json({ data: null, error: { message: 'Proyecto no encontrado' } });
        return;
      }
      const projectTasks = await Task.find({ project_id: projectId }).lean().exec();
      const taskIds = projectTasks.map((t: { id: string }) => t.id);
      const allSubtasks = await Subtask.find({ task_id: { $in: taskIds } }).lean().exec();
      const subtasksByTask = new Map<string, typeof allSubtasks>();
      for (const st of allSubtasks) {
        const list = subtasksByTask.get(st.task_id) || [];
        list.push(st);
        subtasksByTask.set(st.task_id, list);
      }
      const templateTasks = projectTasks.map((t: { title: string; description?: string | null; estimated_duration: number; priority: string; is_sequential: boolean }) => {
        const subs = (subtasksByTask.get(t.id) || []).sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
        return {
          title: t.title,
          description: t.description ?? null,
          estimated_duration: t.estimated_duration ?? 60,
          priority: t.priority ?? 'medium',
          is_sequential: t.is_sequential ?? false,
          subtasks: subs.map((s: { title: string; description?: string | null; estimated_duration: number; sequence_order?: number | null }) => ({
            title: s.title,
            description: s.description ?? null,
            estimated_duration: s.estimated_duration ?? 30,
            sequence_order: s.sequence_order ?? null,
          })),
        };
      });
      const template = await ProjectTemplate.create({
        name: templateName,
        description: project.description ?? null,
        created_by: createdBy,
        source_project_id: projectId,
        tasks: templateTasks,
      });
      data = template.toObject ? template.toObject() : template;
    } else if (fn === 'create_project_from_template') {
      const templateId = params.template_id as string;
      const projectName = params.project_name as string;
      const description = (params.description as string) || '';
      const startDate = params.start_date as string;
      const deadline = params.deadline as string;
      const createdBy = params.created_by as string;
      const involvedUsers = (params.involved_users as string[]) || [];
      const clientId = (params.client_id as string) || null;
      const budgetHours = params.budget_hours as number | null;
      const budgetAmount = params.budget_amount as number | null;
      if (!templateId || !projectName || !startDate || !deadline || !createdBy || involvedUsers.length === 0) {
        res.status(400).json({ data: null, error: { message: 'Faltan template_id, project_name, start_date, deadline, created_by o involved_users' } });
        return;
      }
      const template = await ProjectTemplate.findOne({ id: templateId }).lean().exec();
      if (!template) {
        res.status(404).json({ data: null, error: { message: 'Plantilla no encontrada' } });
        return;
      }
      const uniqueUsers = [...new Set([...involvedUsers, createdBy])];
      const project = await Project.create({
        name: projectName,
        description: description || null,
        start_date: new Date(startDate),
        deadline: new Date(deadline),
        created_by: createdBy,
        client_id: clientId,
        budget_hours: budgetHours ?? null,
        budget_amount: budgetAmount ?? null,
      });
      for (const uid of uniqueUsers) {
        const u = await User.findOne({ id: uid }).lean().exec();
        if (u && u.assigned_projects) {
          await User.updateOne({ id: uid }, { $addToSet: { assigned_projects: project.id } }).exec();
        } else if (u) {
          await User.updateOne({ id: uid }, { $set: { assigned_projects: [project.id] } }).exec();
        }
      }
      let userIndex = 0;
      for (const t of template.tasks || []) {
        const task = await Task.create({
          title: t.title,
          description: t.description ?? null,
          start_date: new Date(startDate),
          deadline: new Date(deadline),
          estimated_duration: t.estimated_duration ?? 60,
          priority: (t.priority as string) ?? 'medium',
          is_sequential: t.is_sequential ?? false,
          created_by: createdBy,
          project_id: project.id,
          assigned_users: [],
          status: 'pending',
        });
        const subs = t.subtasks || [];
        if (subs.length > 0) {
          for (let i = 0; i < subs.length; i++) {
            const s = subs[i];
            const assignee = uniqueUsers[userIndex % uniqueUsers.length];
            userIndex++;
            await Subtask.create({
              title: s.title,
              description: s.description ?? null,
              estimated_duration: s.estimated_duration ?? 30,
              sequence_order: s.sequence_order ?? i + 1,
              assigned_to: assignee,
              task_id: task.id,
              start_date: new Date(startDate),
              deadline: new Date(deadline),
              status: 'pending',
            });
          }
        } else {
          const assignee = uniqueUsers[userIndex % uniqueUsers.length];
          userIndex++;
          await Task.updateOne({ id: task.id }, { $set: { assigned_users: [assignee] } }).exec();
        }
      }
      data = project.toObject ? project.toObject() : project;
    } else if (fn === 'get_capacity_by_user') {
      const workingHoursPerDay = (params.working_hours_per_day as number) ?? 8;
      const workingDaysPerWeek = (params.working_days_per_week as number) ?? 5;
      const availableHoursPerWeek = workingHoursPerDay * workingDaysPerWeek;

      const users = await User.find({ assigned_projects: { $exists: true, $ne: [] } })
        .select('id name email')
        .lean()
        .exec();

      const tasks = await Task.find({ status: { $nin: ['approved'] } })
        .select('id assigned_users estimated_duration')
        .lean()
        .exec();

      const taskIds = tasks.map((t: { id: string }) => t.id);
      const subtasks = await Subtask.find({
        task_id: { $in: taskIds },
        status: { $nin: ['approved'] },
        assigned_to: { $exists: true, $ne: null },
      })
        .select('task_id assigned_to estimated_duration')
        .lean()
        .exec();

      const tasksWithSubs = new Set(subtasks.map((s: { task_id: string }) => s.task_id));
      const userMinutes: Record<string, number> = {};
      for (const u of users) {
        userMinutes[u.id] = 0;
      }
      for (const t of tasks) {
        const subs = subtasks.filter((s: { task_id: string }) => s.task_id === t.id);
        if (subs.length > 0) {
          for (const s of subs) {
            const uid = (s as { assigned_to: string }).assigned_to;
            if (uid && userMinutes[uid] !== undefined) {
              userMinutes[uid] += (s as { estimated_duration: number }).estimated_duration || 0;
            }
          }
        } else {
          const userIds = (t as { assigned_users?: string[] }).assigned_users || [];
          const minutesPerUser = Math.round(((t as { estimated_duration: number }).estimated_duration || 0) / Math.max(userIds.length, 1));
          for (const uid of userIds) {
            if (userMinutes[uid] !== undefined) {
              userMinutes[uid] += minutesPerUser;
            }
          }
        }
      }

      data = users.map((u: { id: string; name: string; email: string }) => ({
        user_id: u.id,
        user_name: u.name,
        user_email: u.email,
        assigned_hours: Math.round((userMinutes[u.id] || 0) / 60 * 100) / 100,
        available_hours: availableHoursPerWeek,
        utilization_percent: availableHoursPerWeek > 0
          ? Math.round(((userMinutes[u.id] || 0) / 60 / availableHoursPerWeek) * 100)
          : 0,
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
