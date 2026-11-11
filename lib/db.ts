import mysql, { Pool } from 'mysql2/promise';
import net from 'net';
import { Client as SshClient } from 'ssh2';

// Database settings. DB_HOST/DB_PORT are the MySQL address; when SSH_HOST is set
// the connection goes through an SSH tunnel to that server first.
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '3306');

const SSH_HOST = process.env.SSH_HOST;
const SSH_PORT = parseInt(process.env.SSH_PORT || '22');
const SSH_USER = process.env.SSH_USER;
const SSH_PASSWORD = process.env.SSH_PASSWORD;

// Keep the pool and tunnel on globalThis so dev hot reloads reuse them
// instead of opening a new SSH session on every change.
const globalForDb = globalThis as unknown as {
  dbPoolPromise?: Promise<Pool>;
};

/**
 * Opens an SSH session and a local TCP server on a random port that forwards
 * every connection to MySQL as seen from the SSH server. Resolves with that port.
 */
function openSshTunnel(onClose: () => void): Promise<number> {
  // If MySQL runs on the SSH server itself, reach it as localhost from there.
  const targetHost = DB_HOST === SSH_HOST ? '127.0.0.1' : DB_HOST;

  return new Promise((resolve, reject) => {
    const ssh = new SshClient();
    let server: net.Server | undefined;
    let ready = false;

    ssh.on('ready', () => {
      ready = true;
      server = net.createServer((socket) => {
        ssh.forwardOut('127.0.0.1', socket.remotePort || 0, targetHost, DB_PORT, (err, stream) => {
          if (err) {
            console.error('SSH forward error:', err.message);
            socket.destroy();
            return;
          }
          socket.pipe(stream).pipe(socket);
          socket.on('error', () => stream.destroy());
          stream.on('error', () => socket.destroy());
        });
      });
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        resolve((server!.address() as net.AddressInfo).port);
      });
    });

    ssh.on('error', (err) => {
      console.error('SSH tunnel error:', err.message);
      if (!ready) reject(err);
    });

    ssh.on('close', () => {
      server?.close();
      onClose();
    });

    ssh.connect({
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      password: SSH_PASSWORD,
      readyTimeout: 20000,
      keepaliveInterval: 15000,
    });
  });
}

async function createPool(): Promise<Pool> {
  let host = DB_HOST;
  let port = DB_PORT;

  if (SSH_HOST) {
    // Drop the cached pool when the tunnel dies so the next query reconnects.
    port = await openSshTunnel(() => {
      globalForDb.dbPoolPromise = undefined;
    });
    host = '127.0.0.1';
  }

  return mysql.createPool({
    host,
    port,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ecommerce',
    connectionLimit: 8,
    dateStrings: true,
    // SUM()/AVG()/DECIMAL come back as numbers instead of strings, so charts work.
    decimalNumbers: true,
  });
}

export function getPool(): Promise<Pool> {
  if (!globalForDb.dbPoolPromise) {
    globalForDb.dbPoolPromise = createPool().catch((err) => {
      globalForDb.dbPoolPromise = undefined;
      throw err;
    });
  }
  return globalForDb.dbPoolPromise;
}

export async function executeQuery<T>(query: string, params: any[] = []): Promise<T> {
  try {
    const pool = await getPool();
    const [rows] = await pool.execute(query, params);
    return rows as T;
  } catch (error) {
    console.error('Database query error:', error);
    throw new Error('Failed to execute database query');
  }
}

export type DbEngine = { name: 'MariaDB' | 'MySQL'; version: string };

const globalForEngine = globalThis as unknown as { dbEngine?: Promise<DbEngine> };

/** MariaDB (QA) and MySQL (producción) need different syntax for some settings. */
export function getEngine(): Promise<DbEngine> {
  if (!globalForEngine.dbEngine) {
    globalForEngine.dbEngine = getPool()
      .then((pool) => pool.query('SELECT VERSION() AS v'))
      .then(([rows]) => {
        const v = String((rows as { v: string }[])[0]?.v ?? '');
        return { name: /mariadb/i.test(v) ? 'MariaDB' : 'MySQL', version: v.split('-')[0] } as DbEngine;
      })
      .catch((err) => {
        globalForEngine.dbEngine = undefined;
        throw err;
      });
  }
  return globalForEngine.dbEngine;
}

/**
 * Runs a query inside a READ ONLY transaction with a time limit, so it can never
 * change data or hang the server. Errors keep the original database message.
 * Uses query() rather than execute() so callers can inline validated LIMIT/OFFSET.
 */
export async function executeReadOnly<T = any[]>(
  query: string,
  params: any[] = [],
  timeoutSeconds = 20
): Promise<T> {
  const engine = await getEngine();
  // MariaDB: seconds, any statement. MySQL: milliseconds, SELECT only.
  const timeoutVar = engine.name === 'MariaDB' ? 'max_statement_time' : 'max_execution_time';
  const timeoutValue = engine.name === 'MariaDB' ? Number(timeoutSeconds) : Number(timeoutSeconds) * 1000;
  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    await conn.query(`SET SESSION ${timeoutVar} = ${timeoutValue}`);
    await conn.query('START TRANSACTION READ ONLY');
    const [rows] = await conn.query(query, params);
    return rows as T;
  } finally {
    await conn.query('ROLLBACK').catch(() => {});
    await conn.query(`SET SESSION ${timeoutVar} = 0`).catch(() => {});
    conn.release();
  }
}

// Helper functions for common database operations
export async function findAll<T>(table: string): Promise<T[]> {
  return executeQuery<T[]>(`SELECT * FROM ${table}`);
}

export async function findById<T>(table: string, id: string): Promise<T> {
  const results = await executeQuery<T[]>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  return results[0];
}

export async function findByField<T>(table: string, field: string, value: any): Promise<T[]> {
  return executeQuery<T[]>(`SELECT * FROM ${table} WHERE ${field} = ?`, [value]);
}

export async function create<T>(table: string, data: Record<string, any>): Promise<T> {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map(() => '?').join(', ');

  const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
  const result = await executeQuery<any>(query, values);

  return { id: result.insertId, ...data } as T;
}

export async function update<T>(table: string, id: string, data: Record<string, any>): Promise<T> {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClause = keys.map(key => `${key} = ?`).join(', ');

  const query = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
  await executeQuery<any>(query, [...values, id]);

  return { id, ...data } as T;
}

export async function remove(table: string, id: string): Promise<void> {
  await executeQuery<any>(`DELETE FROM ${table} WHERE id = ?`, [id]);
}
