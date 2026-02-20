import type { Request, Response } from 'express';
import { executeQuery } from '../lib/db/queryExecutor.js';
import type { QueryRequest } from '../lib/db/types.js';
import { Area, AreaUserAssignment, User, TaskWorkAssignment, Project, ProjectTemplate, TaskTemplate, Task, Subtask, StatusHistory } from '../models/index.js';

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
        { $match: { project_id: { $ne: null } as Record<string, unknown>, actual_duration: { $exists: true, $gt: 0 } } },
        { $group: { _id: '$project_id', total_minutes: { $sum: '$actual_duration' } } },
      ];
      const results = await TaskWorkAssignment.aggregate(pipeline).exec();
      data = results.map((r: { _id: string; total_minutes: number }) => ({
        project_id: r._id,
        hours_consumed: Math.round((r.total_minutes / 60) * 100) / 100,
      }));
    } else if (fn === 'get_all_users_metrics') {
      const activeProjectIds = await Project.find({ is_archived: false }).select('id').lean().exec().then((r) => r.map((p: { id: string }) => p.id));
      const activeTaskIds = await Task.find({ project_id: { $in: activeProjectIds } }).select('id').lean().exec().then((r) => r.map((t: { id: string }) => t.id));
      const [subtaskAgg, taskIdsWithSubtasks] = await Promise.all([
        Subtask.aggregate([
          { $match: { assigned_to: { $exists: true, $ne: null }, task_id: { $in: activeTaskIds } } },
          {
            $group: {
              _id: '$assigned_to',
              tasksAssigned: { $sum: 1 },
              tasksApproved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
              tasksReturned: { $sum: { $cond: [{ $eq: ['$status', 'returned'] }, 1, 0] } },
              tasksDelivered: {
                $sum: { $cond: [{ $in: ['$status', ['approved', 'returned', 'completed', 'in_review']] }, 1, 0] } },
            },
          },
        ]).exec(),
        Subtask.distinct('task_id').exec(),
      ]);
      const taskIdsSet = new Set(taskIdsWithSubtasks as string[]);
      const taskAgg = await Task.aggregate([
        { $match: { id: { $nin: Array.from(taskIdsSet) }, project_id: { $in: activeProjectIds }, assigned_users: { $exists: true, $ne: [] } } },
        { $unwind: '$assigned_users' },
        {
          $group: {
            _id: '$assigned_users',
            tasksAssigned: { $sum: 1 },
            tasksApproved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
            tasksReturned: { $sum: { $cond: [{ $eq: ['$status', 'returned'] }, 1, 0] } },
            tasksDelivered: {
              $sum: { $cond: [{ $in: ['$status', ['approved', 'returned', 'completed', 'in_review']] }, 1, 0] } },
          },
        },
      ]).exec();
      const users = await User.find({}).select('id name email').lean().exec();
      const userMap = new Map(users.map((u: { id: string; name: string; email: string }) => [u.id, u]));
      const merged = new Map<string, { tasksAssigned: number; tasksApproved: number; tasksReturned: number; tasksDelivered: number }>();
      for (const u of users) {
        merged.set((u as { id: string }).id, { tasksAssigned: 0, tasksApproved: 0, tasksReturned: 0, tasksDelivered: 0 });
      }
      for (const r of subtaskAgg as { _id: string; tasksAssigned: number; tasksApproved: number; tasksReturned: number; tasksDelivered: number }[]) {
        const m = merged.get(r._id);
        if (m) {
          m.tasksAssigned += r.tasksAssigned;
          m.tasksApproved += r.tasksApproved;
          m.tasksReturned += r.tasksReturned;
          m.tasksDelivered += r.tasksDelivered;
        }
      }
      for (const r of taskAgg as { _id: string; tasksAssigned: number; tasksApproved: number; tasksReturned: number; tasksDelivered: number }[]) {
        const m = merged.get(r._id);
        if (m) {
          m.tasksAssigned += r.tasksAssigned;
          m.tasksApproved += r.tasksApproved;
          m.tasksReturned += r.tasksReturned;
          m.tasksDelivered += r.tasksDelivered;
        }
      }
      data = Array.from(merged.entries())
        .filter(([, m]) => m.tasksAssigned > 0)
        .map(([userId, m]) => {
          const u = userMap.get(userId) as { name: string; email: string } | undefined;
          const totalReviewed = m.tasksApproved + m.tasksReturned;
          const approvalRate = totalReviewed > 0 ? (m.tasksApproved / totalReviewed) * 100 : 100;
          const reworkRate = m.tasksDelivered > 0 ? (m.tasksReturned / m.tasksDelivered) * 100 : 0;
          return {
            userId,
            userName: u?.name || 'Sin nombre',
            userEmail: u?.email || 'Sin email',
            tasksCompleted: m.tasksApproved,
            tasksAssigned: m.tasksAssigned,
            tasksApproved: m.tasksApproved,
            tasksReturned: m.tasksReturned,
            completionRate: (m.tasksApproved / m.tasksAssigned) * 100,
            approvalRate,
            reworkRate,
            averageCompletionTime: 0,
            efficiencyRatio: 0,
            onTimeDeliveryRate: 0,
            overdueTasks: 0,
            upcomingDeadlines: 0,
            averageTasksPerDay: 0,
            tasksCompletedThisWeek: 0,
            tasksCompletedThisMonth: 0,
          };
        })
        .sort((a, b) => (b.tasksApproved / b.tasksAssigned) - (a.tasksApproved / a.tasksAssigned));
    } else if (fn === 'get_project_metrics') {
      const now = new Date();
      const activeProjectIds = await Project.find({ is_archived: false }).select('id').lean().exec().then((r) => r.map((p: { id: string }) => p.id));
      const [projects, taskStats, subtaskStats, avgTimeByProject] = await Promise.all([
        Project.find({ is_archived: false }).select('id name deadline').lean().exec(),
        Task.aggregate([
          { $match: { project_id: { $in: activeProjectIds } } },
          {
            $group: {
              _id: '$project_id',
              totalTasks: { $sum: 1 },
              completedTasks: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
              assignedUsers: { $addToSet: '$assigned_users' },
            },
          },
          { $addFields: { assignedUsers: { $reduce: { input: '$assignedUsers', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } } } },
          { $addFields: { teamSize: { $size: '$assignedUsers' } } },
        ]).exec(),
        Subtask.aggregate([
          { $lookup: { from: 'tasks', localField: 'task_id', foreignField: 'id', as: 'task' } },
          { $unwind: '$task' },
          { $match: { 'task.project_id': { $in: activeProjectIds } } },
          {
            $group: {
              _id: '$task.project_id',
              totalSubtasks: { $sum: 1 },
              completedSubtasks: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
              assignedUsers: { $addToSet: '$assigned_to' },
            },
          },
          { $addFields: { teamSize: { $size: '$assignedUsers' } } },
        ]).exec(),
        TaskWorkAssignment.aggregate([
          { $match: { project_id: { $in: activeProjectIds }, actual_duration: { $gt: 0 } } },
          { $group: { _id: '$project_id', totalMinutes: { $sum: '$actual_duration' }, count: { $sum: 1 } } },
        ]).exec(),
      ]);
      const taskMap = new Map((taskStats as { _id: string; totalTasks: number; completedTasks: number; teamSize: number }[]).map((t) => [t._id, t]));
      const subtaskMap = new Map((subtaskStats as { _id: string; totalSubtasks: number; completedSubtasks: number; teamSize: number }[]).map((s) => [s._id, s]));
      const avgTimeMap = new Map((avgTimeByProject as { _id: string; totalMinutes: number; count: number }[]).map((a) => [a._id, a]));
      data = (projects as { id: string; name: string; deadline?: Date }[]).map((p) => {
        const t = taskMap.get(p.id);
        const s = subtaskMap.get(p.id);
        const totalTasks = (t?.totalTasks ?? 0) + (s?.totalSubtasks ?? 0);
        const completedTasks = (t?.completedTasks ?? 0) + (s?.completedSubtasks ?? 0);
        const teamSize = Math.max(t?.teamSize ?? 0, s?.teamSize ?? 0);
        const avgData = avgTimeMap.get(p.id);
        const averageTimePerTask = avgData && avgData.count > 0 ? avgData.totalMinutes / avgData.count : 0;
        const daysUntilDeadline = p.deadline
          ? Math.ceil((new Date(p.deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
        return {
          projectId: p.id,
          projectName: p.name,
          totalTasks,
          completedTasks,
          completionRate,
          teamSize,
          averageTimePerTask,
          onSchedule: completionRate >= 75 && daysUntilDeadline > 0,
          daysUntilDeadline,
        };
      });
    } else if (fn === 'get_all_users_utilization_metrics') {
      const workingHoursPerDay = (params.working_hours_per_day as number) ?? 8;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthStr = startOfMonth.toISOString().split('T')[0];
      const activeProjectIds = await Project.find({ is_archived: false }).select('id').lean().exec().then((r) => r.map((p: { id: string }) => p.id));
      const pipeline = [
        {
          $match: {
            project_id: { $in: activeProjectIds },
            actual_duration: { $gt: 0 },
            date: { $gte: monthStr },
          },
        },
        {
          $group: {
            _id: '$user_id',
            totalMinutes: { $sum: '$actual_duration' },
            daysWorked: { $addToSet: '$date' },
            totalTaskDurations: { $push: '$actual_duration' },
          },
        },
        {
          $addFields: {
            workingDaysThisMonth: { $size: '$daysWorked' },
            totalHoursThisMonth: { $divide: ['$totalMinutes', 60] },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: 'id',
            as: 'user',
          },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            userId: '$_id',
            userName: '$user.name',
            userEmail: '$user.email',
            totalMinutes: 1,
            workingDaysThisMonth: 1,
            totalHoursThisMonth: 1,
            totalTaskDurations: 1,
          },
        },
      ];
      const results = await TaskWorkAssignment.aggregate(pipeline).exec();
      const usersWithProjects = await User.find({ assigned_projects: { $exists: true, $ne: [] } })
        .select('id')
        .lean()
        .exec();
      const activeUserIds = new Set(usersWithProjects.map((u: { id: string }) => u.id));
      data = (results as {
        userId: string;
        userName: string;
        userEmail: string;
        totalMinutes: number;
        workingDaysThisMonth: number;
        totalHoursThisMonth: number;
        totalTaskDurations: number[];
      }[]).map((r) => {
        if (!activeUserIds.has(r.userId)) return null;
        const expectedHoursThisMonth = r.workingDaysThisMonth * workingHoursPerDay;
        const monthlyUtilizationRate = expectedHoursThisMonth > 0 ? (r.totalHoursThisMonth / expectedHoursThisMonth) * 100 : 0;
        const weeklyMinutes = 0;
        const workingDaysThisWeek = 0;
        const expectedHoursThisWeek = workingDaysThisWeek * workingHoursPerDay;
        const weeklyUtilizationRate = expectedHoursThisWeek > 0 ? 0 : 0;
        const avgDaily = r.workingDaysThisMonth > 0 ? r.totalHoursThisMonth / r.workingDaysThisMonth : 0;
        const utilizationRate = monthlyUtilizationRate;
        const avgTaskDuration = r.totalTaskDurations.length > 0
          ? r.totalTaskDurations.reduce((a, b) => a + b, 0) / r.totalTaskDurations.length
          : 0;
        return {
          userId: r.userId,
          userName: r.userName || 'Usuario',
          userEmail: r.userEmail || '',
          workingHoursPerDay,
          averageHoursWorkedPerDay: avgDaily,
          utilizationRate,
          idleTime: Math.max(0, workingHoursPerDay * 60 - (r.totalMinutes / (r.workingDaysThisMonth || 1))),
          totalHoursThisWeek: weeklyMinutes / 60,
          expectedHoursThisWeek,
          weeklyUtilizationRate,
          totalHoursThisMonth: r.totalHoursThisMonth,
          expectedHoursThisMonth: expectedHoursThisMonth,
          monthlyUtilizationRate,
          mostProductiveTimeOfDay: '09:00',
          averageTaskDuration: avgTaskDuration,
          workingDaysThisMonth: r.workingDaysThisMonth,
          isUnderutilized: utilizationRate < 70,
          isOverutilized: utilizationRate > 110,
          consistencyScore: 80,
        };
      }).filter(Boolean);
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
      const templateTasks = projectTasks.map((t: { id: string; title: string; description?: string | null; estimated_duration: number; priority: string; is_sequential: boolean; checklist?: Array<{ id: string; title: string; checked?: boolean; order?: number }> }) => {
        const subs = (subtasksByTask.get(t.id) || []).sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
        const taskChecklist = (t.checklist || []).map((c: { id: string; title: string; order?: number }) => ({ id: c.id, title: c.title, order: c.order ?? 0 }));
        return {
          title: t.title,
          description: t.description ?? null,
          estimated_duration: t.estimated_duration ?? 60,
          priority: t.priority ?? 'medium',
          is_sequential: t.is_sequential ?? false,
          checklist: taskChecklist,
          subtasks: subs.map((s: { title: string; description?: string | null; estimated_duration: number; sequence_order?: number | null; checklist?: Array<{ id: string; title: string; order?: number }> }) => {
            const subChecklist = (s.checklist || []).map((c: { id: string; title: string; order?: number }) => ({ id: c.id, title: c.title, order: c.order ?? 0 }));
            return {
              title: s.title,
              description: s.description ?? null,
              estimated_duration: s.estimated_duration ?? 30,
              sequence_order: s.sequence_order ?? null,
              checklist: subChecklist,
            };
          }),
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
        const taskChecklist = (t.checklist || []).map((c: { id: string; title: string; order?: number }) => ({
          id: c.id,
          title: c.title,
          checked: false,
          order: c.order ?? 0,
        }));
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
          checklist: taskChecklist,
        });
        const subs: Array<{ title: string; description?: string | null; estimated_duration: number; sequence_order?: number | null; checklist?: Array<{ id: string; title: string; order?: number }> }> = t.subtasks || [];
        if (subs.length > 0) {
          for (let i = 0; i < subs.length; i++) {
            const s = subs[i];
            const assignee = uniqueUsers[userIndex % uniqueUsers.length];
            userIndex++;
            const subChecklist = (s.checklist || []).map((c: { id: string; title: string; order?: number }) => ({
              id: c.id,
              title: c.title,
              checked: false,
              order: c.order ?? 0,
            }));
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
              checklist: subChecklist,
            });
          }
        } else {
          const assignee = uniqueUsers[userIndex % uniqueUsers.length];
          userIndex++;
          await Task.updateOne({ id: task.id }, { $set: { assigned_users: [assignee] } }).exec();
        }
      }
      data = project.toObject ? project.toObject() : project;
    } else if (fn === 'create_task_template_from_task') {
      const taskId = params.task_id as string;
      const templateName = (params.template_name as string) || 'Plantilla de tarea';
      const createdBy = params.created_by as string;
      if (!taskId || !createdBy) {
        res.status(400).json({ data: null, error: { message: 'Faltan task_id o created_by' } });
        return;
      }
      const task = await Task.findOne({ id: taskId }).lean().exec();
      if (!task) {
        res.status(404).json({ data: null, error: { message: 'Tarea no encontrada' } });
        return;
      }
      const subs = await Subtask.find({ task_id: taskId }).sort({ sequence_order: 1 }).lean().exec();
      const templateSubs = subs.map((s: { title: string; description?: string | null; estimated_duration: number; sequence_order?: number | null; checklist?: Array<{ id: string; title: string; order?: number }> }) => ({
        title: s.title,
        description: s.description ?? null,
        estimated_duration: s.estimated_duration ?? 30,
        sequence_order: s.sequence_order ?? null,
        checklist: (s.checklist || []).map((c: { id: string; title: string; order?: number }) => ({ id: c.id, title: c.title, order: c.order ?? 0 })),
      }));
      const taskChecklist = ((task as { checklist?: Array<{ id: string; title: string; checked?: boolean; order?: number }> }).checklist || []).map((c) => ({
        id: c.id,
        title: c.title,
        order: c.order ?? 0,
      }));
      const template = await TaskTemplate.create({
        name: templateName,
        title: (task as { title: string }).title,
        description: (task as { description?: string | null }).description ?? null,
        estimated_duration: (task as { estimated_duration: number }).estimated_duration ?? 60,
        priority: (task as { priority?: string }).priority ?? 'medium',
        is_sequential: (task as { is_sequential?: boolean }).is_sequential ?? false,
        subtasks: templateSubs,
        checklist: taskChecklist,
        created_by: createdBy,
        source_task_id: taskId,
      });
      data = template.toObject ? template.toObject() : template;
    } else if (fn === 'create_task_from_template') {
      const templateId = params.template_id as string;
      const projectId = params.project_id as string;
      const startDate = params.start_date as string;
      const deadline = params.deadline as string;
      const createdBy = params.created_by as string;
      const assignedUsers = (params.assigned_users as string[]) || [];
      if (!templateId || !projectId || !startDate || !deadline || !createdBy) {
        res.status(400).json({ data: null, error: { message: 'Faltan template_id, project_id, start_date, deadline o created_by' } });
        return;
      }
      const template = await TaskTemplate.findOne({ id: templateId }).lean().exec();
      if (!template) {
        res.status(404).json({ data: null, error: { message: 'Plantilla de tarea no encontrada' } });
        return;
      }
      const users = assignedUsers.length > 0 ? assignedUsers : [createdBy];
      const taskChecklist = ((template as { checklist?: Array<{ id: string; title: string; order?: number }> }).checklist || []).map((c) => ({
        id: c.id,
        title: c.title,
        checked: false,
        order: c.order ?? 0,
      }));
      const task = await Task.create({
        title: (template as { title: string }).title,
        description: (template as { description?: string | null }).description ?? null,
        start_date: new Date(startDate),
        deadline: new Date(deadline),
        estimated_duration: (template as { estimated_duration: number }).estimated_duration ?? 60,
        priority: (template as { priority?: string }).priority ?? 'medium',
        is_sequential: (template as { is_sequential?: boolean }).is_sequential ?? false,
        created_by: createdBy,
        project_id: projectId,
        assigned_users: [],
        status: 'pending',
        checklist: taskChecklist,
      });
      const subs: Array<{ title: string; description?: string | null; estimated_duration: number; sequence_order?: number | null; checklist?: Array<{ id: string; title: string; order?: number }> }> = (template as { subtasks?: Array<{ title: string; description?: string | null; estimated_duration: number; sequence_order?: number | null; checklist?: Array<{ id: string; title: string; order?: number }> }> }).subtasks || [];
      let userIdx = 0;
      for (let i = 0; i < subs.length; i++) {
        const s = subs[i];
        const assignee = users[userIdx % users.length];
        userIdx++;
        const subChecklist = (s.checklist || []).map((c) => ({ id: c.id, title: c.title, checked: false, order: c.order ?? 0 }));
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
          checklist: subChecklist,
        });
      }
      if (subs.length === 0) {
        await Task.updateOne({ id: task.id }, { $set: { assigned_users: [users[0]] } }).exec();
      } else {
        const subUsers = [...new Set(subs.map((_, i) => users[i % users.length]))];
        await Task.updateOne({ id: task.id }, { $set: { assigned_users: subUsers } }).exec();
      }
      data = task.toObject ? task.toObject() : task;
    } else if (fn === 'get_audit_logs') {
      const entityType = params.entity_type as string | undefined;
      const entityId = params.entity_id as string | undefined;
      const userId = params.user_id as string | undefined;
      const limit = (params.limit as number) ?? 100;
      const startDate = params.start_date as string | undefined;
      const endDate = params.end_date as string | undefined;

      const { AuditLog } = await import('../models/index.js');
      const filter: Record<string, unknown> = {};
      if (entityType) filter.entity_type = entityType;
      if (entityId) filter.entity_id = entityId;
      if (userId) filter.user_id = userId;
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) (filter.createdAt as Record<string, unknown>).$gte = new Date(startDate);
        if (endDate) (filter.createdAt as Record<string, unknown>).$lte = new Date(endDate + 'T23:59:59.999Z');
      }

      const logs = await AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec();

      const userIds = [...new Set((logs as { user_id: string }[]).map((l) => l.user_id))];
      const users = await User.find({ id: { $in: userIds } }).select('id name').lean().exec();
      const userMap = new Map(users.map((u: { id: string; name: string }) => [u.id, u.name]));

      data = (logs as { id?: string; user_id: string; entity_type: string; entity_id: string; action: string; field_name?: string; summary?: string; createdAt: Date }[]).map((l) => ({
        ...l,
        createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : String(l.createdAt),
        user_name: userMap.get(l.user_id) || 'Desconocido',
      }));
    } else if (fn === 'get_cost_by_user') {
      const startDate = params.start_date as string;
      const endDate = params.end_date as string;
      if (!startDate || !endDate) {
        res.status(400).json({ data: null, error: { message: 'Faltan start_date y end_date' } });
        return;
      }

      const pipeline = [
        {
          $match: {
            date: { $gte: startDate, $lte: endDate },
            actual_duration: { $exists: true, $ne: null, $gt: 0 } as Record<string, unknown>,
          },
        },
        {
          $group: {
            _id: '$user_id',
            total_minutes: { $sum: '$actual_duration' },
            task_count: { $sum: 1 },
          },
        },
      ];

      const results = await TaskWorkAssignment.aggregate(pipeline).exec();
      const userIds = results.map((r: { _id: string }) => r._id);
      const users = await User.find({ id: { $in: userIds } }).select('id name email hourly_rate monthly_salary currency payment_account').lean().exec();
      const userMap = new Map(users.map((u: { id: string; name: string; email: string; hourly_rate?: number | null; monthly_salary?: number | null; currency?: string; payment_account?: string | null }) => [u.id, u]));

      data = results.map((r: { _id: string; total_minutes: number; task_count: number }) => {
        const u = userMap.get(r._id) as { name: string; email: string; hourly_rate?: number | null; monthly_salary?: number | null; currency?: string; payment_account?: string | null } | undefined;
        const hours = r.total_minutes / 60;
        const fromSalary = (u?.hourly_rate == null || u.hourly_rate <= 0) && (u?.monthly_salary != null && u.monthly_salary > 0);
        const isFreelancer = u?.hourly_rate != null && u.hourly_rate > 0;

        // Coste real: empleados = sueldo mensual fijo; freelancers = horas × tarifa
        const totalCost = fromSalary && u?.monthly_salary
          ? u.monthly_salary
          : isFreelancer && u?.hourly_rate
            ? hours * u.hourly_rate
            : null;

        // Coste por hora efectiva: sueldo ÷ horas. Más alto = menos eficiente (trabajan menos)
        const effectiveCostPerHour = totalCost != null && hours > 0 ? totalCost / hours : null;

        return {
          user_id: r._id,
          user_name: u?.name || 'Sin nombre',
          user_email: u?.email || '',
          total_hours: Math.round(hours * 100) / 100,
          task_count: r.task_count,
          monthly_salary: u?.monthly_salary ?? null,
          rate_source: totalCost != null ? (fromSalary ? 'salary' : 'hourly') : null,
          currency: u?.currency || 'COP',
          payment_account: u?.payment_account ?? null,
          total_cost: totalCost != null ? Math.round(totalCost * 100) / 100 : null,
          effective_cost_per_hour: effectiveCostPerHour != null ? Math.round(effectiveCostPerHour * 100) / 100 : null,
        };
      }).sort((a: { effective_cost_per_hour: number | null }, b: { effective_cost_per_hour: number | null }) => {
        const ah = a.effective_cost_per_hour ?? 0;
        const bh = b.effective_cost_per_hour ?? 0;
        return bh - ah;
      });
    } else if (fn === 'get_payroll_beneficiaries') {
      const startDate = params.start_date as string;
      const endDate = params.end_date as string;
      if (!startDate || !endDate) {
        res.status(400).json({ data: null, error: { message: 'Faltan start_date y end_date' } });
        return;
      }
      const users = await User.find({
        $or: [{ monthly_salary: { $gt: 0 } }, { hourly_rate: { $gt: 0 } }],
      })
        .select('id name email monthly_salary hourly_rate payment_account currency')
        .lean()
        .exec();
      const userIds = (users as { id: string }[]).map((u) => u.id);
      const hoursAgg = await TaskWorkAssignment.aggregate([
        {
          $match: {
            date: { $gte: startDate, $lte: endDate },
            actual_duration: { $exists: true, $ne: null, $gt: 0 } as Record<string, unknown>,
          },
        },
        { $group: { _id: '$user_id', total_minutes: { $sum: '$actual_duration' } } },
      ]).exec();
      const hoursMap = new Map(
        (hoursAgg as { _id: string; total_minutes: number }[]).map((h) => [h._id, h.total_minutes / 60])
      );
      data = (users as { id: string; name: string; email: string; monthly_salary?: number | null; hourly_rate?: number | null; payment_account?: string | null; currency?: string }[]).map(
        (u) => {
          const hasSalary = u.monthly_salary != null && u.monthly_salary > 0;
          const hasHourly = u.hourly_rate != null && u.hourly_rate > 0;
          const hours = hoursMap.get(u.id) ?? 0;
          const amount =
            hasSalary && u.monthly_salary
              ? u.monthly_salary
              : hasHourly && u.hourly_rate
                ? Math.round(hours * u.hourly_rate * 100) / 100
                : null;
          return {
            user_id: u.id,
            user_name: u.name,
            user_email: u.email,
            payment_account: u.payment_account ?? null,
            amount: amount,
            currency: u.currency || 'COP',
            source: hasSalary ? 'salary' : hasHourly ? 'hourly' : null,
            hours_worked: hasHourly ? Math.round(hours * 100) / 100 : null,
          };
        }
      );
    } else if (fn === 'get_cost_by_area') {
      const startDate = params.start_date as string;
      const endDate = params.end_date as string;
      if (!startDate || !endDate) {
        res.status(400).json({ data: null, error: { message: 'Faltan start_date y end_date' } });
        return;
      }

      const assignments = await AreaUserAssignment.find({}).lean().exec();
      const userToArea = new Map<string, string>();
      for (const a of assignments as { user_id: string; area_id: string }[]) {
        if (!userToArea.has(a.user_id)) userToArea.set(a.user_id, a.area_id);
      }

      const pipeline = [
        {
          $match: {
            date: { $gte: startDate, $lte: endDate },
            actual_duration: { $exists: true, $ne: null, $gt: 0 } as Record<string, unknown>,
          },
        },
        { $group: { _id: '$user_id', total_minutes: { $sum: '$actual_duration' } } },
      ];
      const results = await TaskWorkAssignment.aggregate(pipeline).exec();
      const userIds = [...new Set(results.map((r: { _id: string }) => r._id))];
      const users = await User.find({ id: { $in: userIds } }).select('id hourly_rate monthly_salary currency').lean().exec();
      const userMap = new Map(users.map((u: { id: string; hourly_rate?: number | null; monthly_salary?: number | null; currency?: string }) => [u.id, u]));

      const areaCosts: Record<string, { minutes: number; cost: number; currency: string }> = {};
      const areas = await Area.find({}).select('id name').lean().exec();
      for (const a of areas as { id: string; name: string }[]) {
        areaCosts[a.id] = { minutes: 0, cost: 0, currency: 'COP' };
      }

      for (const r of results as { _id: string; total_minutes: number }[]) {
        const areaId = userToArea.get(r._id);
        if (!areaId || !areaCosts[areaId]) continue;
        const u = userMap.get(r._id) as { hourly_rate?: number | null; monthly_salary?: number | null; currency?: string } | undefined;
        const fromSalary = (u?.hourly_rate == null || u.hourly_rate <= 0) && (u?.monthly_salary != null && u.monthly_salary > 0);
        const isFreelancer = u?.hourly_rate != null && u.hourly_rate > 0;
        const hours = r.total_minutes / 60;
        const cost = fromSalary && u?.monthly_salary
          ? u.monthly_salary
          : isFreelancer && u?.hourly_rate
            ? hours * u.hourly_rate
            : 0;
        areaCosts[areaId].minutes += r.total_minutes;
        areaCosts[areaId].cost += cost;
        if (u?.currency) areaCosts[areaId].currency = u.currency;
      }

      const areaMap = new Map((areas as { id: string; name: string }[]).map((a) => [a.id, a.name]));
      data = Object.entries(areaCosts).map(([areaId, v]) => ({
        area_id: areaId,
        area_name: areaMap.get(areaId) || '—',
        total_hours: Math.round((v.minutes / 60) * 100) / 100,
        total_cost: Math.round(v.cost * 100) / 100,
        currency: v.currency,
      })).sort((a: { total_cost: number }, b: { total_cost: number }) => b.total_cost - a.total_cost);
    } else if (fn === 'get_capacity_by_user') {
      const workingHoursPerDay = (params.working_hours_per_day as number) ?? 8;
      const workingDaysPerWeek = (params.working_days_per_week as number) ?? 5;
      const availableHoursPerWeek = workingHoursPerDay * workingDaysPerWeek;

      // Solo considerar trabajo con deadline en ventana de planificación (no todo el histórico).
      // Incluye: hasta 1 semana vencido + próximas 2 semanas = 3 semanas de carga activa.
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const windowStart = new Date(startOfToday);
      windowStart.setDate(windowStart.getDate() - 7);
      const windowEnd = new Date(startOfToday);
      windowEnd.setDate(windowEnd.getDate() + 14);
      const deadlineFilter = { deadline: { $gte: windowStart, $lte: windowEnd } };
      const availableHoursInWindow = availableHoursPerWeek * 3; // 3 semanas

      const activeProjectIds = await Project.find({ is_archived: false })
        .select('id')
        .lean()
        .exec()
        .then((r) => r.map((p: { id: string }) => p.id));

      const users = await User.find({ assigned_projects: { $exists: true, $ne: [] } })
        .select('id name email')
        .lean()
        .exec();

      const tasks = await Task.find({
        status: { $nin: ['approved'] },
        ...deadlineFilter,
        $or: [
          { project_id: { $in: activeProjectIds } },
          { project_id: null },
        ],
      })
        .select('id assigned_users estimated_duration')
        .lean()
        .exec();

      const taskIds = tasks.map((t: { id: string }) => t.id);
      const subtasks = await Subtask.find({
        task_id: { $in: taskIds },
        status: { $nin: ['approved'] },
        assigned_to: { $exists: true, $ne: null },
        ...deadlineFilter,
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
        available_hours: availableHoursInWindow,
        utilization_percent: availableHoursInWindow > 0
          ? Math.round(((userMinutes[u.id] || 0) / 60 / availableHoursInWindow) * 100)
          : 0,
      }));
    } else if (fn === 'get_activity_log') {
      const startDate = params.start_date as string | undefined;
      const endDate = params.end_date as string | undefined;
      const userId = params.user_id as string | undefined;
      const activityType = params.activity_type as string | undefined;
      const limit = (params.limit as number) ?? 200;

      const filter: Record<string, unknown> = {};
      if (userId) filter.changed_by = userId;
      if (activityType) filter.new_status = activityType;
      if (startDate || endDate) {
        filter.changed_at = {};
        if (startDate) (filter.changed_at as Record<string, unknown>).$gte = new Date(startDate);
        if (endDate) (filter.changed_at as Record<string, unknown>).$lte = new Date(endDate + 'T23:59:59.999Z');
      }

      const logs = await StatusHistory.find(filter)
        .sort({ changed_at: -1 })
        .limit(limit)
        .lean()
        .exec();

      const logsTyped = logs as { id: string; task_id?: string | null; subtask_id?: string | null; changed_at: Date; changed_by?: string | null; previous_status?: string | null; new_status: string }[];

      const taskIdsFromLogs = [...new Set(logsTyped.map((l) => l.task_id).filter(Boolean))] as string[];
      const subtaskIds = [...new Set(logsTyped.map((l) => l.subtask_id).filter(Boolean))] as string[];
      const userIds = [...new Set(logsTyped.map((l) => l.changed_by).filter(Boolean))] as string[];

      const [tasksRaw, subtasksRaw, usersRaw] = await Promise.all([
        Task.find({ id: { $in: taskIdsFromLogs } }).select('id title project_id').lean().exec(),
        Subtask.find({ id: { $in: subtaskIds } }).select('id title task_id').lean().exec(),
        User.find({ id: { $in: userIds } }).select('id name').lean().exec(),
      ]);

      const parentTaskIds = [...new Set((subtasksRaw as { task_id: string }[]).map((s) => s.task_id))];
      const allTaskIds = [...new Set([...taskIdsFromLogs, ...parentTaskIds])];
      const parentTasks = allTaskIds.length > 0
        ? await Task.find({ id: { $in: allTaskIds } }).select('id title project_id').lean().exec()
        : [];
      const projectIds = [...new Set((parentTasks as { project_id?: string }[]).map((t) => t.project_id).filter(Boolean))];
      const projects = projectIds.length > 0
        ? await Project.find({ id: { $in: projectIds } }).select('id name').lean().exec()
        : [];

      const tasks = parentTasks as { id: string; title: string; project_id?: string }[];
      const subtasks = subtasksRaw as { id: string; title: string; task_id: string }[];
      const users = usersRaw;

      const taskMap = new Map((tasks as { id: string; title: string; project_id?: string }[]).map((t) => [t.id, t]));
      const subtaskMap = new Map((subtasks as { id: string; title: string; task_id: string }[]).map((s) => [s.id, s]));
      const projectMap = new Map((projects as { id: string; name: string }[]).map((p) => [p.id, p]));
      const userMap = new Map((users as { id: string; name: string }[]).map((u) => [u.id, u]));

      const ACTIVITY_LABELS: Record<string, string> = {
        assigned: 'Asignación',
        in_progress: 'En progreso',
        completed: 'Entrega',
        in_review: 'En revisión',
        approved: 'Aprobado',
        returned: 'Devuelto',
        blocked: 'Bloqueado',
        pending: 'Pendiente',
      };

      data = logsTyped.map((l) => {
        const isSubtask = !!l.subtask_id;
        const itemTitle = isSubtask
          ? (subtaskMap.get(l.subtask_id!)?.title ?? '—')
          : (taskMap.get(l.task_id!)?.title ?? '—');
        const task = l.task_id ? taskMap.get(l.task_id) : l.subtask_id ? taskMap.get(subtaskMap.get(l.subtask_id!)?.task_id ?? '') : null;
        const projectName = task?.project_id ? projectMap.get(task.project_id)?.name ?? '—' : '—';
        const actorName = l.changed_by ? userMap.get(l.changed_by)?.name ?? 'Desconocido' : 'Sistema';

        return {
          id: l.id,
          activity_type: l.new_status,
          activity_label: ACTIVITY_LABELS[l.new_status] ?? l.new_status,
          item_type: isSubtask ? 'subtask' : 'task',
          item_id: isSubtask ? l.subtask_id : l.task_id,
          item_title: itemTitle,
          project_name: projectName,
          changed_by: l.changed_by,
          actor_name: actorName,
          previous_status: l.previous_status,
          changed_at: l.changed_at,
        };
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
