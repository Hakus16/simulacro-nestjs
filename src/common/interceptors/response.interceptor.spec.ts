import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, Observable, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor (req 9)', () => {
  const interceptor = new ResponseInterceptor<unknown>();
  const context = {} as ExecutionContext;

  const nextOf = (data: unknown, handle?: jest.Mock): CallHandler => ({
    handle: handle ?? (() => of(data)),
  });

  it('envuelve la respuesta exitosa en { success: true, data }', async () => {
    const resultado = await lastValueFrom(
      interceptor.intercept(context, nextOf({ id: 1, cliente: 'ACME' })),
    );
    expect(resultado).toEqual({
      success: true,
      data: { id: 1, cliente: 'ACME' },
    });
  });

  it('usa map sobre next.handle() (handle se invoca una vez)', async () => {
    const handle = jest.fn(() => of('Hello World!'));
    const resultado = await lastValueFrom(
      interceptor.intercept(context, { handle }),
    );
    expect(handle).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({ success: true, data: 'Hello World!' });
  });

  it('devuelve un Observable de rxjs', () => {
    const salida = interceptor.intercept(context, nextOf(1));
    expect(salida).toBeInstanceOf(Observable);
  });

  it('conserva arrays como data sin envolverlos dos veces', async () => {
    const resultado = await lastValueFrom(
      interceptor.intercept(context, nextOf([1, 2, 3])),
    );
    expect(resultado).toEqual({ success: true, data: [1, 2, 3] });
  });

  it('la clave success siempre es true (const)', async () => {
    const resultado = await lastValueFrom(
      interceptor.intercept(context, nextOf(null)),
    );
    expect(resultado).toEqual({ success: true, data: null });
    expect(Object.keys(resultado).sort()).toEqual(['data', 'success']);
  });

  it('no añade campos adicionales al envoltorio', async () => {
    const resultado = await lastValueFrom(
      interceptor.intercept(context, nextOf('x')),
    );
    expect(Object.keys(resultado)).toHaveLength(2);
  });
});
