import type { Server as SocketIOServer } from 'socket.io';

let ioInstance: SocketIOServer | null = null;

export function setChatIo(io: SocketIOServer): void {
  ioInstance = io;
}

export function getChatIo(): SocketIOServer | null {
  return ioInstance;
}

export function emitToChannel(channelId: string, event: string, payload: unknown): void {
  if (!ioInstance) return;
  ioInstance.to(`channel:${channelId}`).emit(event, payload);
}

const onlineUserIds = new Set<string>();

export function markUserOnline(userId: string): void {
  onlineUserIds.add(userId);
}

export function markUserOffline(userId: string): void {
  onlineUserIds.delete(userId);
}

export function getOnlineUserIds(): string[] {
  return Array.from(onlineUserIds);
}
