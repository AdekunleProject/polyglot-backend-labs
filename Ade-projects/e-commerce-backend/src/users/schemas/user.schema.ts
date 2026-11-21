import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Factory } from 'nestjs-seeder';
import { Role } from '../../common/enums/role.enum';
import { AuthProvider } from 'src/common/enums/auth-provider.enum';
import { ProfileImageProvider } from 'src/common/enums/profile-image-provider.enum';

const usedEmails = new Set<string>();

export function generateUniqueEmail(faker: any): string {
  let email: string;
  do {
    email = faker.internet.email();
  } while (usedEmails.has(email));
  usedEmails.add(email);
  return email;
}
export interface Session {
  sid: string;
  tokenHash: string;
  createdAt: Date;
  lastUsedAt: Date;
}

const SessionSchema = new MongooseSchema<Session>(
  {
    sid: { type: String, required: true },
    tokenHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

@Schema({ timestamps: true })
export class User extends Document {
  @Factory((faker) => faker!.person.firstName())
  @Prop({ required: true })
  firstname!: string;
  @Prop({ required: false })
  middlename?: string;
  @Factory((faker) => faker!.person.lastName())
  @Prop({ required: true })
  lastname!: string;
  @Factory((faker) => generateUniqueEmail(faker))
  @Prop({ required: true, unique: true })
  email!: string;
  @Factory((faker) => faker!.internet.password())
  @Prop({ required: true, select: false })
  password!: string;
  @Factory((faker) => faker!.phone.number())
  @Prop({ required: false, default: null })
  phoneNumber!: string;
  @Prop({ default: false }) isVerified!: boolean;
  @Factory((faker) => faker!.date.birthdate())
  @Prop({ required: false, default: null })
  dateOfBirth!: string;
  @Factory((faker) => faker!.helpers.arrayElement(['male', 'female']))
  @Prop({ required: false, default: null })
  gender!: string;
  @Factory((faker) => faker!.location.streetAddress())
  @Prop({ required: false, default: null })
  address!: string;
  @Factory((faker) => faker!.helpers.arrayElement([Role.CUSTOMER, Role.ADMIN]))
    @Prop({
    type: String,
    enum: Object.values(Role),
    default: Role.CUSTOMER,
  })
  role!: Role;
  @Factory((faker) => faker?.person.jobTitle())
  @Prop()
  jobTitle!: string;
  @Factory((faker) => faker!.image.url())
  @Prop()
  profileImage?: string;

  @Prop({ default: false }) isActive!: boolean;
  @Prop({ required: false, default: null }) token!: string;
  @Prop({ type: String, default: null }) resetToken!: string;
  @Prop({ type: Date, default: null }) resetTokenExpires!: Date;
  @Prop({ type: String, default: null }) emailVerificationToken!: string;
  @Prop({
    type: String,
    enum: ProfileImageProvider,
  })
  profileImageProvider?: ProfileImageProvider;

  @Prop({
    type: String,
    enum: AuthProvider,
    default: AuthProvider.LOCAL,
  })
  provider!: AuthProvider;

  @Prop({
    type: String,
    required: false,
  })
  googleId?: string;

  // One entry per signed-in device. Holds only a hash of the current refresh
  // token, never the token itself. Hidden from queries unless asked for.
  @Prop({ type: [SessionSchema], default: [], select: false })
  sessions!: Session[];

  // Two-factor sign-in with an authenticator app (see auth/two-factor).
  // The secret is stored encrypted, backup codes as hashes. Both hidden from
  // queries unless asked for.
  @Prop({ type: String, default: null, select: false })
  twoFactorSecret?: string | null;

  @Prop({ default: false })
  twoFactorEnabled!: boolean;

  // Time step of the last accepted code, so a code cannot be used twice.
  @Prop({ type: Number, default: null })
  twoFactorLastStep?: number | null;

  @Prop({ type: [String], default: [], select: false })
  recoveryCodes!: string[];
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.set('strict', true);
