import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const newSocket = io({
      path: '/socket.io',
      // Reconnection settings for better reliability
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      // Connection timeout for initial connection
      timeout: 30000,
      // Start with polling, upgrade to websocket (polling first avoids wss:// bug)
      transports: ['polling', 'websocket'],
      upgrade: true,
    });

    const handleConnect = () => {
      console.log('[Socket] Connected');
      setIsConnected(true);
    };
    const handleDisconnect = (reason: string) => {
      console.log('[Socket] Disconnected:', reason);
      setIsConnected(false);
    };
    const handleConnectError = (error: Error) => {
      console.error('[Socket] Connection error:', error.message);
    };
    const handleReconnect = (attemptNumber: number) => {
      console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
    };
    const handleReconnectAttempt = (attemptNumber: number) => {
      console.log('[Socket] Reconnection attempt', attemptNumber);
    };

    newSocket.on('connect', handleConnect);
    newSocket.on('disconnect', handleDisconnect);
    newSocket.on('connect_error', handleConnectError);
    newSocket.io.on('reconnect', handleReconnect);
    newSocket.io.on('reconnect_attempt', handleReconnectAttempt);

    setSocket(newSocket);

    return () => {
      newSocket.off('connect', handleConnect);
      newSocket.off('disconnect', handleDisconnect);
      newSocket.off('connect_error', handleConnectError);
      newSocket.io.off('reconnect', handleReconnect);
      newSocket.io.off('reconnect_attempt', handleReconnectAttempt);
      newSocket.disconnect();
    };
  }, []);

  const value = useMemo(() => ({ socket, isConnected }), [socket, isConnected]);

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
