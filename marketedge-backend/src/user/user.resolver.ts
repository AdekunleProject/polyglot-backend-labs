import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { BadRequestException, ForbiddenException, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enum/roles.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateAdminUserInput, UpdateAdminUserInput, UserGraphType, CustomerProfileType, UpdateCustomerProfileInput}
from './dto/user.admin.input';

interface Actor {
  sub: string;
  role: Role;
}

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
export class UserResolver {
  constructor(private readonly userService: UserService) {}

  @Mutation(() => UserGraphType)
  @Roles(Role.ADMIN)
  async createAdminUser(@Args('input') input: CreateAdminUserInput) {
    return await this.userService.createAdminUser(input);
  }

  @Mutation(() => UserGraphType)
  @Roles(Role.ADMIN, Role.MANAGER)
  async updateAdminUser(
    @CurrentUser() actor: Actor,
    @Args('input') input: UpdateAdminUserInput,
  ) {
    // A manager could otherwise promote themselves (or anyone) to admin.
    if (input.role !== undefined && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only an admin can change roles.');
    }
    return await this.userService.updateAdminUser(input);
  };

  @Query(() => CustomerProfileType)
  @Roles(Role.CUSTOMER)
  async myProfile(@CurrentUser() actor: Actor) {
    return await this.userService.findById(actor.sub);
  };

  @Query(() => UserGraphType)
  @Roles(Role.ADMIN)
  async myAdminProfile(@CurrentUser() actor: Actor) {
    return await this.userService.findById(actor.sub);
  };

  @Mutation(() => CustomerProfileType)
  @Roles(Role.CUSTOMER)
  async updateMyProfile(
    @CurrentUser() actor: Actor,
    @Args('input') input: UpdateCustomerProfileInput,
  ) {
    return await this.userService.updateCustomerProfile(actor.sub, input);
  }

  @Query(() => UserGraphType)
  @Roles(Role.ADMIN, Role.MANAGER)
  async findUserById(@Args('id', { type: () => ID }) id: string) {
    return await this.userService.findById(id);
  }

  @Query(() => UserGraphType)
  @Roles(Role.ADMIN, Role.MANAGER)
  async findUserByEmail(@Args('email') email: string) {
    return await this.userService.findByEmail(email);
  }

  @Mutation(() => Boolean)
  @Roles(Role.ADMIN)
  async deleteUser(
    @CurrentUser() actor: Actor,
    @Args('id', { type: () => ID }) id: string,
  ) {
    if (actor.sub === id) {
      throw new BadRequestException('You cannot delete your own account.');
    }
    return await this.userService.deleteUser(id);
  }
}
