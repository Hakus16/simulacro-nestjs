import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { configurarEntorno, crearBaseDeDatos, eliminarBaseDeDatos } from './bd';

const DB_NAME = 'solicitudes_test_swagger';

configurarEntorno(DB_NAME);
process.env.API_KEYS = 'test-key-alpha,test-key-beta';

interface Operation {
  description?: string;
  security?: Record<string, string[]>[];
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    description?: string;
    schema?: { example?: unknown };
  }>;
  requestBody?: { content: Record<string, { schema: { $ref: string } }> };
  responses: Record<string, { description?: string }>;
}

describe('Documentacion Swagger (req 11)', () => {
  let app: INestApplication<App>;
  let documento: OpenAPIObject;

  beforeAll(async () => {
    await crearBaseDeDatos(DB_NAME);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    // misma configuracion que main.ts (DocumentBuilder + addApiKey)
    const config = new DocumentBuilder()
      .setTitle('API de Solicitudes Comerciales')
      .setDescription(
        'API interna para registrar y consultar solicitudes de seguimiento comercial.',
      )
      .addApiKey(
        { type: 'apiKey', name: 'x-api-key', in: 'header' },
        'x-api-key',
      )
      .build();
    documento = SwaggerModule.createDocument(app, config);
  });

  afterAll(async () => {
    await app.close();
    await eliminarBaseDeDatos(DB_NAME);
  });

  const operaciones = (): Array<[string, string, Operation]> => {
    const salida: Array<[string, string, Operation]> = [];
    for (const [ruta, item] of Object.entries(documento.paths)) {
      for (const [metodo, op] of Object.entries(item)) {
        if (!['get', 'post', 'patch', 'put', 'delete'].includes(metodo))
          continue;
        salida.push([metodo.toUpperCase(), ruta, op as Operation]);
      }
    }
    return salida;
  };

  it('el documento se genera con titulo y descripcion', () => {
    expect(documento.info.title).toBe('API de Solicitudes Comerciales');
    expect(documento.info.description).toBe(
      'API interna para registrar y consultar solicitudes de seguimiento comercial.',
    );
  });

  it('declara el esquema de seguridad x-api-key (boton Authorize)', () => {
    expect(documento.components!.securitySchemes).toEqual({
      'x-api-key': { type: 'apiKey', in: 'header', name: 'x-api-key' },
    });
  });

  it('documenta exactamente los 4 endpoints del documento', () => {
    const rutas = operaciones()
      .map(([m, r]) => `${m} ${r}`)
      .sort();
    expect(rutas).toEqual([
      'GET /solicitudes',
      'GET /solicitudes/{id}',
      'PATCH /solicitudes/{id}/estado',
      'POST /solicitudes',
    ]);
  });

  describe('encabezados requeridos', () => {
    it('todas las operaciones exigen el encabezado x-user', () => {
      for (const [metodo, ruta, op] of operaciones()) {
        const header = op.parameters?.find(
          (p) => p.name === 'x-user' && p.in === 'header',
        );
        expect(`${metodo} ${ruta} -> x-user`).toBe(
          `${metodo} ${ruta} -> x-user`,
        );
        expect(header).toBeDefined();
        expect(header!.required).toBe(true);
        expect(header!.description).toBe(
          'Nombre del usuario de prueba (admin1, supervisor1, asesor1, asesor2)',
        );
      }
    });

    it('todas las operaciones referencian la seguridad x-api-key', () => {
      for (const [metodo, ruta, op] of operaciones()) {
        expect(`${metodo} ${ruta}`).toBeDefined();
        expect(op.security).toEqual([{ 'x-api-key': [] }]);
      }
    });
  });

  describe('parametros de ruta', () => {
    it('GET /solicitudes/{id} documenta el parametro id', () => {
      const op = documento.paths['/solicitudes/{id}'].get as Operation;
      const id = op.parameters?.find((p) => p.name === 'id' && p.in === 'path');
      expect(id).toBeDefined();
      expect(id!.required).toBe(true);
    });

    it('PATCH /solicitudes/{id}/estado documenta el parametro id', () => {
      const op = documento.paths['/solicitudes/{id}/estado'].patch as Operation;
      const id = op.parameters?.find((p) => p.name === 'id' && p.in === 'path');
      expect(id).toBeDefined();
      expect(id!.required).toBe(true);
    });
  });

  describe('DTO documentados', () => {
    it('CreateSolicitudDto expone cliente y descripcion con description y example', () => {
      const schema = documento.components!.schemas!.CreateSolicitudDto as {
        properties: Record<string, { description?: string; example?: unknown }>;
        required: string[];
      };
      expect(schema).toBeDefined();
      expect(Object.keys(schema.properties).sort()).toEqual([
        'cliente',
        'descripcion',
      ]);
      expect(schema.properties.cliente.description).toBe(
        'Nombre o razón social del cliente.',
      );
      expect(schema.properties.cliente.example).toBe('Empresa ACME');
      expect(schema.properties.descripcion.description).toBe(
        'Descripción de la solicitud de seguimiento comercial.',
      );
      expect(schema.properties.descripcion.example).toBe(
        'Renovación de contrato anual con seguimiento comercial.',
      );
      expect(schema.required.sort()).toEqual(['cliente', 'descripcion']);
    });

    it('UpdateEstadoDto expone estado con enum de EstadoSolicitud', () => {
      const schema = documento.components!.schemas!.UpdateEstadoDto as {
        properties: Record<
          string,
          { description?: string; example?: unknown; enum?: string[] }
        >;
        required: string[];
      };
      expect(schema).toBeDefined();
      expect(Object.keys(schema.properties)).toEqual(['estado']);
      expect(schema.properties.estado.description).toBe(
        'Nuevo estado de la solicitud.',
      );
      expect(schema.properties.estado.enum).toEqual([
        'PENDIENTE',
        'EN_GESTION',
        'RESUELTA',
      ]);
      expect(schema.properties.estado.example).toBe('EN_GESTION');
      expect(schema.required).toEqual(['estado']);
    });

    it('POST /solicitudes usa CreateSolicitudDto como cuerpo', () => {
      const op = documento.paths['/solicitudes'].post as Operation;
      expect(op.requestBody?.content['application/json'].schema.$ref).toBe(
        '#/components/schemas/CreateSolicitudDto',
      );
    });

    it('PATCH /solicitudes/{id}/estado usa UpdateEstadoDto como cuerpo', () => {
      const op = documento.paths['/solicitudes/{id}/estado'].patch as Operation;
      expect(op.requestBody?.content['application/json'].schema.$ref).toBe(
        '#/components/schemas/UpdateEstadoDto',
      );
    });

    it('la entidad Solicitud no se expone como esquema de respuesta', () => {
      expect(documento.components!.schemas).not.toHaveProperty('Solicitud');
    });
  });

  describe('codigos de respuesta documentados por endpoint', () => {
    it('POST /solicitudes: 201, 400, 401', () => {
      const op = documento.paths['/solicitudes'].post as Operation;
      expect(Object.keys(op.responses).sort()).toEqual(['201', '400', '401']);
      expect(op.responses['201'].description).toBe(
        'Solicitud registrada correctamente.',
      );
      expect(op.responses['400'].description).toBe(
        'Datos de entrada inválidos.',
      );
    });

    it('GET /solicitudes: 200, 401', () => {
      const op = documento.paths['/solicitudes'].get as Operation;
      expect(Object.keys(op.responses).sort()).toEqual(['200', '401']);
    });

    it('GET /solicitudes/{id}: 200, 400, 401, 403, 404', () => {
      const op = documento.paths['/solicitudes/{id}'].get as Operation;
      expect(Object.keys(op.responses).sort()).toEqual([
        '200',
        '400',
        '401',
        '403',
        '404',
      ]);
    });

    it('PATCH /solicitudes/{id}/estado: 200, 400, 401, 403, 404, 409', () => {
      const op = documento.paths['/solicitudes/{id}/estado'].patch as Operation;
      expect(Object.keys(op.responses).sort()).toEqual([
        '200',
        '400',
        '401',
        '403',
        '404',
        '409',
      ]);
      expect(op.responses['409'].description).toBe(
        'Transición de estado no permitida.',
      );
    });

    it('cada respuesta documentada tiene descripcion', () => {
      for (const [metodo, ruta, op] of operaciones()) {
        for (const [codigo, respuesta] of Object.entries(op.responses)) {
          expect(`${metodo} ${ruta} ${codigo}: ${respuesta.description}`).toBe(
            `${metodo} ${ruta} ${codigo}: ${respuesta.description}`,
          );
          expect(typeof respuesta.description).toBe('string');
          expect(respuesta.description!.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('descripciones de los endpoints', () => {
    it('cada operacion tiene @ApiOperation con descripcion', () => {
      for (const [metodo, ruta, op] of operaciones()) {
        expect(`${metodo} ${ruta}`).toBeDefined();
        expect(typeof op.description).toBe('string');
        expect(op.description!.length).toBeGreaterThan(0);
      }
    });

    it('todas las operaciones estan etiquetadas como solicitudes', () => {
      for (const [, , op] of operaciones()) {
        expect((op as unknown as { tags: string[] }).tags).toEqual([
          'solicitudes',
        ]);
      }
    });
  });
});
