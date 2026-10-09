import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSolicitudDto {
  @ApiProperty({
    description: 'Nombre o razón social del cliente.',
    example: 'Empresa ACME',
  })
  @IsString()
  @IsNotEmpty()
  cliente: string;

  @ApiProperty({
    description: 'Descripción de la solicitud de seguimiento comercial.',
    example: 'Renovación de contrato anual con seguimiento comercial.',
  })
  @IsString()
  @IsNotEmpty()
  descripcion: string;
}
