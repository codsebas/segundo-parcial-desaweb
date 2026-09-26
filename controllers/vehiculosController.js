const { query, executeProc, sql } = require('../config/db');

async function crearVehiculo(req, res) {
  try {
    const publicadorId = req.user.id;
    const {
      anio,
      tipoArticuloId,
      marcaId,
      modeloId,
      motor,
      transmisionId,
      combustibleId,
      traccionId,
      numeroCilindros,
      nivelDanoId,
      precioBase,
      inicioUtc,
      finUtc,
      fotos // Array de objetos: [{ nombreArchivo, tipoMime, base64 }]
    } = req.body;

    // 1. Validaciones de Ficha Técnica
    if (!anio || !tipoArticuloId || !marcaId || !modeloId || !motor ||
        !transmisionId || !combustibleId || !traccionId || !numeroCilindros || !nivelDanoId) {
      return res.status(400).json({
        status: 'error',
        message: 'Todos los campos de la ficha técnica son obligatorios.'
      });
    }

    const nAnio = parseInt(anio, 10);
    const nCilindros = parseInt(numeroCilindros, 10);
    const nPrecioBase = parseFloat(precioBase);

    if (isNaN(nAnio) || nAnio < 1900 || nAnio > 2030) {
      return res.status(400).json({
        status: 'error',
        message: 'El año del vehículo debe ser válido (entre 1900 y 2030).'
      });
    }

    if (isNaN(nCilindros) || nCilindros <= 0 || nCilindros > 24) {
      return res.status(400).json({
        status: 'error',
        message: 'El número de cilindros debe ser entre 1 y 24.'
      });
    }

    if (isNaN(nPrecioBase) || nPrecioBase < 20000) {
      return res.status(400).json({
        status: 'error',
        message: 'El precio base de la subasta debe ser de al menos Q. 20,000.00 según la regla de negocio.'
      });
    }

    // 2. Validación de Galería Fotográfica (Mínimo 5 fotos obligatorias por rúbrica)
    if (!fotos || !Array.isArray(fotos) || fotos.length < 5) {
      return res.status(400).json({
        status: 'error',
        message: 'Se requieren obligatoriamente al menos 5 fotografías del vehículo para la subasta.'
      });
    }

    // Validación de tipos MIME
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    for (let i = 0; i < fotos.length; i++) {
      const f = fotos[i];
      if (!f.tipoMime || !allowedMimes.includes(f.tipoMime.toLowerCase())) {
        return res.status(400).json({
          status: 'error',
          message: `La foto #${i + 1} tiene un formato no admitido (${f.tipoMime}). Solo se permite image/jpeg, image/png o image/webp.`
        });
      }
      if (!f.base64) {
        return res.status(400).json({
          status: 'error',
          message: `La foto #${i + 1} no incluye contenido de imagen en base64.`
        });
      }
    }

    // 3. Validación de Fechas de Subasta
    let dInicio = inicioUtc ? new Date(inicioUtc) : new Date();
    let dFin = finUtc ? new Date(finUtc) : new Date(Date.now() + 72 * 60 * 60 * 1000);

    if (isNaN(dInicio.getTime()) || isNaN(dFin.getTime())) {
      return res.status(400).json({
        status: 'error',
        message: 'Las fechas de inicio y fin de la subasta deben ser fechas válidas.'
      });
    }

    if (dInicio >= dFin) {
      return res.status(400).json({
        status: 'error',
        message: 'La fecha y hora de inicio debe ser anterior a la fecha y hora de cierre.'
      });
    }

    // 4. Verificación de existencia de catálogos (Integridad Referencial para evitar errores de BD)
    const checkRefs = await query(`
      SELECT 
        (SELECT COUNT(*) FROM dbo.MARCAS2105 WHERE MARCA_ID = @marcaId) AS hasMarca,
        (SELECT COUNT(*) FROM dbo.MODELOS2105 WHERE MODELO_ID = @modeloId AND MARCA_ID = @marcaId) AS hasModelo,
        (SELECT COUNT(*) FROM dbo.TIPOS_ARTICULO2105 WHERE TIPO_ARTICULO_ID = @tipoId) AS hasTipo,
        (SELECT COUNT(*) FROM dbo.TRANSMISIONES2105 WHERE TRANSMISION_ID = @transId) AS hasTrans,
        (SELECT COUNT(*) FROM dbo.COMBUSTIBLES2105 WHERE COMBUSTIBLE_ID = @combId) AS hasComb,
        (SELECT COUNT(*) FROM dbo.TRACCIONES2105 WHERE TRACCION_ID = @tracId) AS hasTrac,
        (SELECT COUNT(*) FROM dbo.NIVELES_DANO2105 WHERE NIVEL_DANO_ID = @danoId) AS hasDano
    `, [
      { name: 'marcaId', value: marcaId },
      { name: 'modeloId', value: modeloId },
      { name: 'tipoId', value: tipoArticuloId },
      { name: 'transId', value: transmisionId },
      { name: 'combId', value: combustibleId },
      { name: 'tracId', value: traccionId },
      { name: 'danoId', value: nivelDanoId }
    ]);

    const refs = checkRefs.recordset[0];
    if (!refs.hasMarca || !refs.hasModelo || !refs.hasTipo || !refs.hasTrans || !refs.hasComb || !refs.hasTrac || !refs.hasDano) {
      return res.status(400).json({
        status: 'error',
        message: 'Uno o más identificadores de catálogo no existen o no concuerdan (Integridad relacional).'
      });
    }

    // 5. Inserción del Vehículo
    const resVeh = await query(`
      INSERT INTO dbo.VEHICULOS2105 (
        PUBLICADOR_USUARIO_ID, ANIO, TIPO_ARTICULO_ID, MARCA_ID, MODELO_ID,
        MOTOR, TRANSMISION_ID, COMBUSTIBLE_ID, TRACCION_ID, NUMERO_CILINDROS,
        NIVEL_DANO_ID, CREADO_UTC
      )
      OUTPUT INSERTED.VEHICULO_ID
      VALUES (
        @publicador, @anio, @tipo, @marca, @modelo,
        @motor, @trans, @comb, @trac, @cil,
        @dano, SYSUTCDATETIME()
      )
    `, [
      { name: 'publicador', value: publicadorId },
      { name: 'anio', value: nAnio },
      { name: 'tipo', value: tipoArticuloId },
      { name: 'marca', value: marcaId },
      { name: 'modelo', value: modeloId },
      { name: 'motor', value: motor.trim() },
      { name: 'trans', value: transmisionId },
      { name: 'comb', value: combustibleId },
      { name: 'trac', value: traccionId },
      { name: 'cil', value: nCilindros },
      { name: 'dano', value: nivelDanoId }
    ]);

    const vehiculoId = resVeh.recordset[0].VEHICULO_ID;

    // 6. Inserción de las Fotos en Paralelo (Mínimo 5 fotos obligatorias)
    await Promise.all(fotos.map((f, i) => {
      const cleanBase64 = (f.base64 || '').replace(/^data:[^;]+;base64,/, '');
      const imgBuffer = Buffer.from(cleanBase64, 'base64');
      const nombreArchivo = f.nombreArchivo ? f.nombreArchivo.trim() : `foto_${vehiculoId}_${i + 1}.png`;

      return query(`
        INSERT INTO dbo.FOTOS_VEHICULO2105 (
          VEHICULO_ID, NOMBRE_ARCHIVO, TIPO_MIME, IMAGEN, ORDEN, CREADO_UTC
        )
        VALUES (
          @vehiculoId, @nombre, @mime, @img, @orden, SYSUTCDATETIME()
        )
      `, [
        { name: 'vehiculoId', value: vehiculoId },
        { name: 'nombre', value: nombreArchivo },
        { name: 'mime', value: (f.tipoMime || 'image/png').toLowerCase() },
        { name: 'img', type: sql.VarBinary(sql.MAX), value: imgBuffer },
        { name: 'orden', value: i + 1 }
      ]);
    }));

    // 7. Inserción de la Subasta en borrador
    const resSub = await query(`
      INSERT INTO dbo.SUBASTAS2105 (
        VEHICULO_ID, PRECIO_BASE, INICIO_UTC, FIN_UTC, ESTADO, CREADO_UTC
      )
      OUTPUT INSERTED.SUBASTA_ID
      VALUES (
        @vehiculoId, @precioBase, @inicio, @fin, 'BORRADOR', SYSUTCDATETIME()
      )
    `, [
      { name: 'vehiculoId', value: vehiculoId },
      { name: 'precioBase', value: nPrecioBase },
      { name: 'inicio', value: dInicio },
      { name: 'fin', value: dFin }
    ]);

    const subastaId = resSub.recordset[0].SUBASTA_ID;

    // 8. Publicación inmediata de la subasta con el Stored Procedure
    await executeProc('dbo.PUBLICAR_SUBASTA2105', [
      { name: 'SUBASTA_ID', value: subastaId },
      { name: 'PUBLICADOR_USUARIO_ID', value: publicadorId }
    ]);

    return res.status(201).json({
      status: 'success',
      message: 'Vehículo registrado y subasta publicada exitosamente.',
      data: {
        vehiculoId,
        subastaId,
        precioBase: nPrecioBase,
        fotosRegistradas: fotos.length,
        estado: 'PUBLICADA'
      }
    });
  } catch (err) {
    console.error('Error al registrar vehículo y subasta:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error interno al registrar vehículo: ' + err.message
    });
  }
}

