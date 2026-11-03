import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
export declare class AuthService {
    private readonly usersRepository;
    private readonly jwtService;
    constructor(usersRepository: Repository<User>, jwtService: JwtService);
    register(dto: RegisterDto): Promise<{
        id: number;
        name: string;
        email: string;
        role: "user" | "admin";
    }>;
    login(dto: LoginDto): Promise<{
        accessToken: string;
    }>;
}
