import type { Server as SocketIOServer } from 'socket.io';

let ioInstance: SocketIOServer | null = null;

export function setSocketIO(io: SocketIOServer): void {
  ioInstance = io;
}

export function getSocketIO(): SocketIOServer | null {
  return ioInstance;
}

/**
 * Broadcast session list update to all connected clients
 */
export function broadcastSessionsUpdate(): void {
  if (ioInstance) {
    ioInstance.emit('sessions:updated');
  }
}
