import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { configurarEntorno, crearBaseDeDatos, eliminarBaseDeDatos } from './bd';
import { comoError, comoExito, Solicitud } from './tipos';

const API_KEY = 'test-key-alpha';
const DB_NAME = 'solicitudes_test_solicitudes';

configurarEntorno(DB_NAME);
process.env.API_KEYS = 'test-key-alpha,test-key-beta';

const consultarBD = async (
  sql: string,
  params: unknown[] = [],
): Promise<Record<string, unknown>[]> => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });
  await client.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows as Record<string, unknown>[];
  } finally {
    await client.end();
  }
};

describe('Solicitudes: persistencia, alcance y estados (req 5, 6, 7, 8, 12)', () => {
  let app: INestApplication<App>;

  const api = () => request(app.getHttpServer());

  const crear = (user: string, cliente: string, body: object = {}) =>
    api()
      .post('/solicitudes')
      .set('x-api-key', API_KEY)
      .set('x-user', user)
      .send({ cliente, descripcion: `Descripción de ${cliente}`, ...body });

  const listar = (user: string) =>
    api().get('/solicitudes').set('x-api-key', API_KEY).set('x-user', user);

  const obtener = (user: string, id: number) =>
    api()
      .get(`/solicitudes/${id}`)
      .set('x-api-key', API_KEY)
      .set('x-user', user);

  const cambiar = (user: string, id: number, estado: string) =>
    api()
      .patch(`/solicitudes/${id}/estado`)
      .set('x-api-key', API_KEY)
      .set('x-user', user)
      .send({ estado });

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

  describe('req 12: registro con estado inicial PENDIENTE pase lo que pase el cliente', () => {
    it('estado inicial es PENDIENTE aunque el cliente envie RESUELTA', async () => {
      const res = await crear('asesor1', 'Cliente 12a', {
        estado: 'RESUELTA',
      }).expect(201);
      expect(comoExito<Solicitud>(res).data.estado).toBe('PENDIENTE');
    });

    it('ignora id, asesor, fechas y campos extra enviados por el cliente', async () => {
      const antes = Date.now();
      const res = await crear('asesor2', 'Cliente 12b', {
        id: 999,
        estado: 'RESUELTA',
        asesor: 'admin1',
        creadaEn: '2000-01-01T00:00:00.000Z',
        actualizadaEn: '2000-01-01T00:00:00.000Z',
        extra: 'no-debe-aparecer',
      }).expect(201);

      const data = comoExito<Solicitud>(res).data;
      expect(data.id).not.toBe(999);
      expect(typeof data.id).toBe('number');
      expect(data.asesor).toBe('asesor2');
      expect(data.estado).toBe('PENDIENTE');
      expect(data).not.toHaveProperty('extra');
      expect(Date.parse(data.creadaEn)).toBeGreaterThanOrEqual(antes - 1000);
      expect(Date.parse(data.actualizadaEn)).toBeGreaterThanOrEqual(
        antes - 1000,
      );
    });

    it('el asesor registrado es siempre el usuario autenticado, sea cual sea su rol', async () => {
      const admin = await crear('admin1', 'Cliente 12c').expect(201);
      const supervisor = await crear('supervisor1', 'Cliente 12d').expect(201);
      expect(comoExito<Solicitud>(admin).data.asesor).toBe('admin1');
      expect(comoExito<Solicitud>(supervisor).data.asesor).toBe('supervisor1');
    });

    it('solo guarda cliente y descripcion del DTO', async () => {
      const res = await crear('asesor1', 'Cliente 12e').expect(201);
      expect(Object.keys(comoExito<Solicitud>(res).data).sort()).toEqual([
        'actualizadaEn',
        'asesor',
        'cliente',
        'creadaEn',
        'descripcion',
        'estado',
        'id',
      ]);
    });
  });

  describe('req 5: persistencia real con TypeORM y SQLite', () => {
    it('la solicitud queda escrita en el archivo SQLite', async () => {
      const res = await crear('asesor1', 'Cliente persistente').expect(201);
      const id = comoExito<Solicitud>(res).data.id;

      const filas = await consultarBD('SELECT * FROM solicitud WHERE id = $1', [
        id,
      ]);
      expect(filas).toHaveLength(1);
      const fila = filas[0] as unknown as Solicitud;
      expect(fila.id).toBe(id);
      expect(fila.cliente).toBe('Cliente persistente');
      expect(fila.asesor).toBe('asesor1');
      expect(fila.estado).toBe('PENDIENTE');
    });

    it('la tabla solicitud existe con sus columnas', async () => {
      const columnas = await consultarBD(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'solicitud' ORDER BY ordinal_position",
      );
      const nombres = columnas.map((c) => String(c.column_name)).sort();
      expect(nombres).toEqual([
        'actualizadaEn',
        'asesor',
        'cliente',
        'creadaEn',
        'descripcion',
        'estado',
        'id',
      ]);
    });

    it('el id es autoincremental (PrimaryGeneratedColumn)', async () => {
      const a = await crear('asesor1', 'Cliente id a').expect(201);
      const b = await crear('asesor1', 'Cliente id b').expect(201);
      expect(comoExito<Solicitud>(b).data.id).toBe(
        comoExito<Solicitud>(a).data.id + 1,
      );
    });

    it('los datos persistidos se leen de vuelta por la API', async () => {
      const creada = await crear('asesor2', 'Cliente roundtrip').expect(201);
      const id = comoExito<Solicitud>(creada).data.id;
      const leida = await obtener('asesor2', id).expect(200);
      expect(comoExito<Solicitud>(leida).data.cliente).toBe(
        'Cliente roundtrip',
      );
      expect(comoExito<Solicitud>(leida).data.asesor).toBe('asesor2');
    });
  });

  describe('req 6: los asesores solo consultan sus propias solicitudes', () => {
    it('asesor1 no ve las de asesor2 y viceversa', async () => {
      await crear('asesor1', 'Solo de asesor1').expect(201);
      await crear('asesor2', 'Solo de asesor2').expect(201);

      const de1 = comoExito<Solicitud[]>(
        await listar('asesor1').expect(200),
      ).data;
      const de2 = comoExito<Solicitud[]>(
        await listar('asesor2').expect(200),
      ).data;

      expect(de1.length).toBeGreaterThan(0);
      expect(de2.length).toBeGreaterThan(0);
      de1.forEach((s) => expect(s.asesor).toBe('asesor1'));
      de2.forEach((s) => expect(s.asesor).toBe('asesor2'));

      const ids1 = de1.map((s) => s.id);
      const ids2 = de2.map((s) => s.id);
      expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0);
    });

    it('la restriccion va en la consulta SQL (no se filtra en memoria)', async () => {
      const filas = await consultarBD(
        'SELECT COUNT(*) AS total FROM solicitud',
      );
      const total = Number(filas[0].total);
      const visibles = comoExito<Solicitud[]>(await listar('asesor1')).data
        .length;
      const propias = Number(
        (
          await consultarBD(
            'SELECT COUNT(*) AS total FROM solicitud WHERE asesor = $1',
            ['asesor1'],
          )
        )[0].total,
      );
      expect(visibles).toBe(propias);
      expect(visibles).toBeLessThanOrEqual(total);
    });
  });

  describe('req 7: un asesor no puede consultar ni cambiar estado de una solicitud ajena', () => {
    let ajena: number;

    beforeAll(async () => {
      ajena = comoExito<Solicitud>(await crear('asesor2', 'Solicitud ajena'))
        .data.id;
    });

    it('GET de solicitud ajena -> 403', async () => {
      const res = await obtener('asesor1', ajena).expect(403);
      expect(comoError(res).message).toBe(
        `No tiene permiso sobre la solicitud ${ajena}`,
      );
    });

    it('PATCH de solicitud ajena -> 403', async () => {
      const res = await cambiar('asesor1', ajena, 'EN_GESTION').expect(403);
      expect(comoError(res).message).toBe(
        `No tiene permiso sobre la solicitud ${ajena}`,
      );
    });

    it('GET de solicitud propia -> 200', async () => {
      const propia = comoExito<Solicitud>(
        await crear('asesor1', 'Solicitud propia'),
      ).data.id;
      await obtener('asesor1', propia).expect(200);
    });

    it('PATCH de solicitud propia -> 200', async () => {
      const propia = comoExito<Solicitud>(
        await crear('asesor1', 'Solicitud propia 2'),
      ).data.id;
      await cambiar('asesor1', propia, 'EN_GESTION').expect(200);
    });
  });

  describe('req 8: transiciones de estado', () => {
    it('flujo completo valido: PENDIENTE -> EN_GESTION -> RESUELTA', async () => {
      const id = comoExito<Solicitud>(await crear('asesor1', 'Flujo valido'))
        .data.id;

      const paso1 = await cambiar('asesor1', id, 'EN_GESTION').expect(200);
      expect(comoExito<Solicitud>(paso1).data.estado).toBe('EN_GESTION');

      const paso2 = await cambiar('asesor1', id, 'RESUELTA').expect(200);
      expect(comoExito<Solicitud>(paso2).data.estado).toBe('RESUELTA');
    });

    it.each([
      ['PENDIENTE', 'RESUELTA'],
      ['PENDIENTE', 'PENDIENTE'],
      ['EN_GESTION', 'PENDIENTE'],
      ['EN_GESTION', 'EN_GESTION'],
      ['RESUELTA', 'PENDIENTE'],
      ['RESUELTA', 'EN_GESTION'],
      ['RESUELTA', 'RESUELTA'],
    ])('rechaza %s -> %s con 409', async (origen, destino) => {
      const id = comoExito<Solicitud>(
        await crear('asesor1', `Transicion ${origen}-${destino}`),
      ).data.id;

      // llevamos la solicitud al estado de origen
      if (origen === 'EN_GESTION') {
        await cambiar('asesor1', id, 'EN_GESTION').expect(200);
      }
      if (origen === 'RESUELTA') {
        await cambiar('asesor1', id, 'EN_GESTION').expect(200);
        await cambiar('asesor1', id, 'RESUELTA').expect(200);
      }

      const res = await cambiar('asesor1', id, destino).expect(409);
      expect(comoError(res).message).toBe(
        `Transición no permitida: de ${origen} a ${destino}`,
      );

      // el estado no cambia
      const actual = await obtener('asesor1', id).expect(200);
      expect(comoExito<Solicitud>(actual).data.estado).toBe(origen);
    });

    it('el estado de una solicitud resuelta no se puede reabrir', async () => {
      const id = comoExito<Solicitud>(await crear('asesor1', 'Reabrir')).data
        .id;
      await cambiar('asesor1', id, 'EN_GESTION').expect(200);
      await cambiar('asesor1', id, 'RESUELTA').expect(200);
      await cambiar('asesor1', id, 'PENDIENTE').expect(409);
      await cambiar('asesor1', id, 'EN_GESTION').expect(409);
    });
  });

  describe('orden de validaciones: existe -> permiso -> transicion', () => {
    it('id inexistente -> 404 antes que la transicion sea evaluada', async () => {
      const res = await cambiar('admin1', 999999, 'RESUELTA').expect(404);
      expect(comoError(res).message).toBe(
        'No se encontró la solicitud con id 999999',
      );
    });

    it('solicitud ajena con transicion invalida -> 403 antes que el 409', async () => {
      const id = comoExito<Solicitud>(await crear('asesor2', 'Orden permiso'))
        .data.id;
      await cambiar('asesor2', id, 'EN_GESTION').expect(200);
      await cambiar('asesor2', id, 'RESUELTA').expect(200);
      // asesor1 pide una transicion invalida sobre una ajena: debe ganar el 403
      const res = await cambiar('asesor1', id, 'RESUELTA').expect(403);
      expect(comoError(res).message).toBe(
        `No tiene permiso sobre la solicitud ${id}`,
      );
    });

    it('id inexistente en GET -> 404', async () => {
      const res = await obtener('admin1', 999999).expect(404);
      expect(comoError(res).message).toBe(
        'No se encontró la solicitud con id 999999',
      );
    });
  });

  describe('administradores y supervisores', () => {
    it('admin ve todas las solicitudes, no solo las suyas', async () => {
      await crear('asesor1', 'De asesor1 para admin').expect(201);
      await crear('asesor2', 'De asesor2 para admin').expect(201);
      await crear('admin1', 'De admin1').expect(201);

      const data = comoExito<Solicitud[]>(
        await listar('admin1').expect(200),
      ).data;
      const asesores = new Set(data.map((s) => s.asesor));
      expect(asesores.has('asesor1')).toBe(true);
      expect(asesores.has('asesor2')).toBe(true);
      expect(asesores.has('admin1')).toBe(true);
    });

    it('supervisor ve todas las solicitudes, no solo las suyas', async () => {
      const data = comoExito<Solicitud[]>(
        await listar('supervisor1').expect(200),
      ).data;
      const asesores = new Set(data.map((s) => s.asesor));
      expect(asesores.has('asesor1')).toBe(true);
      expect(asesores.has('asesor2')).toBe(true);
    });

    it('admin puede cambiar el estado de una solicitud que no es suya', async () => {
      const id = comoExito<Solicitud>(
        await crear('asesor1', 'Para que admin cambie'),
      ).data.id;
      const res = await cambiar('admin1', id, 'EN_GESTION').expect(200);
      expect(comoExito<Solicitud>(res).data.estado).toBe('EN_GESTION');
    });

    it('supervisor puede cambiar el estado de una solicitud que no es suya', async () => {
      const id = comoExito<Solicitud>(
        await crear('asesor2', 'Para que supervisor cambie'),
      ).data.id;
      const res = await cambiar('supervisor1', id, 'EN_GESTION').expect(200);
      expect(comoExito<Solicitud>(res).data.estado).toBe('EN_GESTION');
    });

    it('admin y supervisor pueden ver una solicitud individual ajena', async () => {
      const id = comoExito<Solicitud>(
        await crear('asesor1', 'Individual ajena'),
      ).data.id;
      await obtener('admin1', id).expect(200);
      await obtener('supervisor1', id).expect(200);
    });

    it('admin y supervisor tambien reciben 409 en transiciones invalidas', async () => {
      const id = comoExito<Solicitud>(
        await crear('asesor1', 'Transicion admin'),
      ).data.id;
      await cambiar('admin1', id, 'EN_GESTION').expect(200);
      await cambiar('admin1', id, 'RESUELTA').expect(200);
      await cambiar('supervisor1', id, 'PENDIENTE').expect(409);
    });
  });
});
