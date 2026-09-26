const { query, executeProc } = require('../config/db');

/**
 * Revisa si una subasta activa ya venció su tiempo de cierre y ejecuta el Stored Procedure de cierre.
 */
async function verificarCierreSubasta(subastaId) {
  try {
    const res = await query(`
      SELECT SUBASTA_ID, ESTADO, FIN_UTC
      FROM dbo.SUBASTAS2105
      WHERE SUBASTA_ID = @id
    `, [{ name: 'id', value: subastaId }]);

    if (res.recordset.length === 0) return null;
    const sub = res.recordset[0];

    if (sub.ESTADO === 'PUBLICADA' && new Date(sub.FIN_UTC) <= new Date()) {
      await executeProc('dbo.CERRAR_SUBASTA2105', [{ name: 'SUBASTA_ID', value: subastaId }]);
      console.log(`Subasta #${subastaId} ha sido cerrada automáticamente por vencimiento de tiempo.`);
    }
  } catch (err) {
    // Si ya fue cerrada o en proceso, ignorar
    console.warn(`Verificación de cierre en subasta #${subastaId}:`, err.message);
  }
}

/**
 * Revisa todas las subastas publicadas que ya hayan superado su fecha de fin y las cierra.
 */
async function procesarSubastasVencidas() {
  try {
    const vencidas = await query(`
      SELECT SUBASTA_ID 
      FROM dbo.SUBASTAS2105 
      WHERE ESTADO = 'PUBLICADA' AND FIN_UTC <= SYSUTCDATETIME()
    `);

    for (const s of vencidas.recordset) {
      await verificarCierreSubasta(s.SUBASTA_ID);
    }
  } catch (err) {
    console.warn('Error al procesar subastas vencidas:', err.message);
  }
}

module.exports = {
  verificarCierreSubasta,
  procesarSubastasVencidas
};
