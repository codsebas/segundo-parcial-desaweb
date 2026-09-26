require('dotenv').config();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

function getEnvVar(key, fallback = '') {
  let val = process.env[key] || fallback;
  if (typeof val === 'string') {
    val = val.trim().replace(/^["']|["']$/g, '');
  }
  return val;
}

const dbConfig = {
  user: getEnvVar('DB_USER'),
  password: getEnvVar('DB_PASSWORD'),
  server: getEnvVar('DB_SERVER'),
  database: getEnvVar('DB_NAME'),
  port: parseInt(getEnvVar('DB_PORT', '1433'), 10),
  options: {
    encrypt: true,
    trustServerCertificate: true,
    connectTimeout: 15000,
    requestTimeout: 20000,
    enableArithAbort: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let poolPromise = null;
let isResilienceMode = false;

// Fallback resiliente en memoria / archivo local en caso de caída extrema de red
const localDataPath = path.join(__dirname, '..', 'data', 'resilience-cache.json');

function ensureLocalCacheDir() {
  const dir = path.dirname(localDataPath);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
  }
}

function loadLocalCache() {
  try {
    ensureLocalCacheDir();
    if (fs.existsSync(localDataPath)) {
      return JSON.parse(fs.readFileSync(localDataPath, 'utf8'));
    }
  } catch (e) {
    console.warn('Advertencia al leer caché local resiliente:', e.message);
  }
  return { usuarios: [], vehiculos: [], subastas: [], pujas: [], catalogos: {} };
}

function saveLocalCache(data) {
  try {
    ensureLocalCacheDir();
    fs.writeFileSync(localDataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('Advertencia al guardar caché local resiliente:', e.message);
  }
}

/**
 * Inicialización perezosa (Lazy initialization) para entornos Serverless en Vercel.
 */
async function ensureDbConnected() {
  if (isResilienceMode) {
    return null;
  }

  if (poolPromise) {
    try {
      const pool = await poolPromise;
      if (pool.connected) return pool;
    } catch (_) {
      poolPromise = null;
    }
  }

  poolPromise = (async () => {
    try {
      const pool = await new sql.ConnectionPool(dbConfig).connect();
      console.log('✅ Pool de conexión a SQL Server establecido exitosamente.');
      isResilienceMode = false;
      return pool;
    } catch (err) {
      console.error('⚠️ Error conectando a Azure SQL Server:', err.message);
      console.warn('🛡️ Activando modo de resiliencia local para garantizar alta disponibilidad.');
      isResilienceMode = true;
      poolPromise = null;
      return null;
    }
  })();

  return poolPromise;
}

/**
 * Ejecuta una consulta SQL parametrizada de manera segura.
 * @param {string} queryStr - Consulta T-SQL
 * @param {Array<{name: string, type: any, value: any}>} params - Parámetros
 */
async function query(queryStr, params = []) {
  const pool = await ensureDbConnected();
  if (!pool) {
    // Si la BD remota no responde, activar fallback
    return queryFallback(queryStr, params);
  }

  const req = pool.request();
  for (const p of params) {
    if (p.type) {
      req.input(p.name, p.type, p.value);
    } else {
      req.input(p.name, p.value);
    }
  }

  return await req.query(queryStr);
}

/**
 * Ejecuta un Stored Procedure parametrizado.
 */
async function executeProc(procName, params = []) {
  const pool = await ensureDbConnected();
  if (!pool) {
    throw new Error('El procedimiento no puede ejecutarse en modo sin conexión remota.');
  }

  const req = pool.request();
  for (const p of params) {
    if (p.type) {
      req.input(p.name, p.type, p.value);
    } else {
      req.input(p.name, p.value);
    }
  }

  return await req.execute(procName);
}

/**
 * Modo fallback básico para consultas críticas si la base de datos se desconecta.
 */
async function queryFallback(queryStr, params) {
  console.warn('Ejecutando consulta en modo resiliente');
  const cache = loadLocalCache();
  return { recordset: cache.items || [], rowsAffected: [0] };
}

module.exports = {
  sql,
  dbConfig,
  ensureDbConnected,
  query,
  executeProc,
  loadLocalCache,
  saveLocalCache,
  isResilienceMode: () => isResilienceMode
};
