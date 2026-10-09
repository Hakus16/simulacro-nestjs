export interface CuerpoError {
  statusCode: number;
  message: string | string[];
  timestamp: string;
}

export interface CuerpoExito<T> {
  success: true;
  data: T;
}

export interface Solicitud {
  id: number;
  cliente: string;
  descripcion: string;
  asesor: string;
  estado: string;
  creadaEn: string;
  actualizadaEn: string;
}

export const comoError = (res: { body: unknown }): CuerpoError =>
  res.body as CuerpoError;

export const comoExito = <T>(res: { body: unknown }): CuerpoExito<T> =>
  res.body as CuerpoExito<T>;
