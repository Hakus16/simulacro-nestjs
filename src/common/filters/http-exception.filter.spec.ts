import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

interface CuerpoError {
  statusCode: number;
  message: string | string[];
  timestamp: string;
}

interface RespuestaMock {
  status(code: number): RespuestaMock;
  json(payload: CuerpoError): RespuestaMock;
}

describe('HttpExceptionFilter (req 10)', () => {
  const filter = new HttpExceptionFilter();

  interface Probe {
    host: ArgumentsHost;
    status: () => number | undefined;
    body: () => CuerpoError;
  }

  const buildHost = (): Probe => {
    let status: number | undefined;
    let body: CuerpoError = { statusCode: 0, message: '', timestamp: '' };
    const response: RespuestaMock = {
      status(code: number) {
        status = code;
        return response;
      },
      json(payload: CuerpoError) {
        body = payload;
        return response;
      },
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    return { host, status: () => status, body: () => body };
  };

  const esquemaExacto = (body: CuerpoError) => {
    expect(Object.keys(body).sort()).toEqual([
      'message',
      'statusCode',
      'timestamp',
    ]);
  };

  describe('excepciones que NO son HttpException -> 500 y mensaje generico', () => {
    it.each([
      ['TypeError', new TypeError('boom interno')],
      ['Error', new Error('stack sensible')],
      ['RangeError', new RangeError('rango')],
      ['null', null],
      ['undefined', undefined],
    ])('con %s responde 500 sin filtrar detalles', (_label, excepcion) => {
      const { host, status, body } = buildHost();
      filter.catch(excepcion, host);
      const recibido = body();
      expect(status()).toBe(500);
      expect(recibido.statusCode).toBe(500);
      expect(recibido.message).toBe('Error interno del servidor');
      expect(typeof recibido.timestamp).toBe('string');
      expect(JSON.stringify(recibido)).not.toContain('boom');
      expect(JSON.stringify(recibido)).not.toContain('stack');
    });

    it('el cuerpo de error 500 tiene exactamente statusCode, message y timestamp', () => {
      const { host, body } = buildHost();
      filter.catch(new TypeError('boom'), host);
      esquemaExacto(body());
    });
  });

  describe('excepciones HttpException conservan su codigo HTTP real', () => {
    it.each([
      ['400', new BadRequestException('Datos de entrada inválidos.'), 400],
      ['401', new UnauthorizedException('Falta el encabezado x-api-key'), 401],
      [
        '403',
        new ForbiddenException('No tiene permiso sobre la solicitud 1'),
        403,
      ],
      [
        '404',
        new NotFoundException('No se encontró la solicitud con id 999'),
        404,
      ],
      [
        '409',
        new ConflictException(
          'Transición no permitida: de PENDIENTE a RESUELTA',
        ),
        409,
      ],
      ['418', new HttpException('mensaje plano', 418), 418],
    ])(
      'estatus %s se conserva (no se convierte en 500)',
      (_l, excepcion, esperado) => {
        const { host, status, body } = buildHost();
        filter.catch(excepcion, host);
        expect(status()).toBe(esperado);
        expect(body().statusCode).toBe(esperado);
        expect(status()).not.toBe(500);
      },
    );

    it('extrae el mensaje de getResponse() cuando es string', () => {
      const { host, body } = buildHost();
      filter.catch(new HttpException('mensaje plano', 418), host);
      expect(body().message).toBe('mensaje plano');
    });

    it('extrae el mensaje de getResponse() cuando es objeto con message string', () => {
      const { host, body } = buildHost();
      filter.catch(
        new NotFoundException('No se encontró la solicitud con id 999'),
        host,
      );
      expect(body().message).toBe('No se encontró la solicitud con id 999');
    });

    it('conserva el arreglo de strings del ValidationPipe tal cual', () => {
      const errores = [
        'cliente should not be empty',
        'descripcion must be a string',
      ];
      const { host, status, body } = buildHost();
      filter.catch(new BadRequestException(errores), host);
      expect(status()).toBe(400);
      expect(body().message).toEqual(errores);
      expect(Array.isArray(body().message)).toBe(true);
    });

    it('usa exception.message si getResponse() no trae message', () => {
      const excepcion = new HttpException({ codigo: 'X' }, 400);
      const { host, body } = buildHost();
      filter.catch(excepcion, host);
      expect(body().message).toBe(excepcion.message);
    });

    it('el cuerpo tiene exactamente statusCode, message y timestamp', () => {
      const { host, body } = buildHost();
      filter.catch(new BadRequestException(['a']), host);
      esquemaExacto(body());
    });

    it('no incluye campos extra como error, path o success', () => {
      const { host, body } = buildHost();
      filter.catch(
        new UnauthorizedException('Falta el encabezado x-api-key'),
        host,
      );
      expect(body()).not.toHaveProperty('error');
      expect(body()).not.toHaveProperty('path');
      expect(body()).not.toHaveProperty('success');
    });
  });

  describe('timestamp', () => {
    it('es una fecha ISO del momento del error', () => {
      const antes = Date.now();
      const { host, body } = buildHost();
      filter.catch(new NotFoundException('x'), host);
      const recibido = body().timestamp;
      expect(recibido).toBe(new Date(recibido).toISOString());
      const ms = Date.parse(recibido);
      expect(ms).toBeGreaterThanOrEqual(antes - 1000);
      expect(ms).toBeLessThanOrEqual(Date.now() + 1000);
    });
  });
});
