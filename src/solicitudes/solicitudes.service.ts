import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../users/enums/role.enum';
import { User } from '../users/users.service';
import { CreateSolicitudDto } from './dto/create-solicitud.dto';
import { UpdateEstadoDto } from './dto/update-estado.dto';
import { Solicitud } from './dao/solicitud.entity';
import { EstadoSolicitud } from './enums/estado-solicitud.enum';

const TRANSICIONES_PERMITIDAS: Record<
  EstadoSolicitud,
  readonly EstadoSolicitud[]
> = {
  [EstadoSolicitud.PENDIENTE]: [EstadoSolicitud.EN_GESTION],
  [EstadoSolicitud.EN_GESTION]: [EstadoSolicitud.RESUELTA],
  [EstadoSolicitud.RESUELTA]: [],
};

@Injectable()
export class SolicitudesService {
  constructor(
    @InjectRepository(Solicitud)
    private readonly solicitudesRepository: Repository<Solicitud>,
  ) {}

  async crear(dto: CreateSolicitudDto, user: User): Promise<Solicitud> {
    const solicitud = this.solicitudesRepository.create({
      cliente: dto.cliente,
      descripcion: dto.descripcion,
      estado: EstadoSolicitud.PENDIENTE,
      asesor: user.username,
    });
    return this.solicitudesRepository.save(solicitud);
  }

  async listar(user: User): Promise<Solicitud[]> {
    if (user.role === Role.ASESOR) {
      return this.solicitudesRepository.find({
        where: { asesor: user.username },
      });
    }
    return this.solicitudesRepository.find();
  }

  async obtenerUno(id: number, user: User): Promise<Solicitud> {
    const solicitud = await this.solicitudesRepository.findOneBy({ id });
    if (!solicitud) {
      throw new NotFoundException(`No se encontró la solicitud con id ${id}`);
    }
    this.verificarPermiso(solicitud, user);
    return solicitud;
  }

  async cambiarEstado(
    id: number,
    dto: UpdateEstadoDto,
    user: User,
  ): Promise<Solicitud> {
    const solicitud = await this.solicitudesRepository.findOneBy({ id });
    if (!solicitud) {
      throw new NotFoundException(`No se encontró la solicitud con id ${id}`);
    }
    this.verificarPermiso(solicitud, user);

    const permitidas = TRANSICIONES_PERMITIDAS[solicitud.estado];
    if (!permitidas.includes(dto.estado)) {
      throw new ConflictException(
        `Transición no permitida: de ${solicitud.estado} a ${dto.estado}`,
      );
    }

    solicitud.estado = dto.estado;
    return this.solicitudesRepository.save(solicitud);
  }

  private verificarPermiso(solicitud: Solicitud, user: User): void {
    if (user.role === Role.ASESOR && solicitud.asesor !== user.username) {
      throw new ForbiddenException(
        `No tiene permiso sobre la solicitud ${solicitud.id}`,
      );
    }
  }
}
