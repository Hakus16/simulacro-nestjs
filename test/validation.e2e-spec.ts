import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { configurarEntorno, crearBaseDeDatos, eliminarBaseDeDatos } from './bd';
import { comoError, comoExito, CuerpoError, Solicitud } from './tipos';

const API_KEY = 'test-key-alpha';
const DB_NAME = 'solicitudes_test_validation';

configurarEntorno(DB_NAME);
process.env.API_KEYS = 'test-key-alpha,test-key-beta';

describe('Validacion de DTOs (req 4)', () => {
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

  const post = (body: unknown) =>
    request(app.getHttpServer())
      .post('/solicitudes')
      .set('x-api-key', API_KEY)
      .set('x-user', 'asesor1')
      .send(body as object);

  const patch = (id: number, body: unknown) =>
    request(app.getHttpServer())
      .patch(`/solicitudes/${id}/estado`)
      .set('x-api-key', API_KEY)
      .set('x-user', 'asesor1')
      .send(body as object);

  const crearValida = async (): Promise<number> => {
    const res = await request(app.getHttpServer())
      .post('/solicitudes')
      .set('x-api-key', API_KEY)
      .set('x-user', 'asesor1')
      .send({ cliente: 'Cliente válido', descripcion: 'Descripción válida' })
      .expect(201);
    return comoExito<Solicitud>(res).data.id;
  };

  const espera400ConArreglo = (body: CuerpoError) => {
    expect(body.statusCode).toBe(400);
    expect(Array.isArray(body.message)).toBe(true);
    const mensajes = body.message as string[];
    expect(mensajes.length).toBeGreaterThan(0);
    mensajes.forEach((m) => expect(typeof m).toBe('string'));
  };

  describe('CreateSolicitudDto: campos obligatorios faltantes', () => {
    it('sin cliente -> 400', async () => {
      const res = await post({ descripcion: 'solo descripcion' }).expect(400);
      const body = comoError(res);
      espera400ConArreglo(body);
      expect((body.message as string[]).join(' ')).toMatch(/cliente/i);
    });

    it('sin descripcion -> 400', async () => {
      const res = await post({ cliente: 'Solo cliente' }).expect(400);
      const body = comoError(res);
      espera400ConArreglo(body);
      expect((body.message as string[]).join(' ')).toMatch(/descripcion/i);
    });

    it('sin ningun campo -> 400 con dos errores', async () => {
      const res = await post({}).expect(400);
      const body = comoError(res);
      espera400ConArreglo(body);
      expect((body.message as string[]).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('CreateSolicitudDto: cadenas vacias', () => {
    it('cliente vacio -> 400', async () => {
      const res = await post({ cliente: '', descripcion: 'ok' }).expect(400);
      const body = comoError(res);
      espera400ConArreglo(body);
      expect((body.message as string[]).join(' ')).toMatch(/cliente/i);
    });

    it('descripcion vacia -> 400', async () => {
      const res = await post({ cliente: 'ok', descripcion: '' }).expect(400);
      const body = comoError(res);
      espera400ConArreglo(body);
      expect((body.message as string[]).join(' ')).toMatch(/descripcion/i);
    });

    it('ambos vacios -> 400', async () => {
      const res = await post({ cliente: '', descripcion: '' }).expect(400);
      espera400ConArreglo(comoError(res));
    });
  });

  describe('CreateSolicitudDto: tipos incorrectos', () => {
    it('cliente numerico -> 400', async () => {
      const res = await post({ cliente: 123, descripcion: 'ok' }).expect(400);
      const body = comoError(res);
      espera400ConArreglo(body);
      expect((body.message as string[]).join(' ')).toMatch(/cliente/i);
    });

    it('descripcion booleana -> 400', async () => {
      const res = await post({ cliente: 'ok', descripcion: true }).expect(400);
      const body = comoError(res);
      espera400ConArreglo(body);
      expect((body.message as string[]).join(' ')).toMatch(/descripcion/i);
    });

    it('cliente array -> 400', async () => {
      await post({ cliente: ['a'], descripcion: 'ok' }).expect(400);
    });

    it('cliente objeto -> 400', async () => {
      await post({ cliente: { a: 1 }, descripcion: 'ok' }).expect(400);
    });

    it('descripcion null -> 400', async () => {
      await post({ cliente: 'ok', descripcion: null }).expect(400);
    });
  });

  describe('UpdateEstadoDto', () => {
    it('sin estado -> 400', async () => {
      const id = await crearValida();
      const res = await patch(id, {}).expect(400);
      const body = comoError(res);
      espera400ConArreglo(body);
      expect((body.message as string[]).join(' ')).toMatch(/estado/i);
    });

    it('estado fuera del enum -> 400', async () => {
      const id = await crearValida();
      const res = await patch(id, { estado: 'INEXISTENTE' }).expect(400);
      const body = comoError(res);
      espera400ConArreglo(body);
      expect((body.message as string[]).join(' ')).toMatch(/estado/i);
    });

    it('estado con valor no valido del enum (minusculas) -> 400', async () => {
      const id = await crearValida();
      await patch(id, { estado: 'pendiente' }).expect(400);
    });

    it('estado numerico -> 400', async () => {
      const id = await crearValida();
      await patch(id, { estado: 123 }).expect(400);
    });

    it('estado vacio -> 400', async () => {
      const id = await crearValida();
      await patch(id, { estado: '' }).expect(400);
    });

    it('estado null -> 400', async () => {
      const id = await crearValida();
      await patch(id, { estado: null }).expect(400);
    });
  });

  describe('el cuerpo de error de validacion usa el formato normalizado', () => {
    it('tiene exactamente statusCode, message y timestamp', async () => {
      const res = await post({ cliente: '' }).expect(400);
      expect(Object.keys(comoError(res)).sort()).toEqual([
        'message',
        'statusCode',
        'timestamp',
      ]);
    });

    it('el timestamp es una fecha ISO', async () => {
      const res = await post({ cliente: '' }).expect(400);
      const { timestamp } = comoError(res);
      expect(timestamp).toBe(new Date(timestamp).toISOString());
    });

    it('no se filtra nada de la validacion interna (sin error/path/success)', async () => {
      const res = await post({ cliente: '' }).expect(400);
      expect(res.body).not.toHaveProperty('error');
      expect(res.body).not.toHaveProperty('path');
      expect(res.body).not.toHaveProperty('success');
    });
  });

  describe('los campos no declarados en el DTO se descartan (whitelist)', () => {
    it('un body con campos extra no rompe la creacion ni inyecta valores', async () => {
      const res = await post({
        cliente: 'Cliente válido',
        descripcion: 'Descripción válida',
        id: 999,
        estado: 'RESUELTA',
        asesor: 'admin1',
        creadaEn: '2000-01-01',
        actualizadaEn: '2000-01-01',
        extra: 'zzz',
      }).expect(201);

      const data = comoExito<Solicitud>(res).data;
      expect(data.id).not.toBe(999);
      expect(data.estado).toBe('PENDIENTE');
      expect(data.asesor).toBe('asesor1');
      expect(data).not.toHaveProperty('extra');
    });
  });
});
