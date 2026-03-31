import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

function socketOrigin(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (env) return env.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  onlineUserIds: Set<string>;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (loading || !user?.id) {
      setSocket((prev) => {
        if (prev) {
          prev.removeAllListeners();
          prev.disconnect();
        }
        return null;
      });
      setIsConnected(false);
      setOnlineUserIds(new Set());
      return;
    }

    const s = io(socketOrigin(), {
      path: '/socket.io',
      auth: { userId: user.id },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    s.on('connect', () => setIsConnected(true));
    s.on('disconnect', () => setIsConnected(false));
    s.on('user_online', (payload: { user_id: string }) => {
      setOnlineUserIds((prev) => new Set(prev).add(payload.user_id));
    });
    s.on('user_offline', (payload: { user_id: string }) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.delete(payload.user_id);
        return next;
      });
    });

    setSocket(s);
    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [loading, user?.id]);

  const joinChannel = useCallback(
    (channelId: string) => {
      socket?.emit('join_channel', channelId);
    },
    [socket]
  );

  const leaveChannel = useCallback(
    (channelId: string) => {
      socket?.emit('leave_channel', channelId);
    },
    [socket]
  );

  const value = useMemo(
    () => ({
      socket,
      isConnected,
      onlineUserIds,
      joinChannel,
      leaveChannel,
    }),
    [socket, isConnected, onlineUserIds, joinChannel, leaveChannel]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket debe usarse dentro de SocketProvider');
  return ctx;
}
