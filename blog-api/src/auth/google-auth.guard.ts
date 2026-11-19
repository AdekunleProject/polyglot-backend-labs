import {
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Google sign-in is optional. Without credentials the strategy does not
    // exist, so answer clearly instead of letting Passport fail.
    if (!this.config.get('GOOGLE_CLIENT_ID')) {
      throw new NotFoundException('Google sign-in is not configured');
    }
    return super.canActivate(context);
  }
}
