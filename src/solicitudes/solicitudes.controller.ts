import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '../users/users.service';
import { CreateSolicitudDto } from './dto/create-solicitud.dto';
import { UpdateEstadoDto } from './dto/update-estado.dto';
import { Solicitud } from './dao/solicitud.entity';
import { SolicitudesService } from './solicitudes.service';

@ApiTags('solicitudes')
@ApiSecurity('x-api-key')
@ApiHeader({
  name: 'x-user',
  required: true,
  description:
    'Nombre del usuario de prueba (admin1, supervisor1, asesor1, asesor2)',
})
@Controller('solicitudes')
export class SolicitudesController {
  constructor(private readonly solicitudesService: SolicitudesService) {}

  @Post()
  @ApiOperation({
    description:
      'Registra una solicitud de seguimiento comercial a nombre del usuario autenticado.',
  })
  @ApiResponse({
    status: 201,
    description: 'Solicitud registrada correctamente.',
  })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  @ApiResponse({
    status: 401,
    description: 'API key o usuario ausente o no válido.',
  })
  crear(
    @Body() dto: CreateSolicitudDto,
    @CurrentUser() user: User,
  ): Promise<Solicitud> {
    return this.solicitudesService.crear(dto, user);
  }

  @Get()
  @ApiOperation({
    description:
      'Lista las solicitudes: admin y supervisor ven todas, el asesor solo las suyas.',
  })
  @ApiResponse({ status: 200, description: 'Listado de solicitudes.' })
  @ApiResponse({
    status: 401,
    description: 'API key o usuario ausente o no válido.',
  })
  listar(@CurrentUser() user: User): Promise<Solicitud[]> {
    return this.solicitudesService.listar(user);
  }

  @Get(':id')
  @ApiOperation({
    description: 'Devuelve el detalle de una solicitud por su identificador.',
  })
  @ApiResponse({ status: 200, description: 'Detalle de la solicitud.' })
  @ApiResponse({
    status: 400,
    description: 'El identificador no es un número válido.',
  })
  @ApiResponse({
    status: 401,
    description: 'API key o usuario ausente o no válido.',
  })
  @ApiResponse({
    status: 403,
    description: 'El asesor no es propietario de la solicitud.',
  })
  @ApiResponse({
    status: 404,
    description: 'No existe la solicitud con ese identificador.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador numérico de la solicitud.',
    example: 1,
  })
  obtenerUno(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<Solicitud> {
    return this.solicitudesService.obtenerUno(id, user);
  }

  @Patch(':id/estado')
  @ApiOperation({
    description:
      'Cambia el estado de una solicitud siguiendo el flujo PENDIENTE → EN_GESTION → RESUELTA.',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado actualizado correctamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'El identificador o el estado no son válidos.',
  })
  @ApiResponse({
    status: 401,
    description: 'API key o usuario ausente o no válido.',
  })
  @ApiResponse({
    status: 403,
    description: 'El asesor no es propietario de la solicitud.',
  })
  @ApiResponse({
    status: 404,
    description: 'No existe la solicitud con ese identificador.',
  })
  @ApiResponse({
    status: 409,
    description: 'Transición de estado no permitida.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador numérico de la solicitud.',
    example: 1,
  })
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEstadoDto,
    @CurrentUser() user: User,
  ): Promise<Solicitud> {
    return this.solicitudesService.cambiarEstado(id, dto, user);
  }
}
