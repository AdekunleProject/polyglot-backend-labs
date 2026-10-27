import 'dotenv/config';
import { seeder } from 'nestjs-seeder';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './users/schemas/user.schema';
import { AdminSeeders } from './seeder/admin.seeders';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI is not set');
}

seeder({
  imports: [
    MongooseModule.forRoot(uri),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
}).run([AdminSeeders]);