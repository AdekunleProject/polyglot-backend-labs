import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from 'src/users/schemas/user.schema';
import { Seeder, DataFactory } from 'nestjs-seeder';
import { Role } from 'src/common/enums/role.enum';

@Injectable()
export class AdminSeeders implements Seeder {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async seed(): Promise<any> {
    // Generate 10 users.
    const admin = DataFactory.createForClass(User).generate(10);
    const exists = await this.userModel.findOne({ role: Role.ADMIN });

    // Insert into the database.
    if (!exists) {
      return this.userModel.insertMany(admin);
    }
    return null;
  }

  async drop(): Promise<any> {
    return this.userModel.deleteMany({});
  }
}
