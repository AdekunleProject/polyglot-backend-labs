import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export const EMAIL_QUEUE = 'email-queue';

export interface VerificationEmailJob {
  email: string;
  otp: string;
}

export interface PasswordResetEmailJob {
  email: string;
  otp: string;
}

@Injectable()
export class EmailQueueService {
  constructor(
    @InjectQueue(EMAIL_QUEUE)
    private readonly emailQueue: Queue,
  ) {}

  async sendVerificationEmail(data: VerificationEmailJob) {
    return this.emailQueue.add(
      'send-verification-email',
      data,
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    );
  }

  async sendPasswordResetEmail(data: PasswordResetEmailJob) {
    return this.emailQueue.add(
      'send-password-reset-email',
      data,
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    );
  }
}