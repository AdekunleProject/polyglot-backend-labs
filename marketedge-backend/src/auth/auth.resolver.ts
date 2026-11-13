import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from './guards/gql-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthService } from './auth.service';
import {
  LocalRegisterInput,
  LocalLoginInput,
  AuthTokenResponse,
  SocialLoginInput,
  ResetPasswordConfirmInput,
  ChangePasswordInput,
} from './dto/auth.inputs';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => String)
  async registerLocal(@Args('input') input: LocalRegisterInput) {
    return this.authService.registerLocal(input);
  }

  @Mutation(() => String)
  async resendVerification(@Args('email') email: string) {
    return this.authService.resendVerification(email);
  }

  @Mutation(() => Boolean)
  async verifyEmailRegistration(@Args('email') email: string, @Args('otpCode') otpCode: string) {
    return await this.authService.verifyEmailOtp(email, otpCode);
  }

  @Mutation(() => AuthTokenResponse)
  async loginLocal(@Args('input') input: LocalLoginInput) {
    return await this.authService.loginLocal(input);
  }

  @Mutation(() => AuthTokenResponse)
  async refreshTokens(@Args('refreshToken') refreshToken: string) {
    return await this.authService.refreshTokens(refreshToken);
  }

  @Mutation(() => String)
  async forgotPassword(@Args('email') email: string) {
    return await this.authService.forgotPasswordLoop(email);
  }

  @Mutation(() => Boolean)
  async confirmPasswordReset(@Args('input') input: ResetPasswordConfirmInput) {
    return await this.authService.verifyResetAndMutatePassword(input);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean)
  async changePassword(
    @CurrentUser() actor: { sub: string },
    @Args('input') input: ChangePasswordInput,
  ) {
    return this.authService.changePassword(actor.sub, input);
  }

  @Mutation(() => AuthTokenResponse)
  async loginWithGoogle(@Args('input') input: SocialLoginInput) {
    return await this.authService.loginWithProvider('google', input.idToken);
  }

  @Mutation(() => AuthTokenResponse)
  async loginWithApple(@Args('input') input: SocialLoginInput) {
    return await this.authService.loginWithProvider('apple', input.idToken);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean)
  async logout(
    @CurrentUser() actor: { sub: string; sid: string },
  ) {
    return this.authService.logout(actor.sub, actor.sid);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean)
  async logoutAll(
    @CurrentUser() actor: { sub: string },
  ) {
    return this.authService.logoutAll(actor.sub);
  }
}
