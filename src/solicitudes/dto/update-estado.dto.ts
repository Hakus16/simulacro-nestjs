import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { EstadoSolicitud } from '../enums/estado-solicitud.enum';

export class UpdateEstadoDto {
  @ApiProperty({
    description: 'Nuevo estado de la solicitud.',
    enum: EstadoSolicitud,
    example: EstadoSolicitud.EN_GESTION,
  })
  @IsEnum(EstadoSolicitud)
  @IsNotEmpty()
  estado: EstadoSolicitud;
}
