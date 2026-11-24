import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * The bridge from services to live sockets. The gateway hands over the
 * Socket.IO server at start. Every signed-in device of a user is in the room
 * "user:<id>", so one emit reaches a phone and a tablet alike.
 */
@Injectable()
export class RealtimeService {
  server?: Server;

  emitToUsers(userIds: number[], event: string, payload: unknown) {
    if (!this.server || userIds.length === 0) return;
    this.server.to(userIds.map((id) => `user:${id}`)).emit(event, payload);
  }

  async isOnline(userId: number): Promise<boolean> {
    if (!this.server) return false;
    return (await this.server.in(`user:${userId}`).fetchSockets()).length > 0;
  }

  /** Signs a person out of every live connection (deactivated, deleted). */
  disconnectUser(userId: number) {
    this.server?.in(`user:${userId}`).disconnectSockets(true);
  }

  /** Closes the live connection of one signed-in device. */
  disconnectSession(sessionId: string) {
    this.server?.in(`session:${sessionId}`).disconnectSockets(true);
  }
}
