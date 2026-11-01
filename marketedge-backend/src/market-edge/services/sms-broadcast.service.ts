import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SmsTask } from '../schemas/sms-task.schema';
import { BroadcastSmsInput } from '../dto/market-edge.types';
import { chunk } from '../../common/chunk';

export const SMS_QUEUE = 'sms-broadcast-queue';
export const BROADCAST_BATCH_SIZE = 1000;

@Injectable()
export class SmsBroadcastService {
  constructor(
    @InjectQueue(SMS_QUEUE) private smsQueue: Queue,
    @InjectModel(SmsTask.name) private smsTaskModel: Model<SmsTask>,
  ) {}

  /**
   * Saves each message as a task and queues a job for it, in batches of 1,000
   * so one large broadcast never builds one giant database write or Redis call.
   * The job carries only the task id; the phone number and text stay in MongoDB.
   */
  async enqueueMassBroadcast(input: BroadcastSmsInput) {
    let count = 0;

    for (const batch of chunk(input.payload, BROADCAST_BATCH_SIZE)) {
      const tasks = await this.smsTaskModel.insertMany(
        batch.map((item) => ({
          broadcastId: input.broadcastId,
          phoneNumber: item.phone,
          message: item.msg,
          status: 'PENDING',
        })),
      );

      await this.smsQueue.addBulk(
        tasks.map((task) => ({
          name: 'send-sms',
          data: { taskId: String(task._id) },
          opts: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: true,
            removeOnFail: 1000,
          },
        })),
      );
      count += tasks.length;
    }

    return { success: true, count };
  }
}
