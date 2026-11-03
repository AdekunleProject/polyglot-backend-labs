import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersRepository.findOneBy({ email: dto.email });
    if (existing) {
      throw new ConflictException('Email already in use');
    }
    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.usersRepository.save(
      this.usersRepository.create({
        name: dto.name,
        email: dto.email,
        password,
      }),
    );
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async login(dto: LoginDto) {
    // password is select:false, so we must ask for it explicitly here
    const user = await this.usersRepository.findOne({
      where: { email: dto.email },
      select: { id: true, email: true, password: true, role: true },
    });
    const valid = user && (await bcrypt.compare(dto.password, user.password));
    if (!user || !valid) {
      // same message for both cases, so attackers can't discover which emails exist
      throw new UnauthorizedException('Invalid email or password');
    }
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken };
  }
}
