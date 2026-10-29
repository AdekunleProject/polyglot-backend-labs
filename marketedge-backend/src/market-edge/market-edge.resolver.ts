import { Resolver, Query, Mutation, Subscription, Args, Float } from '@nestjs/graphql';
import { UseGuards, Inject } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { SmsBroadcastService } from './services/sms-broadcast.service';
import { VipIntelligenceService } from './services/vip-intelligence.service';
import { Customer360Service } from './services/customer-360.service';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/roles.enum';
import { BroadcastSmsInput, GenericMutationResponse, VipScoreResponse } from './dto/market-edge.types';
import { Customer360GraphResponse } from './dto/customer-360.types';

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
export class MarketEdgeResolver {
  constructor(
    private readonly smsService: SmsBroadcastService,
    private readonly vipService: VipIntelligenceService,
    private readonly customer360Service: Customer360Service,
    @Inject('PUB_SUB') private readonly pubSub: PubSub,
  ) {}

  @Mutation(() => GenericMutationResponse)
  @Roles(Role.ADMIN, Role.MANAGER)
  async broadcastSms(@Args('input') input: BroadcastSmsInput) {
    return await this.smsService.enqueueMassBroadcast(input);
  }

  @Mutation(() => VipScoreResponse)
  @Roles(Role.ADMIN, Role.MANAGER, Role.AGENT)
  async addTransaction(@Args('customerId') customerId: string, @Args('amount') amount: number, @Args('branchId') branchId: string) {
    const result = await this.vipService.processTransactionAndCache(customerId, amount, branchId);
    await this.pubSub.publish('vipScoreUpdated', { vipScoreUpdated: result });
    return result;
  }

  @Query(() => Customer360GraphResponse)
  @Roles(Role.ADMIN, Role.MANAGER)
  async getCustomerProfile360(@Args('customerId') customerId: string) {
    return await this.customer360Service.getCustomer360Profile(customerId);
  }

  @Query(() => Float)
  @Roles(Role.ADMIN, Role.MANAGER, Role.AGENT, Role.CUSTOMER)
  async getCustomerVipScore(@Args('customerId') customerId: string) {
    return await this.vipService.getCachedVipScore(customerId);
  }

  @Subscription(() => VipScoreResponse, { name: 'vipScoreUpdated' })
  @Roles(Role.ADMIN, Role.MANAGER, Role.AGENT, Role.CUSTOMER)
  vipScoreUpdated(@Args('customerId') customerId: string) {
    return this.pubSub.asyncIterableIterator('vipScoreUpdated');
  }
}
