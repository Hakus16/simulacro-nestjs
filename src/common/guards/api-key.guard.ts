import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const raw = this.configService.get<string>('API_KEYS') ?? '';
    const validKeys = raw
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key.length > 0);

    const header = request.headers['x-api-key'];
    const apiKey = typeof header === 'string' ? header.trim() : undefined;

    if (!apiKey) {
      throw new UnauthorizedException('Falta el encabezado x-api-key');
    }
    if (!validKeys.includes(apiKey)) {
      throw new UnauthorizedException('API key inválida');
    }
    return true;
  }
}
