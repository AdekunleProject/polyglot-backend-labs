import { Logger } from '@nestjs/common';
import {
  Processor,
  WorkerHost,
  OnWorkerEvent,
} from '@nestjs/bullmq';
import { Job } from 'bullmq';

import {
  EMAIL_QUEUE,
  VerificationEmailJob,
  PasswordResetEmailJob,
} from './email-queue.service';

import { EmailDispatchService } from '../services/email-dispatch.service';

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly emailDispatchService: EmailDispatchService,
  ) {
    super();
  }

  async process(
    job: Job<VerificationEmailJob | PasswordResetEmailJob>,
  ): Promise<void> {
    this.logger.log(`Processing email job: ${job.name}`);

    switch (job.name) {
      case 'send-verification-email': {
        const { email, otp } = job.data;

        await this.emailDispatchService.sendVerificationEmail(
          email,
          otp,
        );

        this.logger.log(`Verification email sent to ${email}`);
        break;
      }

      case 'send-password-reset-email': {
        const { email, otp } = job.data;

        await this.emailDispatchService.sendPasswordResetEmail(
          email,
          otp,
        );

        this.logger.log(`Password reset email sent to ${email}`);
        break;
      }

      default:
        throw new Error(`Unsupported email job: ${job.name}`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    if (job) {
      this.logger.error(
        `Email job ${job.id} failed: ${error.message}`,
      );
    }
  }
}