async function getMisVehiculos(req, res) {
  try {
    const publicadorId = req.user.id;
    const { search } = req.query;

    let searchClause = '';
    const params = [{ name: 'publicadorId', value: publicadorId }];

    if (search && search.trim().length > 0) {
      searchClause = `
        AND (
          m.NOMBRE LIKE @search OR
          mo.NOMBRE LIKE @search OR
          v.MOTOR LIKE @search OR
          CAST(v.ANIO AS VARCHAR) LIKE @search
        )
      `;
      params.push({ name: 'search', value: `%${search.trim()}%` });
    }

    const result = await query(`
      SELECT 
        v.VEHICULO_ID,
        v.ANIO,
        v.MOTOR,
        v.NUMERO_CILINDROS,
        v.CREADO_UTC,
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
        s.SUBASTA_ID,
        s.PRECIO_BASE,
        s.INICIO_UTC,
        s.FIN_UTC,
        s.ESTADO AS SUBASTA_ESTADO,
        s.RESULTADO AS SUBASTA_RESULTADO,
        (SELECT COUNT(*) FROM dbo.FOTOS_VEHICULO2105 WHERE VEHICULO_ID = v.VEHICULO_ID) AS TOTAL_FOTOS,
        (SELECT COUNT(*) FROM dbo.PUJAS2105 WHERE SUBASTA_ID = s.SUBASTA_ID) AS TOTAL_PUJAS,
        (SELECT MAX(MONTO) FROM dbo.PUJAS2105 WHERE SUBASTA_ID = s.SUBASTA_ID) AS OFERTA_MAXIMA
      FROM dbo.VEHICULOS2105 AS v
      JOIN dbo.MARCAS2105 AS m ON m.MARCA_ID = v.MARCA_ID
      JOIN dbo.MODELOS2105 AS mo ON mo.MODELO_ID = v.MODELO_ID
      JOIN dbo.TIPOS_ARTICULO2105 AS t ON t.TIPO_ARTICULO_ID = v.TIPO_ARTICULO_ID
      JOIN dbo.TRANSMISIONES2105 AS tr ON tr.TRANSMISION_ID = v.TRANSMISION_ID
      JOIN dbo.COMBUSTIBLES2105 AS c ON c.COMBUSTIBLE_ID = v.COMBUSTIBLE_ID
      JOIN dbo.TRACCIONES2105 AS tc ON tc.TRACCION_ID = v.TRACCION_ID
      JOIN dbo.NIVELES_DANO2105 AS nd ON nd.NIVEL_DANO_ID = v.NIVEL_DANO_ID
      LEFT JOIN dbo.SUBASTAS2105 AS s ON s.VEHICULO_ID = v.VEHICULO_ID
      WHERE v.PUBLICADOR_USUARIO_ID = @publicadorId
      ${searchClause}
      ORDER BY v.CREADO_UTC DESC
    `, params);

    return res.status(200).json({
      status: 'success',
      data: result.recordset
    });
  } catch (err) {
    console.error('Error al consultar publicaciones del usuario:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al consultar publicaciones: ' + err.message
    });
  }
}

