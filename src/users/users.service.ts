import { Injectable } from '@nestjs/common';
import { Role } from './enums/role.enum';

export interface User {
  username: string;
  role: Role;
}

@Injectable()
export class UsersService {
  private readonly users: User[] = [
    { username: 'admin1', role: Role.ADMIN },
    { username: 'supervisor1', role: Role.SUPERVISOR },
    { username: 'asesor1', role: Role.ASESOR },
    { username: 'asesor2', role: Role.ASESOR },
  ];

  findByUsername(username: string): User | undefined {
    return this.users.find((user) => user.username === username);
  }
}
