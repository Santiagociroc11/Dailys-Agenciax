import { Router, type Request, type Response } from 'express';
import { Channel, Message, ChannelRead, User, Project } from '../models/index.js';
import { generateUUID } from '../lib/uuid.js';
import { emitToChannel, getOnlineUserIds } from '../lib/chatSocket.js';

const router = Router();

function getUserId(req: Request): string | null {
  const h = req.headers['x-user-id'];
  if (Array.isArray(h)) return h[0] || null;
  return typeof h === 'string' && h ? h : null;
}

function toPublicMessage(m: Record<string, unknown>) {
  return {
    id: m.id,
    channel_id: m.channel_id,
    user_id: m.user_id,
    content: m.content,
    thread_id: m.thread_id ?? null,
    reply_count: m.reply_count ?? 0,
    mentions: m.mentions ?? [],
    reactions: m.reactions ?? [],
    is_edited: m.is_edited ?? false,
    edited_at: m.edited_at ?? null,
    is_deleted: m.is_deleted ?? false,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  };
}

async function loadUser(userId: string) {
  return User.findOne({ id: userId, is_active: { $ne: false } }).lean().exec();
}

/** Miembros de chat de un proyecto: admins activos + usuarios asignados al proyecto */
async function getProjectChatMemberIds(projectId: string): Promise<string[]> {
  const admins = (await User.find({ role: 'admin', is_active: { $ne: false } }).distinct('id').exec()) as string[];
  const assigned = (await User.find({ assigned_projects: projectId, is_active: { $ne: false } }).distinct('id').exec()) as string[];
  return [...new Set([...admins, ...assigned])];
}

async function syncCustomChannelsMembersForProject(projectId: string) {
  const members = await getProjectChatMemberIds(projectId);
  await Channel.updateMany({ type: 'custom', project_id: projectId }, { $set: { members } }).exec();
}

async function ensureProjectChannel(projectId: string, projectName: string, actingUserId: string) {
  const members = await getProjectChatMemberIds(projectId);

  let ch = await Channel.findOne({ type: 'project', project_id: projectId }).exec();
  if (!ch) {
    ch = await Channel.create({
      name: `📁 ${projectName}`,
      type: 'project',
      project_id: projectId,
      members,
      created_by: actingUserId,
    });
    return ch;
  }
  const cur = new Set(ch.members || []);
  const next = new Set(members);
  if (cur.size !== next.size || [...next].some((x) => !cur.has(x))) {
    ch.members = members;
    await ch.save();
  }
  return ch;
}

async function syncProjectChannelsForUser(userId: string) {
  const user = await loadUser(userId);
  if (!user) return;
  const isAdmin = user.role === 'admin';
  if (isAdmin) {
    const projects = await Project.find({ is_archived: { $ne: true } }).select('id name').lean().exec();
    for (const p of projects) {
      await ensureProjectChannel(p.id, p.name, userId);
      await syncCustomChannelsMembersForProject(p.id);
    }
  } else {
    const assigned = (user.assigned_projects as string[]) || [];
    for (const pid of assigned) {
      const proj = await Project.findOne({ id: pid, is_archived: { $ne: true } }).select('id name').lean().exec();
      if (proj) {
        await ensureProjectChannel(proj.id, proj.name, userId);
        await syncCustomChannelsMembersForProject(pid);
      }
    }
  }
}

async function unreadCountForChannel(userId: string, channelId: string): Promise<number> {
  const read = await ChannelRead.findOne({ user_id: userId, channel_id: channelId }).lean().exec();
  const since = read?.last_read_at || new Date(0);
  return Message.countDocuments({
    channel_id: channelId,
    is_deleted: { $ne: true },
    user_id: { $ne: userId },
    createdAt: { $gt: since },
  }).exec();
}

async function messageTotalsByChannelIds(channelIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!channelIds.length) return map;
  const rows = await Message.aggregate<{ _id: string; total: number }>([
    { $match: { channel_id: { $in: channelIds }, is_deleted: { $ne: true } } },
    { $group: { _id: '$channel_id', total: { $sum: 1 } } },
  ]).exec();
  for (const r of rows) {
    map.set(r._id, r.total);
  }
  return map;
}

