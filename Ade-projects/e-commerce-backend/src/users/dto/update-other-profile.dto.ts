import { OmitType } from '@nestjs/mapped-types';
import { UpdateCustomerProfileDto } from './update-customer-profile.dto';

/** What staff may change on someone else's profile. Not the email: that would redirect their sign-in and password resets. */
export class UpdateOtherProfileDto extends OmitType(UpdateCustomerProfileDto, ['email'] as const) {}
