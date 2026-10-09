import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { User, UsersService } from '../../users/users.service';

@Injectable()
export class UserGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: User }>();
    const header = request.headers['x-user'];
    const username = typeof header === 'string' ? header.trim() : undefined;

    if (!username) {
      throw new UnauthorizedException('Falta el encabezado x-user');
    }

    const user = this.usersService.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException(`Usuario no reconocido: ${username}`);
    }

    request.user = user;
    return true;
  }
}
