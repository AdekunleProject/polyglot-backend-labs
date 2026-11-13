import { Resolver, Query, Mutation, Subscription, Args, Float } from '@nestjs/graphql';
import { Inject, UseGuards } from '@nestjs/common';
import { PubSubEngine } from 'graphql-subscriptions';
import { SmsBroadcastService } from './services/sms-broadcast.service';
import { VIP_SCORE_UPDATED, VipIntelligenceService } from './services/vip-intelligence.service';
import { Customer360Service } from './services/customer-360.service';
import { OrderService } from './services/order.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enum/roles.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BroadcastSmsInput, GenericMutationResponse, VipScoreResponse } from './dto/market-edge.types';
import { Customer360GraphResponse } from './dto/customer-360.types';
import { OrderGraphType, PlaceOrderInput } from './dto/order.types';
import { PUB_SUB } from '../redis/redis.constants';

/**
 * Only deliver an update to the subscriber who asked for that customer.
 * Without this filter every subscriber received every customer's score.
 */
export function vipScoreFilter(
  payload: { vipScoreUpdated: { customerId: string } },
  variables: { customerId: string },
): boolean {
  return payload.vipScoreUpdated.customerId === variables.customerId;
}

// VIP scores and customer profiles are staff data. A customer account has no
// reason to read any customer's score, so these operations are staff-only.
@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
export class MarketEdgeResolver {
  constructor(
    private readonly smsService: SmsBroadcastService,
    private readonly vipService: VipIntelligenceService,
    private readonly customer360Service: Customer360Service,
    private readonly orderService: OrderService,
    @Inject(PUB_SUB) private readonly pubSub: PubSubEngine,
  ) {}

  @Mutation(() => GenericMutationResponse)
  @Roles(Role.ADMIN, Role.MANAGER)
  async broadcastSms(@Args('input') input: BroadcastSmsInput) {
    return await this.smsService.enqueueMassBroadcast(input);
  }

  @Mutation(() => VipScoreResponse)
  @Roles(Role.ADMIN, Role.MANAGER, Role.AGENT)
  async addTransaction(
    @Args('customerId') customerId: string,
    @Args('amount', { type: () => Float }) amount: number,
    @Args('branchId') branchId: string,
  ) {
    return await this.vipService.processTransactionAndCache(customerId, amount, branchId);
  }

  @Mutation(() => OrderGraphType)
  @Roles(Role.ADMIN, Role.MANAGER, Role.AGENT)
  async placeOrder(
    @CurrentUser() actor: { sub: string },
    @Args('input') input: PlaceOrderInput,
  ) {
    const order = await this.orderService.placeOrder(actor.sub, input);
    return {
      id: String(order._id),
      idempotencyKey: order.idempotencyKey,
      agentId: order.agentId,
      items: order.items,
    };
  }

  @Query(() => Customer360GraphResponse)
  @Roles(Role.ADMIN, Role.MANAGER)
  async getCustomerProfile360(@Args('customerId') customerId: string) {
    return await this.customer360Service.getCustomer360Profile(customerId);
  }

  @Query(() => Float)
  @Roles(Role.ADMIN, Role.MANAGER, Role.AGENT)
  async getCustomerVipScore(@Args('customerId') customerId: string) {
    return await this.vipService.getCachedVipScore(customerId);
  }

  @Subscription(() => VipScoreResponse, {
    name: VIP_SCORE_UPDATED,
    filter: vipScoreFilter,
    resolve: (payload: { vipScoreUpdated: unknown }) => payload.vipScoreUpdated,
  })
  @Roles(Role.ADMIN, Role.MANAGER, Role.AGENT)
  vipScoreUpdated(@Args('customerId') _customerId: string) {
    return this.pubSub.asyncIterableIterator(VIP_SCORE_UPDATED);
  }
}
