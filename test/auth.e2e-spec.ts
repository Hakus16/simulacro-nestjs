import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { configurarEntorno, crearBaseDeDatos, eliminarBaseDeDatos } from './bd';
import { comoError } from './tipos';

const API_KEY_A = 'test-key-alpha';
const API_KEY_B = 'test-key-beta';
const DB_NAME = 'solicitudes_test_auth';

configurarEntorno(DB_NAME);
process.env.API_KEYS = `${API_KEY_A}, ${API_KEY_B}`;

describe('Autenticacion por API Key (req 1, 2, 3)', () => {
  let app: INestApplication<App>;

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

  describe('req 1: peticion sin x-api-key es rechazada', () => {
    it('GET /solicitudes sin x-api-key -> 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/solicitudes')
        .set('x-user', 'admin1')
        .expect(401);
      expect(comoError(res).message).toBe('Falta el encabezado x-api-key');
    });

    it('POST /solicitudes sin x-api-key -> 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/solicitudes')
        .set('x-user', 'admin1')
        .send({ cliente: 'C', descripcion: 'D' })
        .expect(401);
      expect(comoError(res).message).toBe('Falta el encabezado x-api-key');
    });

    it('x-api-key vacio se rechaza', async () => {
      const res = await request(app.getHttpServer())
        .get('/solicitudes')
        .set('x-api-key', '')
        .set('x-user', 'admin1')
        .expect(401);
      expect(comoError(res).message).toBe('Falta el encabezado x-api-key');
    });
  });

  describe('req 2: API Key invalida es rechazada', () => {
    it('clave que no esta en API_KEYS -> 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/solicitudes')
        .set('x-api-key', 'clave-que-no-existe')
        .set('x-user', 'admin1')
        .expect(401);
      expect(comoError(res).message).toBe('API key inválida');
    });

    it('clave de desarrollo (.env) no vale porque el entorno de test define las suyas', async () => {
      const res = await request(app.getHttpServer())
        .get('/solicitudes')
        .set('x-api-key', 'clave-ficticia-1')
        .set('x-user', 'admin1')
        .expect(401);
      expect(comoError(res).message).toBe('API key inválida');
    });
  });

  describe('req 3: dos API Keys distintas configuradas por variable de entorno', () => {
    it('API_KEY_A permite consumir la API', async () => {
      await request(app.getHttpServer())
        .get('/solicitudes')
        .set('x-api-key', API_KEY_A)
        .set('x-user', 'admin1')
        .expect(200);
    });

    it('API_KEY_B permite consumir la API', async () => {
      await request(app.getHttpServer())
        .get('/solicitudes')
        .set('x-api-key', API_KEY_B)
        .set('x-user', 'admin1')
        .expect(200);
    });

    it('las dos claves distintas funcionan en la misma aplicacion', async () => {
      const [a, b] = await Promise.all([
        request(app.getHttpServer())
          .get('/solicitudes')
          .set('x-api-key', API_KEY_A)
          .set('x-user', 'admin1'),
        request(app.getHttpServer())
          .get('/solicitudes')
          .set('x-api-key', API_KEY_B)
          .set('x-user', 'supervisor1'),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
    });

    it('las claves se leen de la variable de entorno API_KEYS (separadas por comas)', () => {
      const configuradas = (process.env.API_KEYS ?? '')
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
      expect(configuradas).toEqual([API_KEY_A, API_KEY_B]);
    });

    it('el guard acepta claves con espacios alrededor (trim)', async () => {
      await request(app.getHttpServer())
        .get('/solicitudes')
        .set('x-api-key', `  ${API_KEY_A}  `)
        .set('x-user', 'admin1')
        .expect(200);
    });
  });

  describe('el encabezado x-user tambien es obligatorio (UserGuard)', () => {
    it('sin x-user -> 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/solicitudes')
        .set('x-api-key', API_KEY_A)
        .expect(401);
      expect(comoError(res).message).toBe('Falta el encabezado x-user');
    });

    it('usuario desconocido -> 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/solicitudes')
        .set('x-api-key', API_KEY_A)
        .set('x-user', 'nadie')
        .expect(401);
      expect(comoError(res).message).toBe('Usuario no reconocido: nadie');
    });

    it('la API key valida no basta sin usuario valido', async () => {
      await request(app.getHttpServer())
        .get('/solicitudes')
        .set('x-api-key', API_KEY_B)
        .set('x-user', 'intruso')
        .expect(401);
    });
  });
});
