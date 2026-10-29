import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SmsTask } from '../schemas/sms-task.schema';
import { BroadcastSmsInput } from '../dto/market-edge.types';

@Injectable()
export class SmsBroadcastService {
  constructor(
    @InjectQueue('sms-broadcast-queue') private smsQueue: Queue,
    @InjectModel(SmsTask.name) private smsTaskModel: Model<SmsTask>,
  ) {}

  async enqueueMassBroadcast(input: BroadcastSmsInput) {
    const documents = input.payload.map(item => ({
      broadcastId: input.broadcastId,
      phoneNumber: item.phone,
      message: item.msg,
      status: 'PENDING'
    }));

    const insertedTasks = await this.smsTaskModel.insertMany(documents, { ordered: false });

    const jobs = insertedTasks.map(doc => ({
      name: 'send-sms',
      data: { taskId: doc._id.toString(), phone: doc.phoneNumber, msg: doc.message },
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
    }));

    await this.smsQueue.addBulk(jobs);
    return { success: true, count: jobs.length };
  }
}
