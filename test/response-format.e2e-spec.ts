import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { SolicitudesService } from '../src/solicitudes/solicitudes.service';
import { configurarEntorno, crearBaseDeDatos, eliminarBaseDeDatos } from './bd';
import { comoError, comoExito, CuerpoError, Solicitud } from './tipos';

const API_KEY = 'test-key-alpha';
const DB_NAME = 'solicitudes_test_response';

configurarEntorno(DB_NAME);
process.env.API_KEYS = 'test-key-alpha,test-key-beta';

describe('Estandarizacion de respuestas y errores (req 9, 10)', () => {
  let app: INestApplication<App>;

  const api = () => request(app.getHttpServer());

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
  });

  afterAll(async () => {
    await app.close();
    await eliminarBaseDeDatos(DB_NAME);
  });

  describe('req 9: el interceptor estandariza las respuestas exitosas', () => {
    it('POST devuelve { success: true, data }', async () => {
      const res = await api()
        .post('/solicitudes')
        .set('x-api-key', API_KEY)
        .set('x-user', 'asesor1')
        .send({ cliente: 'ACME', descripcion: 'Demo' })
        .expect(201);

      expect(Object.keys(comoExito<Solicitud>(res)).sort()).toEqual([
        'data',
        'success',
      ]);
      expect(comoExito<Solicitud>(res).success).toBe(true);
      expect(comoExito<Solicitud>(res).data.cliente).toBe('ACME');
    });

    it('GET devuelve { success: true, data: [...] }', async () => {
      const res = await api()
        .get('/solicitudes')
        .set('x-api-key', API_KEY)
        .set('x-user', 'admin1')
        .expect(200);

      expect(Object.keys(comoExito<Solicitud[]>(res)).sort()).toEqual([
        'data',
        'success',
      ]);
      expect(comoExito<Solicitud[]>(res).success).toBe(true);
      expect(Array.isArray(comoExito<Solicitud[]>(res).data)).toBe(true);
    });

    it('GET por id devuelve { success: true, data: {...} }', async () => {
      const creada = await api()
        .post('/solicitudes')
        .set('x-api-key', API_KEY)
        .set('x-user', 'asesor1')
        .send({ cliente: 'ACME 2', descripcion: 'Demo 2' })
        .expect(201);

      const id = comoExito<Solicitud>(creada).data.id;
      const res = await api()
        .get(`/solicitudes/${id}`)
        .set('x-api-key', API_KEY)
        .set('x-user', 'asesor1')
        .expect(200);

      expect(Object.keys(comoExito<Solicitud>(res)).sort()).toEqual([
        'data',
        'success',
      ]);
      expect(comoExito<Solicitud>(res).success).toBe(true);
    });

    it('PATCH devuelve { success: true, data }', async () => {
      const creada = await api()
        .post('/solicitudes')
        .set('x-api-key', API_KEY)
        .set('x-user', 'asesor1')
        .send({ cliente: 'ACME 3', descripcion: 'Demo 3' })
        .expect(201);

      const id = comoExito<Solicitud>(creada).data.id;
      const res = await api()
        .patch(`/solicitudes/${id}/estado`)
        .set('x-api-key', API_KEY)
        .set('x-user', 'asesor1')
        .send({ estado: 'EN_GESTION' })
        .expect(200);

      expect(Object.keys(comoExito<Solicitud>(res)).sort()).toEqual([
        'data',
        'success',
      ]);
      expect(comoExito<Solicitud>(res).data.estado).toBe('EN_GESTION');
    });

    it('el envoltorio no agrega campos extra (ni timestamp ni statusCode)', async () => {
      const res = await api()
        .get('/solicitudes')
        .set('x-api-key', API_KEY)
        .set('x-user', 'admin1')
        .expect(200);
      expect(res.body).not.toHaveProperty('statusCode');
      expect(res.body).not.toHaveProperty('timestamp');
      expect(res.body).not.toHaveProperty('message');
    });

    it('una respuesta exitosa nunca se envuelve en el formato de error', async () => {
      const res = await api()
        .get('/solicitudes')
        .set('x-api-key', API_KEY)
        .set('x-user', 'admin1')
        .expect(200);
      expect(res.body).not.toHaveProperty('statusCode');
    });
  });

  describe('req 10: el Exception Filter normaliza errores conservando el codigo HTTP', () => {
    const esperaError = (
      res: request.Response,
      status: number,
      esperado: string | string[],
    ): CuerpoError => {
      const body = comoError(res);
      expect(Object.keys(body).sort()).toEqual([
        'message',
        'statusCode',
        'timestamp',
      ]);
      expect(body.statusCode).toBe(status);
      expect(res.status).toBe(status);
      if (typeof esperado === 'string') {
        expect(body.message).toBe(esperado);
      } else {
        expect(body.message).toEqual(esperado);
      }
      expect(body.timestamp).toBe(new Date(body.timestamp).toISOString());
      return body;
    };

    it('401 sin x-api-key conserva 401', async () => {
      const res = await api().get('/solicitudes').expect(401);
      esperaError(res, 401, 'Falta el encabezado x-api-key');
    });

    it('401 con API key invalida conserva 401', async () => {
      const res = await api()
        .get('/solicitudes')
        .set('x-api-key', 'no-valida')
        .set('x-user', 'admin1')
        .expect(401);
      esperaError(res, 401, 'API key inválida');
    });

    it('404 conserva 404', async () => {
      const res = await api()
        .get('/solicitudes/999999')
        .set('x-api-key', API_KEY)
        .set('x-user', 'admin1')
        .expect(404);
      esperaError(res, 404, 'No se encontró la solicitud con id 999999');
    });

    it('403 conserva 403', async () => {
      const creada = await api()
        .post('/solicitudes')
        .set('x-api-key', API_KEY)
        .set('x-user', 'asesor2')
        .send({ cliente: 'C', descripcion: 'D' })
        .expect(201);
      const id = comoExito<Solicitud>(creada).data.id;

      const res = await api()
        .get(`/solicitudes/${id}`)
        .set('x-api-key', API_KEY)
        .set('x-user', 'asesor1')
        .expect(403);
      esperaError(res, 403, `No tiene permiso sobre la solicitud ${id}`);
    });

    it('409 conserva 409', async () => {
      const creada = await api()
        .post('/solicitudes')
        .set('x-api-key', API_KEY)
        .set('x-user', 'asesor1')
        .send({ cliente: 'C', descripcion: 'D' })
        .expect(201);
      const id = comoExito<Solicitud>(creada).data.id;

      const res = await api()
        .patch(`/solicitudes/${id}/estado`)
        .set('x-api-key', API_KEY)
        .set('x-user', 'asesor1')
        .send({ estado: 'RESUELTA' })
        .expect(409);
      esperaError(res, 409, 'Transición no permitida: de PENDIENTE a RESUELTA');
    });

    it('400 de validacion conserva 400 con arreglo de mensajes', async () => {
      const res = await api()
        .post('/solicitudes')
        .set('x-api-key', API_KEY)
        .set('x-user', 'asesor1')
        .send({ cliente: '', descripcion: '' })
        .expect(400);
      const body = comoError(res);
      expect(body.statusCode).toBe(400);
      expect(Array.isArray(body.message)).toBe(true);
      expect((body.message as string[]).length).toBeGreaterThan(0);
    });

    it('400 de ParseIntPipe conserva 400', async () => {
      const res = await api()
        .get('/solicitudes/abc')
        .set('x-api-key', API_KEY)
        .set('x-user', 'admin1')
        .expect(400);
      expect(comoError(res).statusCode).toBe(400);
    });

    it('ningun error se convierte en 500', async () => {
      const respuestas = await Promise.all([
        api().get('/solicitudes'),
        api()
          .get('/solicitudes/999999')
          .set('x-api-key', API_KEY)
          .set('x-user', 'admin1'),
        api()
          .get('/solicitudes/abc')
          .set('x-api-key', API_KEY)
          .set('x-user', 'admin1'),
      ]);
      respuestas.forEach((r) => {
        expect(r.status).not.toBe(500);
        expect(comoError(r).statusCode).not.toBe(500);
      });
    });

    it('el cuerpo de error no incluye error, path ni success', async () => {
      const res = await api().get('/solicitudes').expect(401);
      expect(res.body).not.toHaveProperty('error');
      expect(res.body).not.toHaveProperty('path');
      expect(res.body).not.toHaveProperty('success');
    });

    it('excepciones no-HttpException se normalizan a 500 sin filtrar detalles', async () => {
      const service = app.get(SolicitudesService);
      const espia = jest.spyOn(service, 'obtenerUno').mockImplementation(() => {
        throw new TypeError('boom interno secreto');
      });

      try {
        const res = await api()
          .get('/solicitudes/1')
          .set('x-api-key', API_KEY)
          .set('x-user', 'admin1')
          .expect(500);

        const body = comoError(res);
        expect(body.statusCode).toBe(500);
        expect(body.message).toBe('Error interno del servidor');
        expect(JSON.stringify(body)).not.toContain('boom');
        expect(JSON.stringify(body)).not.toContain('secreto');
        expect(Object.keys(body).sort()).toEqual([
          'message',
          'statusCode',
          'timestamp',
        ]);
      } finally {
        espia.mockRestore();
      }
    });

    it('el filtro normaliza cualquier excepcion no-HttpException (invocacion directa)', () => {
      const filtro = new HttpExceptionFilter();
      let status: number | undefined;
      let body: CuerpoError = {
        statusCode: 0,
        message: '',
        timestamp: '',
      };
      const respuesta = {
        status(code: number) {
          status = code;
          return respuesta;
        },
        json(payload: CuerpoError) {
          body = payload;
          return respuesta;
        },
      };
      const host = {
        switchToHttp: () => ({ getResponse: () => respuesta }),
      } as never;

      filtro.catch(new Error('detalle interno'), host);
      expect(status).toBe(500);
      expect(body.statusCode).toBe(500);
      expect(body.message).toBe('Error interno del servidor');
      expect(typeof body.timestamp).toBe('string');
    });

    it('una excepcion HttpException lanzada desde el servicio conserva su codigo', async () => {
      const service = app.get(SolicitudesService);
      const espia = jest.spyOn(service, 'obtenerUno').mockImplementation(() => {
        throw new NotFoundException('No se encontró la solicitud con id 42');
      });

      try {
        const res = await api()
          .get('/solicitudes/42')
          .set('x-api-key', API_KEY)
          .set('x-user', 'admin1')
          .expect(404);
        expect(comoError(res).statusCode).toBe(404);
        expect(comoError(res).message).toBe(
          'No se encontró la solicitud con id 42',
        );
      } finally {
        espia.mockRestore();
      }
    });
  });
});
