import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
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
@Schema({ timestamps: true })
export class User extends Document {
  @Factory((faker) => faker!.person.firstName())
  @Prop({ required: true })
  firstname!: string;
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

  @Prop({
    default: null,
  })
  hashedRefreshToken?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.set('strict', true);
