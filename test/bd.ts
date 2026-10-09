import fs from 'fs';
import path from 'path';
import { Client, ClientConfig } from 'pg';

// jest no carga .env; lo leemos para que las pruebas acierten al mismo
// PostgreSQL que la aplicacion (las variables ya presentes en process.env ganan).
const cargarEnv = (): void => {
  const ruta = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(ruta)) return;
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(linea);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
};
cargarEnv();

const HOST = process.env.DB_HOST ?? 'localhost';
const PORT = Number(process.env.DB_PORT ?? 5432);
const USER = process.env.DB_USERNAME ?? 'solicitudes';
const PASSWORD = process.env.DB_PASSWORD ?? 'solicitudes_dev_password';

const configAdmin = (): ClientConfig => ({
  host: HOST,
  port: PORT,
  user: USER,
  password: PASSWORD,
});

export const conectarAdmin = async (): Promise<Client> => {
  const client = new Client({ ...configAdmin(), database: 'postgres' });
  await client.connect();
  return client;
};

export const crearBaseDeDatos = async (nombre: string): Promise<void> => {
  const client = await conectarAdmin();
  try {
    await client.query(`CREATE DATABASE "${nombre}"`);
  } finally {
    await client.end();
  }
};

export const eliminarBaseDeDatos = async (nombre: string): Promise<void> => {
  const client = await conectarAdmin();
  try {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      [nombre],
    );
    await client.query(`DROP DATABASE IF EXISTS "${nombre}"`);
  } finally {
    await client.end();
  }
};

export const configurarEntorno = (nombreBD: string): void => {
  process.env.DB_HOST = HOST;
  process.env.DB_PORT = String(PORT);
  process.env.DB_USERNAME = USER;
  process.env.DB_PASSWORD = PASSWORD;
  process.env.DB_DATABASE = nombreBD;
};