async function editarVehiculo(req, res) {
  try {
    const publicadorId = req.user.id;
    const { id } = req.params;
    const {
      motor,
      numeroCilindros,
      transmisionId,
      combustibleId,
      traccionId,
      nivelDanoId
    } = req.body;

    // Verificar propiedad del vehículo
    const checkOwner = await query(`
      SELECT VEHICULO_ID, PUBLICADOR_USUARIO_ID
      FROM dbo.VEHICULOS2105
      WHERE VEHICULO_ID = @id
    `, [{ name: 'id', value: parseInt(id, 10) }]);

    if (checkOwner.recordset.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Vehículo no encontrado.'
      });
    }

    if (checkOwner.recordset[0].PUBLICADOR_USUARIO_ID !== publicadorId) {
      return res.status(403).json({
        status: 'error',
        message: 'No tiene permiso para editar este vehículo (solo el publicador original puede editarlo).'
      });
    }

    // Verificar si la subasta ya tiene ofertas registradas
    const checkSubasta = await query(`
      SELECT s.SUBASTA_ID, s.ESTADO,
        (SELECT COUNT(*) FROM dbo.PUJAS2105 WHERE SUBASTA_ID = s.SUBASTA_ID) AS TOTAL_PUJAS
      FROM dbo.SUBASTAS2105 AS s
      WHERE s.VEHICULO_ID = @id
    `, [{ name: 'id', value: parseInt(id, 10) }]);

    const subastaInfo = checkSubasta.recordset[0];
    const tienePujas = subastaInfo && subastaInfo.TOTAL_PUJAS > 0;

    // Si ya tiene ofertas, bloquear cambios críticos (estado de daño) para proteger a los postores
    if (tienePujas && nivelDanoId !== undefined && nivelDanoId !== null) {
      const currentDano = await query('SELECT NIVEL_DANO_ID FROM dbo.VEHICULOS2105 WHERE VEHICULO_ID = @id', [{ name: 'id', value: parseInt(id, 10) }]);
      if (currentDano.recordset.length > 0 && currentDano.recordset[0].NIVEL_DANO_ID !== parseInt(nivelDanoId, 10)) {
        return res.status(400).json({
          status: 'error',
          message: 'Integridad de subasta: No se puede modificar la clasificación de daño de un vehículo que ya tiene ofertas registradas.'
        });
      }
    }

    // Actualización de campos permitidos
    await query(`
      UPDATE dbo.VEHICULOS2105
      SET 
        MOTOR = COALESCE(@motor, MOTOR),
        NUMERO_CILINDROS = COALESCE(@cil, NUMERO_CILINDROS),
        TRANSMISION_ID = COALESCE(@trans, TRANSMISION_ID),
        COMBUSTIBLE_ID = COALESCE(@comb, COMBUSTIBLE_ID),
        TRACCION_ID = COALESCE(@trac, TRACCION_ID),
        NIVEL_DANO_ID = CASE WHEN @tienePujas = 1 THEN NIVEL_DANO_ID ELSE COALESCE(@dano, NIVEL_DANO_ID) END,
        ACTUALIZADO_UTC = SYSUTCDATETIME()
      WHERE VEHICULO_ID = @id
    `, [
      { name: 'id', value: parseInt(id, 10) },
      { name: 'motor', value: motor ? motor.trim() : null },
      { name: 'cil', value: numeroCilindros ? parseInt(numeroCilindros, 10) : null },
      { name: 'trans', value: transmisionId ? parseInt(transmisionId, 10) : null },
      { name: 'comb', value: combustibleId ? parseInt(combustibleId, 10) : null },
      { name: 'trac', value: traccionId ? parseInt(traccionId, 10) : null },
      { name: 'dano', value: nivelDanoId ? parseInt(nivelDanoId, 10) : null },
      { name: 'tienePujas', value: tienePujas ? 1 : 0 }
    ]);

    return res.status(200).json({
      status: 'success',
      message: 'Ficha técnica del vehículo actualizada exitosamente.'
    });
  } catch (err) {
    console.error('Error al editar vehículo:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al actualizar vehículo: ' + err.message
    });
  }
}

async function getFoto(req, res) {
  try {
    const { fotoId } = req.params;

    const result = await query(`
      SELECT TIPO_MIME, IMAGEN, NOMBRE_ARCHIVO
      FROM dbo.FOTOS_VEHICULO2105
      WHERE FOTO_ID = @fotoId
    `, [{ name: 'fotoId', value: parseInt(fotoId, 10) }]);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Fotografía no encontrada.'
      });
    }

    const { TIPO_MIME, IMAGEN, NOMBRE_ARCHIVO } = result.recordset[0];
    res.setHeader('Content-Type', TIPO_MIME || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Disposition', `inline; filename="${NOMBRE_ARCHIVO}"`);
    return res.send(IMAGEN);
  } catch (err) {
    console.error('Error al servir fotografía:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al obtener la imagen: ' + err.message
    });
  }
}

module.exports = {
  crearVehiculo,
  getMisVehiculos,
  editarVehiculo,
  getFoto
};
