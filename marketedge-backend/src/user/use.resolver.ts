import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/roles.enum';
import { CreateAdminUserInput, UpdateAdminUserInput, UserGraphType } from '../user/dto/user.admin.input';

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
  async updateAdminUser(@Args('input') input: UpdateAdminUserInput) {
    return await this.userService.updateAdminUser(input);
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
  async deleteUser(@Args('id', { type: () => ID }) id: string) {
    return await this.userService.deleteUser(id);
  }
}
