import type { Server as SocketIOServer } from 'socket.io';
import { markUserOffline, markUserOnline } from './chatSocket.js';
import { ChannelRead } from '../models/index.js';
import { generateUUID } from './uuid.js';

export function attachChatSocket(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    const userId = socket.handshake.auth?.userId as string | undefined;
    if (!userId) {
      socket.disconnect(true);
      return;
    }
    (socket.data as { userId?: string }).userId = userId;
    markUserOnline(userId);
    io.emit('user_online', { user_id: userId });

    socket.on('join_channel', (channelId: string) => {
      if (typeof channelId === 'string' && channelId) {
        socket.join(`channel:${channelId}`);
      }
    });

    socket.on('leave_channel', (channelId: string) => {
      if (typeof channelId === 'string' && channelId) {
        socket.leave(`channel:${channelId}`);
      }
    });

    socket.on('typing', (payload: { channelId?: string }) => {
      const channelId = payload?.channelId;
      if (!channelId) return;
      socket.to(`channel:${channelId}`).emit('user_typing', { user_id: userId, channel_id: channelId });
    });

    socket.on('stop_typing', (payload: { channelId?: string }) => {
      const channelId = payload?.channelId;
      if (!channelId) return;
      socket.to(`channel:${channelId}`).emit('user_stopped_typing', { user_id: userId, channel_id: channelId });
    });

    socket.on('mark_read', async (payload: { channelId?: string }) => {
      const channelId = payload?.channelId;
      if (!channelId) return;
      try {
        await ChannelRead.findOneAndUpdate(
          { user_id: userId, channel_id: channelId },
          {
            $set: { last_read_at: new Date() },
            $setOnInsert: { id: generateUUID() },
          },
          { upsert: true }
        ).exec();
      } catch {
        /* ignore */
      }
    });

    socket.on('disconnect', () => {
      markUserOffline(userId);
      io.emit('user_offline', { user_id: userId });
    });
  });
}
