import { registerEnumType } from '@nestjs/graphql';

export enum Role {
  AGENT = 'agent',
  MANAGER = 'manager',
  ADMIN = 'admin',
  CUSTOMER = 'customer',
}

registerEnumType(Role, {
  name: 'Role',
  description: 'User roles',
});