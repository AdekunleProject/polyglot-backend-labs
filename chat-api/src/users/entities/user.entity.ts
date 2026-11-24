import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AuthProvider } from '../../common/enums/auth-provider.enum';
import { ProfileImageProvider } from '../../common/enums/profile-image-provider.enum';
import { Role } from '../../common/enums/role.enum';

@Entity('users')
@Unique('UQ_users_googleId', ['googleId'])
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  // How other people find you: lowercase letters, digits and underscores.
  @Column({ length: 30, unique: true })
  username: string;

  @Column({ length: 100 })
  firstname: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  middlename: string | null;

  @Column({ length: 100 })
  lastname: string;

  @Column({ length: 150, unique: true })
  email: string;

  // Null for accounts that only ever signed in with Google.
  @Column({ type: 'varchar', nullable: true, select: false })
  password: string | null;

  @Column({ type: 'varchar', length: 20, default: Role.USER })
  role: Role;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  jobTitle: string | null;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  // An S3 object key, or a Google picture URL (see profileImageProvider).
  @Column({ type: 'varchar', length: 500, nullable: true })
  profileImage: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  profileImageProvider: ProfileImageProvider | null;

  @Column({ type: 'varchar', length: 10, default: AuthProvider.LOCAL })
  provider: AuthProvider;

  @Column({ type: 'varchar', length: 100, nullable: true })
  googleId: string | null;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ default: true })
  isActive: boolean;

  // True for an account an admin created, until the emailed password is changed.
  @Column({ default: false })
  mustChangePassword: boolean;

  // Set when an admin deletes the account. The row stays, so messages
  // keep their author and the account can be restored.
  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  // Authenticator secret, encrypted (see two-factor/secret-box.ts). Never
  // selected unless asked for.
  @Column({ type: 'text', nullable: true, select: false })
  twoFactorSecret: string | null;

  @Column({ default: false })
  twoFactorEnabled: boolean;

  // Time step of the last accepted code, so a code cannot be used twice.
  @Column({ type: 'integer', nullable: true })
  twoFactorLastStep: number | null;

  @CreateDateColumn()
  createdAt: Date;


}
