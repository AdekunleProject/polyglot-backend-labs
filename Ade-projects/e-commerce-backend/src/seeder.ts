import { seeder } from 'nestjs-seeder';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './users/schemas/user.schema';
import { AdminSeeders } from './seeder/admin.seeders';

seeder({
  imports: [
    MongooseModule.forRoot(
      'mongodb+srv://princeadekunlejohnson:Emperorharlim123@alimiadekunle.2eoxlmi.mongodb.net/ecommerce?retryWrites=true&w=majority',
    ),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
}).run([AdminSeeders]);
