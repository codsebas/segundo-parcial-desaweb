require('dotenv').config();
const { query, sql } = require('./config/db');

const photoSets = {
  // Vehículo 1: Toyota Tacoma 2022
  1: [
    'https://images.unsplash.com/photo-1559416523-140ddc3d238c?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&auto=format&fit=crop&q=80'
  ],
  // Vehículo 2: Honda Civic 2021
  2: [
    'https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=800&auto=format&fit=crop&q=80'
  ],
  // Vehículo 3: Ford Mustang 2020
  3: [
    'https://images.unsplash.com/photo-1584345604476-8ec5e12e42dd?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=800&auto=format&fit=crop&q=80'
  ]
};

async function updateRealPhotos() {
  console.log('📸 Descargando e insertando fotografías reales de vehículos...');

  for (const [vehiculoIdStr, urls] of Object.entries(photoSets)) {
    const vehiculoId = parseInt(vehiculoIdStr, 10);

    const exists = await query('SELECT VEHICULO_ID FROM dbo.VEHICULOS2105 WHERE VEHICULO_ID = @id', [{ name: 'id', value: vehiculoId }]);
    if (exists.recordset.length === 0) continue;

    console.log(`\n🚗 Procesando Vehículo #${vehiculoId}...`);

    // Eliminar fotos antiguas para este vehículo
    await query('DELETE FROM dbo.FOTOS_VEHICULO2105 WHERE VEHICULO_ID = @id', [{ name: 'id', value: vehiculoId }]);

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const res = await fetch(url);
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      await query(`
        INSERT INTO dbo.FOTOS_VEHICULO2105 (VEHICULO_ID, NOMBRE_ARCHIVO, TIPO_MIME, IMAGEN, ORDEN, CREADO_UTC)
        VALUES (@vehiculoId, @nombre, 'image/jpeg', @img, @orden, SYSUTCDATETIME())
      `, [
        { name: 'vehiculoId', value: vehiculoId },
        { name: 'nombre', value: `real_vehiculo_${vehiculoId}_foto_${i + 1}.jpg` },
        { name: 'img', type: sql.VarBinary(sql.MAX), value: buffer },
        { name: 'orden', value: i + 1 }
      ]);

      console.log(`  -> Foto #${i + 1} insertada (${buffer.length} bytes)`);
    }
  }

  console.log('\n🎉 ¡Todas las fotografías reales fueron actualizadas exitosamente en SQL Server!');
  process.exit(0);
}

updateRealPhotos().catch(err => {
  console.error('Error actualizando fotos:', err);
  process.exit(1);
});
