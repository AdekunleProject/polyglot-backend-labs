import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DigestService } from '../analytics/digest.service';
import { MediaService } from '../chat/media.service';
import { StatusService } from '../status/status.service';
import { QueueService } from './queue.service';

const HOUR = 60 * 60 * 1000;

/**
 * The jobs that run on a clock: remove expired statuses, remove uploads that
 * were never sent, and check whether the weekly digest is due. With Redis the
 * schedule is shared, so two replicas do not both run a job.
 */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly queue: QueueService,
    private readonly statuses: StatusService,
    private readonly media: MediaService,
    private readonly digest: DigestService,
  ) {}

  async run(name: string) {
    switch (name) {
      case 'status-sweep':
        return this.statuses.sweep();
      case 'upload-cleanup':
        return this.media.cleanupUnused();
      case 'digest-check':
        return this.digest.tick();
      default:
        this.logger.warn(`Unknown maintenance job: ${name}`);
    }
  }

  async onApplicationBootstrap() {
    this.queue.register('maintenance', async (name) => void (await this.run(name)));
    try {
      await this.queue.schedule('maintenance', 'status-sweep', HOUR);
      await this.queue.schedule('maintenance', 'upload-cleanup', HOUR);
      await this.queue.schedule('maintenance', 'digest-check', HOUR);
    } catch (error) {
      this.logger.error(`Could not schedule maintenance jobs: ${(error as Error).message}`);
    }
  }
}
