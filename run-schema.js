require('dotenv').config();
const fs = require('fs');
const path = require('path');
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
    connectTimeout: 30000,
    requestTimeout: 60000
  }
};

async function executeSchema() {
  const sqlFilePath = path.join(__dirname, 'esquema_subastas_copart_2105.sql');
  console.log(`Leyendo script SQL desde: ${sqlFilePath}`);
  const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

  // Separar los lotes por la instrucción GO (en línea propia)
  const batches = sqlContent
    .split(/^\s*GO\s*$/im)
    .map(batch => batch.trim())
    .filter(batch => batch.length > 0);

  console.log(`Total de lotes (batches) a ejecutar: ${batches.length}\n`);

  let pool;
  try {
    console.log('Conectando a SQL Server...');
    pool = await sql.connect(config);
    console.log('✅ Conexión establecida.');

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const preview = batch.substring(0, 70).replace(/\r?\n/g, ' ');
      console.log(`[Lote ${i + 1}/${batches.length}] Ejecutando: "${preview}..."`);

      const request = pool.request();
      await request.query(batch);
      console.log(` -> Lote ${i + 1} completado con éxito.`);
    }

    console.log('\n=============================================');
    console.log('🎉 Todos los lotes se ejecutaron exitosamente.');
    console.log('=============================================\n');

    // Verificación de tablas creadas con el sufijo 2105
    console.log('--- Verificando tablas creadas (sufijo 2105) ---');
    const tablesCheck = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME LIKE '%2105'
      ORDER BY TABLE_NAME
    `);
    console.table(tablesCheck.recordset);

    // Verificación de procedimientos creados con el sufijo 2105
    console.log('\n--- Verificando procedimientos almacenados (sufijo 2105) ---');
    const procsCheck = await pool.request().query(`
      SELECT ROUTINE_SCHEMA, ROUTINE_NAME, ROUTINE_TYPE
      FROM INFORMATION_SCHEMA.ROUTINES
      WHERE ROUTINE_NAME LIKE '%2105'
      ORDER BY ROUTINE_NAME
    `);
    console.table(procsCheck.recordset);

    // Verificación de datos de catálogo insertados
    console.log('\n--- Verificando datos semilla insertados ---');
    const traccionesCheck = await pool.request().query('SELECT * FROM dbo.TRACCIONES2105');
    console.log('TRACCIONES2105:');
    console.table(traccionesCheck.recordset);

    const danosCheck = await pool.request().query('SELECT * FROM dbo.NIVELES_DANO2105');
    console.log('NIVELES_DANO2105:');
    console.table(danosCheck.recordset);

  } catch (err) {
    console.error('\n❌ Error al ejecutar el esquema SQL:');
    console.error('Mensaje:', err.message);
    if (err.lineNumber) console.error('Línea:', err.lineNumber);
    if (err.precedingErrors) console.error('Errores previos:', err.precedingErrors);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('\nConexión cerrada.');
    }
  }
}

executeSchema();
