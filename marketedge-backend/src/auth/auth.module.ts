import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthResolver } from './auth.resolver';
import { SocialTokenVerifier } from './social-token-verifier';
import { UserModule } from '../user/user.module';
import { MarketEdgeModule } from '../market-edge/market-edge.module';

@Module({
  imports: [UserModule, MarketEdgeModule],
  providers: [AuthService, AuthResolver, SocialTokenVerifier],
})
export class AuthModule {}
