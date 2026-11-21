import { ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

export const THROTTLE_BY_EMAIL = 'throttleByEmail';

/**
 * Marks a route whose limit must also count per email address, on top of the
 * per-client-address limit every route already has.
 */
export const ThrottleByEmail = () => SetMetadata(THROTTLE_BY_EMAIL, true);

/**
 * Counts attempts per email address, whatever address they come from, so an
 * attacker spreading guesses over many addresses still hits a wall on one
 * account. The limit itself comes from the route's @Throttle().
 *
 * Trade-off: someone can also use up a victim's attempts. The window is one
 * minute, so the victim is only delayed, never locked out.
 */
@Injectable()
export class EmailThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const wanted = this.reflector.getAllAndOverride<boolean>(THROTTLE_BY_EMAIL, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!wanted) return true;

    const request = context.switchToHttp().getRequest();
    // Without an email there is nothing to count; validation rejects it anyway.
    if (typeof request.body?.email !== 'string') return true;

    return super.canActivate(context);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    return `email:${String(req.body.email).trim().toLowerCase()}`;
  }
}
