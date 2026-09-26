require('dotenv').config();
const sql = require('mssql');

const sanitizedPassword = (process.env.DB_PASSWORD || '')
  .trim()
  .replace(/^["']|["']$/g, '');

const config = {
  user: process.env.DB_USER,
  password: sanitizedPassword,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  options: {
    encrypt: true,
    trustServerCertificate: true,
    connectTimeout: 15000,
    requestTimeout: 15000
  }
};

async function testConnection() {
  console.log('--- Probando conexión a SQL Server ---');
  console.log(`Servidor: ${config.server}:${config.port}`);
  console.log(`Base de datos: ${config.database}`);
  console.log(`Usuario: ${config.user}`);
  console.log('Intentando conectar...');

  const startTime = Date.now();
  let pool;
  try {
    pool = await sql.connect(config);
    const duration = Date.now() - startTime;
    console.log(`\n✅ ¡Conexión exitosa a SQL Server en ${duration}ms!`);

    // Consulta de información básica del servidor y base de datos
    const infoResult = await pool.request().query(`
      SELECT 
        @@VERSION AS [version],
        DB_NAME() AS [current_database],
        SYSTEM_USER AS [system_user],
        CURRENT_USER AS [current_user]
    `);
    console.log('\nInformación de sesión:');
    console.table(infoResult.recordset);

    // Consulta de tablas existentes en la base de datos
    const tablesResult = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
      FROM INFORMATION_SCHEMA.TABLES
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
    console.log(`\nTablas encontradas en la BD (${tablesResult.recordset.length}):`);
    console.table(tablesResult.recordset);

  } catch (err) {
    console.error('\n❌ Error al conectar a la base de datos:');
    console.error('Mensaje:', err.message);
    console.error('Código:', err.code);
    console.error('Detalles completos:', err);
  } finally {
    if (pool) {
      await pool.close();
      console.log('\nConexión cerrada.');
    }
  }
}

testConnection();
