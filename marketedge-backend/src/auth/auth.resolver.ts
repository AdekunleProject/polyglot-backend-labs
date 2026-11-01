import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import {
  LocalRegisterInput,
  LocalLoginInput,
  AuthTokenResponse,
  SocialLoginInput,
  ResetPasswordConfirmInput,
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

  @Mutation(() => AuthTokenResponse)
  async loginWithGoogle(@Args('input') input: SocialLoginInput) {
    return await this.authService.loginWithProvider('google', input.idToken);
  }

  @Mutation(() => AuthTokenResponse)
  async loginWithApple(@Args('input') input: SocialLoginInput) {
    return await this.authService.loginWithProvider('apple', input.idToken);
  }
}
