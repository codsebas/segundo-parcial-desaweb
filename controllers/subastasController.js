const { query } = require('../config/db');
const { verificarCierreSubasta, procesarSubastasVencidas } = require('../services/subastaService');

async function getSubastas(req, res) {
  try {
    // Procesar cierres en segundo plano
    procesarSubastasVencidas().catch(() => {});

    const {
      marcaId,
      modeloId,
      anio,
      combustibleId,
      nivelDano,
      precioMin,
      precioMax,
      search,
      soloActivas
    } = req.query;

    let conditions = ['1=1'];
    const params = [];

    // Por defecto mostrar publicadas y activas a menos que se indique ver todas
    if (soloActivas === 'false') {
      conditions.push("s.ESTADO IN ('PUBLICADA', 'CERRADA')");
    } else {
      conditions.push("s.ESTADO = 'PUBLICADA'");
    }

    if (marcaId) {
      conditions.push('v.MARCA_ID = @marcaId');
      params.push({ name: 'marcaId', value: parseInt(marcaId, 10) });
    }

    if (modeloId) {
      conditions.push('v.MODELO_ID = @modeloId');
      params.push({ name: 'modeloId', value: parseInt(modeloId, 10) });
    }

    if (anio) {
      conditions.push('v.ANIO = @anio');
      params.push({ name: 'anio', value: parseInt(anio, 10) });
    }

    if (combustibleId) {
      conditions.push('v.COMBUSTIBLE_ID = @combustibleId');
      params.push({ name: 'combustibleId', value: parseInt(combustibleId, 10) });
    }

    if (nivelDano) {
      conditions.push('nd.CODIGO = @nivelDano');
      params.push({ name: 'nivelDano', value: nivelDano.toUpperCase().trim() });
    }

    if (precioMin) {
      conditions.push('s.PRECIO_BASE >= @precioMin');
      params.push({ name: 'precioMin', value: parseFloat(precioMin) });
    }

    if (precioMax) {
      conditions.push('s.PRECIO_BASE <= @precioMax');
      params.push({ name: 'precioMax', value: parseFloat(precioMax) });
    }

    if (search && search.trim().length > 0) {
      conditions.push(`(
        m.NOMBRE LIKE @search OR
        mo.NOMBRE LIKE @search OR
        v.MOTOR LIKE @search OR
        CAST(v.ANIO AS VARCHAR) LIKE @search
      )`);
      params.push({ name: 'search', value: `%${search.trim()}%` });
    }

    const whereClause = conditions.join(' AND ');

    const sqlQuery = `
      SELECT 
        s.SUBASTA_ID,
        s.PRECIO_BASE,
        s.INICIO_UTC,
        s.FIN_UTC,
        s.ESTADO,
        s.RESULTADO,
        v.VEHICULO_ID,
        v.ANIO,
        v.MOTOR,
        v.NUMERO_CILINDROS,
        m.NOMBRE AS MARCA,
        mo.NOMBRE AS MODELO,
        t.NOMBRE AS TIPO_ARTICULO,
        tr.NOMBRE AS TRANSMISION,
        c.NOMBRE AS COMBUSTIBLE,
        tc.CODIGO AS TRACCION,
        nd.CODIGO AS NIVEL_DANO_CODIGO,
        nd.DESCRIPCION AS NIVEL_DANO_DESC,
        (
          SELECT TOP 1 FOTO_ID 
          FROM dbo.FOTOS_VEHICULO2105 
          WHERE VEHICULO_ID = v.VEHICULO_ID 
          ORDER BY ORDEN ASC
        ) AS FOTO_PORTADA_ID,
        (
          SELECT COUNT(*) 
          FROM dbo.FOTOS_VEHICULO2105 
          WHERE VEHICULO_ID = v.VEHICULO_ID
        ) AS TOTAL_FOTOS,
        (
          SELECT COUNT(*) 
          FROM dbo.PUJAS2105 
          WHERE SUBASTA_ID = s.SUBASTA_ID
        ) AS TOTAL_PUJAS,
        (
          SELECT MAX(MONTO) 
          FROM dbo.PUJAS2105 
          WHERE SUBASTA_ID = s.SUBASTA_ID
        ) AS OFERTA_ACTUAL
      FROM dbo.SUBASTAS2105 AS s
      JOIN dbo.VEHICULOS2105 AS v ON v.VEHICULO_ID = s.VEHICULO_ID
      JOIN dbo.MARCAS2105 AS m ON m.MARCA_ID = v.MARCA_ID
      JOIN dbo.MODELOS2105 AS mo ON mo.MODELO_ID = v.MODELO_ID
      JOIN dbo.TIPOS_ARTICULO2105 AS t ON t.TIPO_ARTICULO_ID = v.TIPO_ARTICULO_ID
      JOIN dbo.TRANSMISIONES2105 AS tr ON tr.TRANSMISION_ID = v.TRANSMISION_ID
      JOIN dbo.COMBUSTIBLES2105 AS c ON c.COMBUSTIBLE_ID = v.COMBUSTIBLE_ID
      JOIN dbo.TRACCIONES2105 AS tc ON tc.TRACCION_ID = v.TRACCION_ID
      JOIN dbo.NIVELES_DANO2105 AS nd ON nd.NIVEL_DANO_ID = v.NIVEL_DANO_ID
      WHERE ${whereClause}
      ORDER BY s.INICIO_UTC DESC
    `;

    const result = await query(sqlQuery, params);

    return res.status(200).json({
      status: 'success',
      total: result.recordset.length,
      data: result.recordset
    });
  } catch (err) {
    console.error('Error al consultar subastas:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al consultar inventario de subastas: ' + err.message
    });
  }
}