/** GET /channels */
router.get('/channels', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Falta X-User-Id' });
      return;
    }
    const user = await loadUser(userId);
    if (!user) {
      res.status(401).json({ error: 'Usuario no válido' });
      return;
    }
    await syncProjectChannelsForUser(userId);

    const channels = await Channel.find({
      members: userId,
      is_archived: { $ne: true },
    })
      .sort({ last_message_at: -1, updatedAt: -1 })
      .lean()
      .exec();

    const ids = channels.map((c) => c.id);
    const totalsMap = await messageTotalsByChannelIds(ids);

    const withUnread = await Promise.all(
      channels.map(async (c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        project_id: c.project_id,
        description: c.description,
        members: c.members,
        created_by: c.created_by,
        last_message_at: c.last_message_at,
        message_count: totalsMap.get(c.id) ?? 0,
        unread_count: await unreadCountForChannel(userId, c.id),
      }))
    );

    res.json({ channels: withUnread });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

/** POST /channels — canal custom */
router.post('/channels', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Falta X-User-Id' });
      return;
    }
    const user = await loadUser(userId);
    if (!user) {
      res.status(401).json({ error: 'Usuario no válido' });
      return;
    }
    const { name, description, member_ids, project_id } = req.body as {
      name?: string;
      description?: string;
      member_ids?: string[];
      project_id?: string | null;
    };
    const trimmed = (name || '').trim();
    if (!trimmed) {
      res.status(400).json({ error: 'Nombre requerido' });
      return;
    }

    let members: string[];
    let pid: string | null = null;

    if (project_id && String(project_id).trim()) {
      pid = String(project_id).trim();
      const proj = await Project.findOne({ id: pid, is_archived: { $ne: true } }).select('id').lean().exec();
      if (!proj) {
        res.status(404).json({ error: 'Proyecto no encontrado' });
        return;
      }
      const isAdmin = user.role === 'admin';
      const assigned = ((user.assigned_projects as string[]) || []).includes(pid);
      if (!isAdmin && !assigned) {
        res.status(403).json({ error: 'No tienes acceso a este proyecto' });
        return;
      }
      members = await getProjectChatMemberIds(pid);
      if (!members.includes(userId)) {
        members = [...members, userId];
      }
    } else {
      members = [...new Set([userId, ...((member_ids as string[]) || [])])];
    }

    const ch = await Channel.create({
      name: trimmed,
      type: 'custom',
      project_id: pid,
      description: description?.trim() || null,
      members,
      created_by: userId,
    });
    res.status(201).json({
      channel: {
        id: ch.id,
        name: ch.name,
        type: ch.type,
        project_id: ch.project_id,
        description: ch.description,
        members: ch.members,
        created_by: ch.created_by,
        unread_count: 0,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

/** POST /channels/dm — debe ir antes de /channels/:id */
router.post('/channels/dm', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Falta X-User-Id' });
      return;
    }
    const user = await loadUser(userId);
    if (!user) {
      res.status(401).json({ error: 'Usuario no válido' });
      return;
    }
    const { other_user_id } = req.body as { other_user_id?: string };
    if (!other_user_id || other_user_id === userId) {
      res.status(400).json({ error: 'other_user_id inválido' });
      return;
    }
    const other = await loadUser(other_user_id);
    if (!other) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    const dm_pair_key = [userId, other_user_id].sort().join('|');
    let ch = await Channel.findOne({ type: 'dm', dm_pair_key }).exec();
    if (!ch) {
      const label = other.name || other.email || other.id;
      ch = await Channel.create({
        name: `💬 ${label}`,
        type: 'dm',
        dm_pair_key,
        members: [userId, other_user_id],
        created_by: userId,
      });
    }
    res.json({
      channel: {
        id: ch.id,
        name: ch.name,
        type: ch.type,
        members: ch.members,
        created_by: ch.created_by,
        unread_count: await unreadCountForChannel(userId, ch.id),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

/** PUT /channels/:id */
router.put('/channels/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Falta X-User-Id' });
      return;
    }
    const ch = await Channel.findOne({ id: req.params.id }).exec();
    if (!ch || !ch.members?.includes(userId)) {
      res.status(404).json({ error: 'Canal no encontrado' });
      return;
    }
    if (ch.type === 'project' || ch.type === 'dm') {
      res.status(403).json({ error: 'No se puede editar este canal' });
      return;
    }
    const { name, description, member_ids } = req.body as {
      name?: string;
      description?: string;
      member_ids?: string[];
    };
    if (name != null && String(name).trim()) ch.name = String(name).trim();
    if (description !== undefined) ch.description = description?.trim() || null;
    if (Array.isArray(member_ids) && !ch.project_id) {
      ch.members = [...new Set([userId, ...member_ids])];
    }
    await ch.save();
    res.json({ channel: { id: ch.id, name: ch.name, description: ch.description, members: ch.members } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

/** POST /channels/:id/read */
router.post('/channels/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Falta X-User-Id' });
      return;
    }
    const ch = await Channel.findOne({ id: req.params.id, members: userId }).exec();
    if (!ch) {
      res.status(404).json({ error: 'Canal no encontrado' });
      return;
    }
    const now = new Date();
    await ChannelRead.findOneAndUpdate(
      { user_id: userId, channel_id: ch.id },
      {
        $set: { last_read_at: now },
        $setOnInsert: { id: generateUUID() },
      },
      { upsert: true, new: true }
    ).exec();
    res.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

/** GET /channels/:id/messages */
router.get('/channels/:id/messages', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Falta X-User-Id' });
      return;
    }
    const ch = await Channel.findOne({ id: req.params.id, members: userId }).lean().exec();
    if (!ch) {
      res.status(404).json({ error: 'Canal no encontrado' });
      return;
    }
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 100);
    const beforeId = req.query.before as string | undefined;

    const filter: Record<string, unknown> = {
      channel_id: ch.id,
      thread_id: null,
      is_deleted: { $ne: true },
    };
    if (beforeId) {
      const ref = await Message.findOne({ id: beforeId, channel_id: ch.id }).lean().exec();
      if (ref?.createdAt) {
        filter.createdAt = { $lt: ref.createdAt };
      }
    }

    const rows = await Message.find(filter).sort({ createdAt: -1 }).limit(limit).lean().exec();
    const messages = rows.map((m) => toPublicMessage(m as unknown as Record<string, unknown>));
    res.json({ messages, has_more: rows.length === limit });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

/** GET /channels/:channelId/threads/:messageId */
router.get('/channels/:channelId/threads/:messageId', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Falta X-User-Id' });
      return;
    }
    const ch = await Channel.findOne({ id: req.params.channelId, members: userId }).lean().exec();
    if (!ch) {
      res.status(404).json({ error: 'Canal no encontrado' });
      return;
    }
    const parentId = req.params.messageId;
    const parent = await Message.findOne({
      id: parentId,
      channel_id: ch.id,
      thread_id: null,
    })
      .lean()
      .exec();
    if (!parent) {
      res.status(404).json({ error: 'Mensaje no encontrado' });
      return;
    }
    const replies = await Message.find({
      channel_id: ch.id,
      thread_id: parentId,
      is_deleted: { $ne: true },
    })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    res.json({
      parent: toPublicMessage(parent as unknown as Record<string, unknown>),
      replies: replies.map((m) => toPublicMessage(m as unknown as Record<string, unknown>)),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

/** POST /channels/:id/messages */
router.post('/channels/:id/messages', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Falta X-User-Id' });
      return;
    }
    const ch = await Channel.findOne({ id: req.params.id, members: userId }).exec();
    if (!ch) {
      res.status(404).json({ error: 'Canal no encontrado' });
      return;
    }
    const { content, thread_id, mentions } = req.body as {
      content?: string;
      thread_id?: string | null;
      mentions?: string[];
    };
    const text = (content || '').trim();
    if (!text) {
      res.status(400).json({ error: 'Contenido vacío' });
      return;
    }

    let parent: InstanceType<typeof Message> | null = null;
    if (thread_id) {
      parent = await Message.findOne({
        id: thread_id,
        channel_id: ch.id,
        thread_id: null,
      }).exec();
      if (!parent) {
        res.status(400).json({ error: 'Hilo inválido' });
        return;
      }
    }

    const msg = await Message.create({
      channel_id: ch.id,
      user_id: userId,
      content: text,
      thread_id: thread_id || null,
      mentions: Array.isArray(mentions) ? mentions : [],
      reply_count: 0,
    });

    ch.last_message_at = new Date();
    await ch.save();

    if (parent) {
      parent.reply_count = (parent.reply_count || 0) + 1;
      await parent.save();
    }

    const lean = await Message.findOne({ id: msg.id }).lean().exec();
    const payload = toPublicMessage(lean as unknown as Record<string, unknown>);
    emitToChannel(ch.id, 'new_message', payload);
    if (thread_id) {
      emitToChannel(ch.id, 'thread_update', { parent_id: thread_id, message: payload });
    }

    res.status(201).json({ message: payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

/** PUT /messages/:id */
router.put('/messages/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Falta X-User-Id' });
      return;
    }
    const { content, mentions } = req.body as { content?: string; mentions?: string[] };
    const text = (content || '').trim();
    if (!text) {
      res.status(400).json({ error: 'Contenido vacío' });
      return;
    }
    const msg = await Message.findOne({ id: req.params.id }).exec();
    if (!msg || msg.user_id !== userId) {
      res.status(404).json({ error: 'Mensaje no encontrado' });
      return;
    }
    const ch = await Channel.findOne({ id: msg.channel_id, members: userId }).exec();
    if (!ch) {
      res.status(403).json({ error: 'Sin acceso' });
      return;
    }
    msg.content = text;
    msg.is_edited = true;
    msg.edited_at = new Date();
    if (mentions) msg.mentions = mentions;
    await msg.save();
    const lean = await Message.findOne({ id: msg.id }).lean().exec();
    const payload = toPublicMessage(lean as unknown as Record<string, unknown>);
    emitToChannel(msg.channel_id, 'message_updated', payload);
    res.json({ message: payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

/** DELETE /messages/:id */
router.delete('/messages/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Falta X-User-Id' });
      return;
    }
    const user = await loadUser(userId);
    const msg = await Message.findOne({ id: req.params.id }).exec();
    if (!msg) {
      res.status(404).json({ error: 'Mensaje no encontrado' });
      return;
    }
    const isAdmin = user?.role === 'admin';
    if (msg.user_id !== userId && !isAdmin) {
      res.status(403).json({ error: 'No autorizado' });
      return;
    }
    const ch = await Channel.findOne({ id: msg.channel_id, members: userId }).exec();
    if (!ch && !isAdmin) {
      res.status(403).json({ error: 'Sin acceso' });
      return;
    }
    msg.is_deleted = true;
    msg.content = '';
    await msg.save();
    emitToChannel(msg.channel_id, 'message_deleted', { id: msg.id, channel_id: msg.channel_id });
    res.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

/** POST /messages/:id/reactions */
router.post('/messages/:id/reactions', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Falta X-User-Id' });
      return;
    }
    const { emoji } = req.body as { emoji?: string };
    const em = (emoji || '').trim();
    if (!em) {
      res.status(400).json({ error: 'emoji requerido' });
      return;
    }
    const msg = await Message.findOne({ id: req.params.id }).exec();
    if (!msg) {
      res.status(404).json({ error: 'Mensaje no encontrado' });
      return;
    }
    const ch = await Channel.findOne({ id: msg.channel_id, members: userId }).exec();
    if (!ch) {
      res.status(403).json({ error: 'Sin acceso' });
      return;
    }
    const raw = (msg.toObject().reactions || []) as { emoji: string; user_ids?: string[] }[];
    const reactions: { emoji: string; user_ids: string[] }[] = raw.map((r) => ({
      emoji: r.emoji,
      user_ids: [...(r.user_ids || [])],
    }));
    let idx = reactions.findIndex((r) => r.emoji === em);
    if (idx < 0) {
      reactions.push({ emoji: em, user_ids: [userId] });
    } else {
      const uids = new Set(reactions[idx].user_ids || []);
      if (uids.has(userId)) uids.delete(userId);
      else uids.add(userId);
      if (uids.size === 0) reactions.splice(idx, 1);
      else reactions[idx] = { emoji: em, user_ids: [...uids] };
    }
    await Message.updateOne({ id: msg.id }, { $set: { reactions } }).exec();
    const lean = await Message.findOne({ id: msg.id }).lean().exec();
    const payload = toPublicMessage(lean as unknown as Record<string, unknown>);
    emitToChannel(msg.channel_id, 'reaction_updated', payload);
    res.json({ message: payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

/** GET /users/online */
router.get('/users/online', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Falta X-User-Id' });
      return;
    }
    res.json({ user_ids: getOnlineUserIds() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

/** GET /users — miembros sugeridos para menciones / DMs */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Falta X-User-Id' });
      return;
    }
    const users = await User.find({ is_active: { $ne: false } })
      .select('id name email role')
      .lean()
      .exec();
    res.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

export const chatRouter = router;
