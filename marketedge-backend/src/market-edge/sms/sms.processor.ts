import { Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import { SmsTask } from '../schemas/sms-task.schema';
import { SMS_PROVIDER, type SmsProvider } from './sms-provider';
import { SMS_QUEUE } from '../services/sms-broadcast.service';

interface SmsJobData {
  taskId: string;
}

/**
 * The queue had producers but no consumer, so queued messages were never sent.
 * This worker reads each task, sends it through the provider and records the result.
 */
@Processor(SMS_QUEUE)
export class SmsProcessor extends WorkerHost {
  private readonly logger = new Logger(SmsProcessor.name);

  constructor(
    @InjectModel(SmsTask.name) private readonly smsTaskModel: Model<SmsTask>,
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
  ) {
    super();
  }

  async process(job: Job<SmsJobData>): Promise<void> {
    const task = await this.smsTaskModel.findById(job.data.taskId);
    if (!task) {
      this.logger.warn(`Task ${job.data.taskId} no longer exists, skipping.`);
      return;
    }
    if (task.status === 'SENT') return; // A retry must not send twice.

    const result = await this.provider.send(task.phoneNumber, task.message);
    await this.smsTaskModel.updateOne(
      { _id: task._id },
      { $set: { status: 'SENT', providerMessageId: result.providerMessageId } },
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<SmsJobData> | undefined, error: Error): Promise<void> {
    if (!job) return;
    const allowed = job.opts?.attempts ?? 1;
    if (job.attemptsMade >= allowed) {
      await this.smsTaskModel.updateOne(
        { _id: job.data.taskId },
        { $set: { status: 'FAILED', error: error.message.slice(0, 500) } },
      );
    }
  }
}
