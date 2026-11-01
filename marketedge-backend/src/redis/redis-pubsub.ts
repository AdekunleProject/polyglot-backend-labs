import { PubSubEngine } from 'graphql-subscriptions';
import Redis from 'ioredis';

interface Subscription {
  channel: string;
  listener: (payload: unknown) => void;
}

/**
 * GraphQL subscription events carried over Redis, so a subscriber connected to
 * one API pod still receives events published by another pod. The default
 * in-memory PubSub only works with a single process.
 */
export class RedisPubSub extends PubSubEngine {
  private nextId = 1;
  private readonly subscriptions = new Map<number, Subscription>();
  private readonly channelCounts = new Map<string, number>();

  constructor(
    private readonly publisher: Redis,
    private readonly subscriber: Redis,
  ) {
    super();
    this.subscriber.on('message', (channel: string, message: string) => {
      let payload: unknown;
      try {
        payload = JSON.parse(message);
      } catch {
        return;
      }
      for (const subscription of this.subscriptions.values()) {
        if (subscription.channel === channel) subscription.listener(payload);
      }
    });
  }

  async publish(triggerName: string, payload: unknown): Promise<void> {
    await this.publisher.publish(triggerName, JSON.stringify(payload));
  }

  async subscribe(
    triggerName: string,
    onMessage: (...args: any[]) => void,
  ): Promise<number> {
    const id = this.nextId++;
    this.subscriptions.set(id, { channel: triggerName, listener: onMessage });
    const count = (this.channelCounts.get(triggerName) ?? 0) + 1;
    this.channelCounts.set(triggerName, count);
    if (count === 1) await this.subscriber.subscribe(triggerName);
    return id;
  }

  unsubscribe(subId: number): void {
    const subscription = this.subscriptions.get(subId);
    if (!subscription) return;
    this.subscriptions.delete(subId);

    const count = (this.channelCounts.get(subscription.channel) ?? 1) - 1;
    if (count <= 0) {
      this.channelCounts.delete(subscription.channel);
      void this.subscriber.unsubscribe(subscription.channel);
    } else {
      this.channelCounts.set(subscription.channel, count);
    }
  }

  async close(): Promise<void> {
    for (const client of [this.publisher, this.subscriber]) {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    }
  }
}
