const { query } = require('../config/db');

async function getTodosCatalogos(req, res) {
  try {
    const tipos = await query('SELECT TIPO_ARTICULO_ID, NOMBRE FROM dbo.TIPOS_ARTICULO2105 ORDER BY NOMBRE');
    const marcas = await query('SELECT MARCA_ID, NOMBRE FROM dbo.MARCAS2105 ORDER BY NOMBRE');
    const modelos = await query('SELECT MODELO_ID, MARCA_ID, NOMBRE FROM dbo.MODELOS2105 ORDER BY NOMBRE');
    const transmisiones = await query('SELECT TRANSMISION_ID, NOMBRE FROM dbo.TRANSMISIONES2105 ORDER BY NOMBRE');
    const combustibles = await query('SELECT COMBUSTIBLE_ID, NOMBRE FROM dbo.COMBUSTIBLES2105 ORDER BY NOMBRE');
    const tracciones = await query('SELECT TRACCION_ID, CODIGO FROM dbo.TRACCIONES2105 ORDER BY CODIGO');
    const nivelesDano = await query('SELECT NIVEL_DANO_ID, CODIGO, DESCRIPCION FROM dbo.NIVELES_DANO2105 ORDER BY NIVEL_DANO_ID');

    return res.status(200).json({
      status: 'success',
      data: {
        tipos: tipos.recordset,
        marcas: marcas.recordset,
        modelos: modelos.recordset,
        transmisiones: transmisiones.recordset,
        combustibles: combustibles.recordset,
        tracciones: tracciones.recordset,
        nivelesDano: nivelesDano.recordset
      }
    });
  } catch (err) {
    console.error('Error al obtener catálogos:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al consultar catálogos del sistema: ' + err.message
    });
  }
}

async function getModelosPorMarca(req, res) {
  try {
    const { marcaId } = req.params;
    const result = await query(
      'SELECT MODELO_ID, MARCA_ID, NOMBRE FROM dbo.MODELOS2105 WHERE MARCA_ID = @marcaId ORDER BY NOMBRE',
      [{ name: 'marcaId', value: parseInt(marcaId, 10) }]
    );
    return res.status(200).json({
      status: 'success',
      data: result.recordset
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  getTodosCatalogos,
  getModelosPorMarca
};