async function getSubastaPorId(req, res) {
  try {
    const subastaId = parseInt(req.params.id, 10);
    if (isNaN(subastaId)) {
      return res.status(400).json({ status: 'error', message: 'ID de subasta inválido.' });
    }

    await verificarCierreSubasta(subastaId);

    const result = await query(`
      SELECT 
        s.SUBASTA_ID,
        s.PRECIO_BASE,
        s.INICIO_UTC,
        s.FIN_UTC,
        s.ESTADO,
        s.RESULTADO,
        s.CERRADA_UTC,
        v.VEHICULO_ID,
        v.PUBLICADOR_USUARIO_ID,
        v.ANIO,
        v.MOTOR,
        v.NUMERO_CILINDROS,
        m.MARCA_ID,
        m.NOMBRE AS MARCA,
        mo.MODELO_ID,
        mo.NOMBRE AS MODELO,
        t.TIPO_ARTICULO_ID,
        t.NOMBRE AS TIPO_ARTICULO,
        tr.TRANSMISION_ID,
        tr.NOMBRE AS TRANSMISION,
        c.COMBUSTIBLE_ID,
        c.NOMBRE AS COMBUSTIBLE,
        tc.TRACCION_ID,
        tc.CODIGO AS TRACCION,
        nd.NIVEL_DANO_ID,
        nd.CODIGO AS NIVEL_DANO_CODIGO,
        nd.DESCRIPCION AS NIVEL_DANO_DESC,
        (
          SELECT COUNT(*) 
          FROM dbo.PUJAS2105 
          WHERE SUBASTA_ID = s.SUBASTA_ID
        ) AS TOTAL_PUJAS,
        (
          SELECT MAX(MONTO) 
          FROM dbo.PUJAS2105 
          WHERE SUBASTA_ID = s.SUBASTA_ID
        ) AS OFERTA_ACTUAL
      FROM dbo.SUBASTAS2105 AS s
      JOIN dbo.VEHICULOS2105 AS v ON v.VEHICULO_ID = s.VEHICULO_ID
      JOIN dbo.MARCAS2105 AS m ON m.MARCA_ID = v.MARCA_ID
      JOIN dbo.MODELOS2105 AS mo ON mo.MODELO_ID = v.MODELO_ID
      JOIN dbo.TIPOS_ARTICULO2105 AS t ON t.TIPO_ARTICULO_ID = v.TIPO_ARTICULO_ID
      JOIN dbo.TRANSMISIONES2105 AS tr ON tr.TRANSMISION_ID = v.TRANSMISION_ID
      JOIN dbo.COMBUSTIBLES2105 AS c ON c.COMBUSTIBLE_ID = v.COMBUSTIBLE_ID
      JOIN dbo.TRACCIONES2105 AS tc ON tc.TRACCION_ID = v.TRACCION_ID
      JOIN dbo.NIVELES_DANO2105 AS nd ON nd.NIVEL_DANO_ID = v.NIVEL_DANO_ID
      WHERE s.SUBASTA_ID = @subastaId
    `, [{ name: 'subastaId', value: subastaId }]);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Subasta no encontrada.'
      });
    }

    const subasta = result.recordset[0];

    // Obtener la galería de fotos completa (mínimo 5 requeridas)
    const fotos = await query(`
      SELECT FOTO_ID, NOMBRE_ARCHIVO, TIPO_MIME, ORDEN
      FROM dbo.FOTOS_VEHICULO2105
      WHERE VEHICULO_ID = @vehiculoId
      ORDER BY ORDEN ASC
    `, [{ name: 'vehiculoId', value: subasta.VEHICULO_ID }]);

    // Calcular puja mínima siguiente
    let minimoSiguientePuja = subasta.PRECIO_BASE;
    if (subasta.OFERTA_ACTUAL !== null) {
      // Regla de negocio: mínimo 10% sobre la oferta actual
      minimoSiguientePuja = Math.ceil(Number(subasta.OFERTA_ACTUAL) * 1.10 * 100) / 100;
    }

    // Calcular estado del postor si está autenticado
    let badgeEstado = 'SIN_OFERTA';
    let usuarioEsGanador = false;
    let usuarioEsPublicador = false;

    if (req.user) {
      usuarioEsPublicador = (req.user.id === subasta.PUBLICADOR_USUARIO_ID);

      const topBid = await query(`
        SELECT TOP 1 USUARIO_ID, MONTO 
        FROM dbo.PUJAS2105 
        WHERE SUBASTA_ID = @subastaId 
        ORDER BY MONTO DESC, PUJA_ID DESC
      `, [{ name: 'subastaId', value: subastaId }]);

      if (topBid.recordset.length > 0) {
        if (topBid.recordset[0].USUARIO_ID === req.user.id) {
          usuarioEsGanador = true;
          badgeEstado = 'GANANDO';
        } else {
          // Verificar si el usuario ha realizado alguna puja previa en esta subasta
          const userBids = await query(`
            SELECT TOP 1 PUJA_ID 
            FROM dbo.PUJAS2105 
            WHERE SUBASTA_ID = @subastaId AND USUARIO_ID = @userId
          `, [
            { name: 'subastaId', value: subastaId },
            { name: 'userId', value: req.user.id }
          ]);
          if (userBids.recordset.length > 0) {
            badgeEstado = 'SUPERADO';
          }
        }
      }
    }

    const ahora = new Date();
    const fin = new Date(subasta.FIN_UTC);
    const segundosRestantes = Math.max(0, Math.floor((fin - ahora) / 1000));
    const estaCerrada = (subasta.ESTADO === 'CERRADA' || segundosRestantes === 0);

    return res.status(200).json({
      status: 'success',
      data: {
        ...subasta,
        fotos: fotos.recordset,
        minimoSiguientePuja,
        segundosRestantes,
        estaCerrada,
        badgeEstado,
        usuarioEsGanador,
        usuarioEsPublicador
      }
    });
  } catch (err) {
    console.error('Error al obtener detalle de subasta:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al consultar la subasta: ' + err.message
    });
  }
}

