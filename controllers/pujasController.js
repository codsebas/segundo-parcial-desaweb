const { query, executeProc } = require('../config/db');
const { verificarCierreSubasta } = require('../services/subastaService');

async function registrarPuja(req, res) {
  try {
    const usuarioId = req.user.id;
    const subastaId = parseInt(req.params.id, 10);
    const { monto } = req.body;

    if (isNaN(subastaId)) {
      return res.status(400).json({ status: 'error', message: 'ID de subasta inválido.' });
    }

    const nMonto = parseFloat(monto);
    if (isNaN(nMonto) || nMonto <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Debe ingresar un monto de oferta numérico válido y mayor a cero.'
      });
    }

    // Verificar y cerrar si ya venció la fecha/hora fin antes de permitir ofertas
    await verificarCierreSubasta(subastaId);

    // Verificar si la subasta existe y está activa
    const checkSub = await query(`
      SELECT s.SUBASTA_ID, s.PRECIO_BASE, s.ESTADO, s.INICIO_UTC, s.FIN_UTC, v.PUBLICADOR_USUARIO_ID,
             (SELECT MAX(MONTO) FROM dbo.PUJAS2105 WHERE SUBASTA_ID = s.SUBASTA_ID) AS OFERTA_MAXIMA
      FROM dbo.SUBASTAS2105 AS s
      JOIN dbo.VEHICULOS2105 AS v ON v.VEHICULO_ID = s.VEHICULO_ID
      WHERE s.SUBASTA_ID = @subastaId
    `, [{ name: 'subastaId', value: subastaId }]);

    if (checkSub.recordset.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Error de referencia: La subasta especificada no existe.'
      });
    }

    const sub = checkSub.recordset[0];

    // Validar estado y vigencia temporal
    const ahora = new Date();
    if (sub.ESTADO !== 'PUBLICADA' || ahora < new Date(sub.INICIO_UTC) || ahora >= new Date(sub.FIN_UTC)) {
      return res.status(400).json({
        status: 'error',
        message: 'La subasta no acepta ofertas en este momento: Oferta cerrada o fuera de horario.'
      });
    }

    // Impedir que el mismo publicador puje en su propia subasta
    if (sub.PUBLICADOR_USUARIO_ID === usuarioId) {
      return res.status(400).json({
        status: 'error',
        message: 'No puedes pujar en una subasta de tu propia publicación.'
      });
    }

    // Validación preliminar del monto en servidor
    if (nMonto <= sub.PRECIO_BASE) {
      return res.status(400).json({
        status: 'error',
        message: `La oferta debe superar el monto base de la subasta (Q. ${Number(sub.PRECIO_BASE).toLocaleString('es-GT', { minimumFractionDigits: 2 })}).`
      });
    }

    if (sub.OFERTA_MAXIMA !== null) {
      const minRequerido = Number(sub.OFERTA_MAXIMA) * 1.10;
      if (nMonto < minRequerido) {
        return res.status(400).json({
          status: 'error',
          message: `La oferta debe superar la puja actual de Q. ${Number(sub.OFERTA_MAXIMA).toLocaleString('es-GT', { minimumFractionDigits: 2 })} por al menos un 10% (Mínimo requerido: Q. ${Math.ceil(minRequerido * 100) / 100}).`
        });
      }
    }

    // Ejecutar el procedimiento almacenado transaccional y seguro
    const procResult = await executeProc('dbo.REGISTRAR_PUJA2105', [
      { name: 'SUBASTA_ID', value: subastaId },
      { name: 'USUARIO_ID', value: usuarioId },
      { name: 'MONTO', value: nMonto }
    ]);

    const resultado = procResult.recordset[0];

    return res.status(201).json({
      status: 'success',
      message: '¡Puja registrada exitosamente! Vas ganando la subasta.',
      data: {
        pujaId: resultado.PUJA_ID,
        montoAceptado: resultado.MONTO_ACEPTADO,
        subastaId,
        badgeEstado: 'GANANDO'
      }
    });
  } catch (err) {
    console.error('Error al registrar puja:', err);
    // Errores controlados del Stored Procedure (51100 a 51104)
    if (err.number >= 51100 && err.number <= 51104) {
      return res.status(400).json({
        status: 'error',
        message: err.message
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Error al procesar la puja: ' + err.message
    });
  }
}

async function getHistorialPujas(req, res) {
  try {
    const subastaId = parseInt(req.params.id, 10);
    if (isNaN(subastaId)) {
      return res.status(400).json({ status: 'error', message: 'ID de subasta inválido.' });
    }

    const result = await query(`
      SELECT 
        p.PUJA_ID,
        p.MONTO,
        p.CREADO_UTC,
        DENSE_RANK() OVER (ORDER BY p.USUARIO_ID ASC) AS POSTOR_NUMERO
      FROM dbo.PUJAS2105 AS p
      WHERE p.SUBASTA_ID = @subastaId
      ORDER BY p.MONTO DESC, p.CREADO_UTC DESC
    `, [{ name: 'subastaId', value: subastaId }]);

    // Formatear anónimamente para cumplir con la regla de privacidad
    const historialAnonimo = result.recordset.map((item, idx) => ({
      pujaId: item.PUJA_ID,
      monto: item.MONTO,
      fechaUtc: item.CREADO_UTC,
      postorAnonimo: `Postor #${item.POSTOR_NUMERO}`,
      esMayor: (idx === 0)
    }));

    return res.status(200).json({
      status: 'success',
      data: historialAnonimo
    });
  } catch (err) {
    console.error('Error al consultar historial de pujas:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al consultar historial: ' + err.message
    });
  }
}

async function getMisNotificaciones(req, res) {
  try {
    const usuarioId = req.user.id;

    const result = await query(`
      SELECT 
        n.NOTIFICACION_ID,
        n.SUBASTA_ID,
        n.TIPO,
        n.CREADO_UTC,
        n.LEIDO_UTC,
        m.NOMBRE AS MARCA,
        mo.NOMBRE AS MODELO,
        v.ANIO
      FROM dbo.NOTIFICACIONES2105 AS n
      JOIN dbo.SUBASTAS2105 AS s ON s.SUBASTA_ID = n.SUBASTA_ID
      JOIN dbo.VEHICULOS2105 AS v ON v.VEHICULO_ID = s.VEHICULO_ID
      JOIN dbo.MARCAS2105 AS m ON m.MARCA_ID = v.MARCA_ID
      JOIN dbo.MODELOS2105 AS mo ON mo.MODELO_ID = v.MODELO_ID
      WHERE n.USUARIO_ID = @usuarioId
      ORDER BY n.CREADO_UTC DESC
    `, [{ name: 'usuarioId', value: usuarioId }]);

    return res.status(200).json({
      status: 'success',
      data: result.recordset
    });
  } catch (err) {
    console.error('Error al consultar notificaciones:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al consultar notificaciones: ' + err.message
    });
  }
}

module.exports = {
  registrarPuja,
  getHistorialPujas,
  getMisNotificaciones
};
