import {
  IsOptional,
  IsString,
  IsEmail,
  IsPhoneNumber,
  IsDateString,
} from 'class-validator';

// CRITICAL BUG FIX: this declared `firstName`/`lastName` (camelCase), but
// the User schema's real fields are lowercase `firstname`/`lastname` —
// and the frontend's Profile.tsx already correctly sends lowercase
// field names matching the schema. With the global ValidationPipe's
// forbidNonWhitelisted:true, that meant every single profile-update
// request was rejected outright ("property firstname should not exist"),
// not just those two fields silently failing — the whole request never
// got through. Renamed to match what the frontend actually sends and
// what the schema actually has.
//
// Also removed `emergencyContact` and `department` — neither exists as a
// field on the User schema at all, so they were silently dropped by
// Mongoose's strict-mode $set even before this fix; harmless (values
// weren't rejected, just never saved) but pointless to keep listed here.
export class UpdateCustomerProfileDto {
  @IsString()
  @IsOptional()
  firstname?: string;

  @IsString()
  @IsOptional()
  lastname?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsPhoneNumber()
  @IsOptional()
  phoneNumber?: string;
}