async function getSubastaLive(req, res) {
  try {
    const subastaId = parseInt(req.params.id, 10);
    if (isNaN(subastaId)) {
      return res.status(400).json({ status: 'error', message: 'ID de subasta inválido.' });
    }

    await verificarCierreSubasta(subastaId);

    const result = await query(`
      SELECT 
        s.SUBASTA_ID,
        s.PRECIO_BASE,
        s.INICIO_UTC,
        s.FIN_UTC,
        s.ESTADO,
        s.RESULTADO,
        (SELECT COUNT(*) FROM dbo.PUJAS2105 WHERE SUBASTA_ID = s.SUBASTA_ID) AS TOTAL_PUJAS,
        (SELECT MAX(MONTO) FROM dbo.PUJAS2105 WHERE SUBASTA_ID = s.SUBASTA_ID) AS OFERTA_ACTUAL,
        (SELECT TOP 1 USUARIO_ID FROM dbo.PUJAS2105 WHERE SUBASTA_ID = s.SUBASTA_ID ORDER BY MONTO DESC, PUJA_ID DESC) AS GANADOR_ACTUAL_ID,
        (SELECT TOP 1 EVENTO_ID FROM dbo.EVENTOS_SUBASTA2105 WHERE SUBASTA_ID = s.SUBASTA_ID ORDER BY EVENTO_ID DESC) AS ULTIMO_EVENTO_ID
      FROM dbo.SUBASTAS2105 AS s
      WHERE s.SUBASTA_ID = @subastaId
    `, [{ name: 'subastaId', value: subastaId }]);

    if (result.recordset.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Subasta no encontrada.' });
    }

    const sub = result.recordset[0];
    const ahora = new Date();
    const fin = new Date(sub.FIN_UTC);
    const segundosRestantes = Math.max(0, Math.floor((fin - ahora) / 1000));
    const estaCerrada = (sub.ESTADO === 'CERRADA' || segundosRestantes === 0);

    let badgeEstado = 'SIN_OFERTA';
    let usuarioEsGanador = false;

    if (req.user) {
      if (sub.GANADOR_ACTUAL_ID === req.user.id) {
        usuarioEsGanador = true;
        badgeEstado = 'GANANDO';
      } else if (sub.TOTAL_PUJAS > 0) {
        const userBids = await query(`
          SELECT TOP 1 PUJA_ID 
          FROM dbo.PUJAS2105 
          WHERE SUBASTA_ID = @subastaId AND USUARIO_ID = @userId
        `, [
          { name: 'subastaId', value: subastaId },
          { name: 'userId', value: req.user.id }
        ]);
        if (userBids.recordset.length > 0) {
          badgeEstado = 'SUPERADO';
        }
      }
    }

    let minimoSiguientePuja = sub.PRECIO_BASE;
    if (sub.OFERTA_ACTUAL !== null) {
      minimoSiguientePuja = Math.ceil(Number(sub.OFERTA_ACTUAL) * 1.10 * 100) / 100;
    }

    return res.status(200).json({
      status: 'success',
      data: {
        subastaId: sub.SUBASTA_ID,
        estado: sub.ESTADO,
        resultado: sub.RESULTADO,
        precioBase: sub.PRECIO_BASE,
        ofertaActual: sub.OFERTA_ACTUAL,
        totalPujas: sub.TOTAL_PUJAS,
        minimoSiguientePuja,
        segundosRestantes,
        estaCerrada,
        badgeEstado,
        usuarioEsGanador,
        ultimoEventoId: sub.ULTIMO_EVENTO_ID
      }
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  getSubastas,
  getSubastaPorId,
  getSubastaLive
};
