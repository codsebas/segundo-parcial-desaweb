require('dotenv').config();
const bcrypt = require('bcryptjs');
const zlib = require('zlib');
const { query, executeProc, sql } = require('./config/db');

// Helper para generar PNGs válidos
function createSolidColorPng(width = 400, height = 300, r = 30, g = 144, b = 255) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  const ihdrChunk = createPngChunk('IHDR', ihdr);

  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      const isBorder = (x < 6 || x > width - 7 || y < 6 || y > height - 7);
      rawData[pixelOffset] = isBorder ? 220 : Math.min(255, r + (x % 40));
      rawData[pixelOffset + 1] = isBorder ? 220 : Math.min(255, g + (y % 40));
      rawData[pixelOffset + 2] = isBorder ? 220 : Math.min(255, b);
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createPngChunk('IDAT', compressedData);
  const iendChunk = createPngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ 0xffffffff;
}

function createPngChunk(type, data) {
  const length = data.length;
  const buffer = Buffer.alloc(12 + length);
  buffer.writeUInt32BE(length, 0);
  buffer.write(type, 4, 4, 'ascii');
  data.copy(buffer, 8);
  const crc = crc32(buffer.subarray(4, 8 + length));
  buffer.writeInt32BE(crc, 8 + length);
  return buffer;
}

async function seed() {
  console.log('🌱 Iniciando proceso de siembra (Seeding) de catálogos y datos...');

  // 1. Tipos de Artículo
  const tipos = ['Sedán', 'SUV', 'Pickup', 'Hatchback', 'Cupé', 'Crossover'];
  for (const tipo of tipos) {
    await query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.TIPOS_ARTICULO2105 WHERE NOMBRE = @nombre)
      INSERT INTO dbo.TIPOS_ARTICULO2105 (NOMBRE) VALUES (@nombre)
    `, [{ name: 'nombre', value: tipo }]);
  }
  console.log('✅ Catálogo TIPOS_ARTICULO2105 verificado.');

  // 2. Transmisiones
  const transmisiones = ['Automática', 'Mecánica', 'Secuencial', 'CVT'];
  for (const trans of transmisiones) {
    await query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.TRANSMISIONES2105 WHERE NOMBRE = @nombre)
      INSERT INTO dbo.TRANSMISIONES2105 (NOMBRE) VALUES (@nombre)
    `, [{ name: 'nombre', value: trans }]);
  }
  console.log('✅ Catálogo TRANSMISIONES2105 verificado.');

  // 3. Combustibles
  const combustibles = ['Gasolina', 'Diésel', 'Híbrido', 'Eléctrico'];
  for (const comb of combustibles) {
    await query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.COMBUSTIBLES2105 WHERE NOMBRE = @nombre)
      INSERT INTO dbo.COMBUSTIBLES2105 (NOMBRE) VALUES (@nombre)
    `, [{ name: 'nombre', value: comb }]);
  }
  console.log('✅ Catálogo COMBUSTIBLES2105 verificado.');

  // 4. Marcas y Modelos
  const marcasModelos = [
    { marca: 'Toyota', modelos: ['Corolla', 'Yaris', 'RAV4', 'Hilux', 'Tacoma', '4Runner', 'Camry'] },
    { marca: 'Honda', modelos: ['Civic', 'CR-V', 'Accord', 'HR-V', 'Pilot'] },
    { marca: 'Ford', modelos: ['F-150', 'Mustang', 'Explorer', 'Ranger', 'Bronco'] },
    { marca: 'Chevrolet', modelos: ['Silverado', 'Tahoe', 'Colorado', 'Camaro', 'Equinox'] },
    { marca: 'Nissan', modelos: ['Versa', 'Sentra', 'Frontier', 'Kicks', 'Rogue'] },
    { marca: 'BMW', modelos: ['Serie 3', 'Serie 5', 'X3', 'X5', 'M3'] },
    { marca: 'Mazda', modelos: ['Mazda 3', 'CX-5', 'CX-30', 'Mazda 6'] },
    { marca: 'Hyundai', modelos: ['Tucson', 'Elantra', 'Santa Fe', 'Kona'] }
  ];

  for (const item of marcasModelos) {
    const resMarca = await query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.MARCAS2105 WHERE NOMBRE = @nombre)
        INSERT INTO dbo.MARCAS2105 (NOMBRE) VALUES (@nombre);
      SELECT MARCA_ID FROM dbo.MARCAS2105 WHERE NOMBRE = @nombre;
    `, [{ name: 'nombre', value: item.marca }]);

    const marcaId = resMarca.recordset[0].MARCA_ID;

    for (const mod of item.modelos) {
      await query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.MODELOS2105 WHERE MARCA_ID = @marcaId AND NOMBRE = @nombre)
          INSERT INTO dbo.MODELOS2105 (MARCA_ID, NOMBRE) VALUES (@marcaId, @nombre);
      `, [
        { name: 'marcaId', value: marcaId },
        { name: 'nombre', value: mod }
      ]);
    }
  }
  console.log('✅ Catálogos MARCAS2105 y MODELOS2105 verificados.');

  // 5. 3 Usuarios de Prueba Requeridos por Rúbrica
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('Password123!', salt);

  const usuariosPrueba = [
    { nombre: 'Carlos', apellido: 'Méndez', correo: 'comprador1@copart.com', telefono: '50255551111', rol: 'USUARIO' },
    { nombre: 'Ana', apellido: 'Morales', correo: 'comprador2@copart.com', telefono: '50255552222', rol: 'USUARIO' },
    { nombre: 'Sebastián', apellido: 'Rosales', correo: 'publicador@copart.com', telefono: '50255553333', rol: 'USUARIO' }
  ];

  const userIds = {};
  for (const u of usuariosPrueba) {
    const r = await query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.USUARIOS2105 WHERE CORREO = @correo)
        INSERT INTO dbo.USUARIOS2105 (NOMBRE, APELLIDO, CORREO, TELEFONO, CONTRASENA_HASH, ROL, ACTIVO)
        VALUES (@nombre, @apellido, @correo, @telefono, @pass, @rol, 1);
      SELECT USUARIO_ID FROM dbo.USUARIOS2105 WHERE CORREO = @correo;
    `, [
      { name: 'nombre', value: u.nombre },
      { name: 'apellido', value: u.apellido },
      { name: 'correo', value: u.correo },
      { name: 'telefono', value: u.telefono },
      { name: 'pass', value: passwordHash },
      { name: 'rol', value: u.rol }
    ]);
    userIds[u.correo] = r.recordset[0].USUARIO_ID;
  }
  console.log('✅ 3 Usuarios de prueba sembrados:', userIds);

  // 6. Vehículos de muestra con subastas activas
  const countVehiculos = await query('SELECT COUNT(*) as c FROM dbo.VEHICULOS2105');
  if (countVehiculos.recordset[0].c === 0) {
    console.log('🚗 Sembrando vehículos y subastas activas de muestra...');
    const publicadorId = userIds['publicador@copart.com'];

    // Obtenemos IDs de catálogos necesarios
    const catData = await query(`
      SELECT 
        (SELECT TOP 1 TIPO_ARTICULO_ID FROM dbo.TIPOS_ARTICULO2105 WHERE NOMBRE = 'Pickup') AS tipoPickup,
        (SELECT TOP 1 TIPO_ARTICULO_ID FROM dbo.TIPOS_ARTICULO2105 WHERE NOMBRE = 'Sedán') AS tipoSedan,
        (SELECT TOP 1 TIPO_ARTICULO_ID FROM dbo.TIPOS_ARTICULO2105 WHERE NOMBRE = 'Cupé') AS tipoCupe,
        (SELECT TOP 1 MARCA_ID FROM dbo.MARCAS2105 WHERE NOMBRE = 'Toyota') AS marcaToyota,
        (SELECT TOP 1 MARCA_ID FROM dbo.MARCAS2105 WHERE NOMBRE = 'Honda') AS marcaHonda,
        (SELECT TOP 1 MARCA_ID FROM dbo.MARCAS2105 WHERE NOMBRE = 'Ford') AS marcaFord,
        (SELECT TOP 1 MODELO_ID FROM dbo.MODELOS2105 WHERE NOMBRE = 'Tacoma') AS modTacoma,
        (SELECT TOP 1 MODELO_ID FROM dbo.MODELOS2105 WHERE NOMBRE = 'Civic') AS modCivic,
        (SELECT TOP 1 MODELO_ID FROM dbo.MODELOS2105 WHERE NOMBRE = 'Mustang') AS modMustang,
        (SELECT TOP 1 TRANSMISION_ID FROM dbo.TRANSMISIONES2105 WHERE NOMBRE = 'Automática') AS transAuto,
        (SELECT TOP 1 TRANSMISION_ID FROM dbo.TRANSMISIONES2105 WHERE NOMBRE = 'Mecánica') AS transMec,
        (SELECT TOP 1 COMBUSTIBLE_ID FROM dbo.COMBUSTIBLES2105 WHERE NOMBRE = 'Gasolina') AS combGas,
        (SELECT TOP 1 TRACCION_ID FROM dbo.TRACCIONES2105 WHERE CODIGO = '4WD') AS trac4WD,
        (SELECT TOP 1 TRACCION_ID FROM dbo.TRACCIONES2105 WHERE CODIGO = 'FWD') AS tracFWD,
        (SELECT TOP 1 TRACCION_ID FROM dbo.TRACCIONES2105 WHERE CODIGO = 'RWD') AS tracRWD,
        (SELECT TOP 1 NIVEL_DANO_ID FROM dbo.NIVELES_DANO2105 WHERE CODIGO = 'VERDE') AS danoVerde,
        (SELECT TOP 1 NIVEL_DANO_ID FROM dbo.NIVELES_DANO2105 WHERE CODIGO = 'AMARILLO') AS danoAmarillo,
        (SELECT TOP 1 NIVEL_DANO_ID FROM dbo.NIVELES_DANO2105 WHERE CODIGO = 'ROJO') AS danoRojo
    `);
    const c = catData.recordset[0];

    const autosDemo = [
      {
        anio: 2022,
        tipoId: c.tipoPickup,
        marcaId: c.marcaToyota,
        modeloId: c.modTacoma,
        motor: '3.5L V6 DOHC',
        transmisionId: c.transAuto,
        combustibleId: c.combGas,
        traccionId: c.trac4WD,
        cilindros: 6,
        danoId: c.danoVerde,
        precioBase: 75000.00,
        nombre: 'Toyota Tacoma TRD Pro 2022'
      },
      {
        anio: 2021,
        tipoId: c.tipoSedan,
        marcaId: c.marcaHonda,
        modeloId: c.modCivic,
        motor: '1.5L Turbo 4-Cil',
        transmisionId: c.transAuto,
        combustibleId: c.combGas,
        traccionId: c.tracFWD,
        cilindros: 4,
        danoId: c.danoAmarillo,
        precioBase: 35000.00,
        nombre: 'Honda Civic Sport Touring 2021'
      },
      {
        anio: 2020,
        tipoId: c.tipoCupe,
        marcaId: c.marcaFord,
        modeloId: c.modMustang,
        motor: '5.0L V8 Coyote',
        transmisionId: c.transMec,
        combustibleId: c.combGas,
        traccionId: c.tracRWD,
        cilindros: 8,
        danoId: c.danoRojo,
        precioBase: 45000.00,
        nombre: 'Ford Mustang GT Fastback 2020'
      }
    ];

    for (let idx = 0; idx < autosDemo.length; idx++) {
      const auto = autosDemo[idx];
      // 1. Insertar Vehículo
      const rVeh = await query(`
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
        );
      `, [
        { name: 'publicador', value: publicadorId },
        { name: 'anio', value: auto.anio },
        { name: 'tipo', value: auto.tipoId },
        { name: 'marca', value: auto.marcaId },
        { name: 'modelo', value: auto.modeloId },
        { name: 'motor', value: auto.motor },
        { name: 'trans', value: auto.transmisionId },
        { name: 'comb', value: auto.combustibleId },
        { name: 'trac', value: auto.traccionId },
        { name: 'cil', value: auto.cilindros },
        { name: 'dano', value: auto.danoId }
      ]);
      const vehiculoId = rVeh.recordset[0].VEHICULO_ID;

      // 2. Insertar 5 fotos obligatorias por vehículo con fotos reales
      const realPhotoSets = [
        [
          'https://images.unsplash.com/photo-1559416523-140ddc3d238c?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&auto=format&fit=crop&q=80'
        ],
        [
          'https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=800&auto=format&fit=crop&q=80'
        ],
        [
          'https://images.unsplash.com/photo-1584345604476-8ec5e12e42dd?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=800&auto=format&fit=crop&q=80'
        ]
      ];

      const urls = realPhotoSets[idx] || [];
      for (let f = 1; f <= 5; f++) {
        let imgBuf;
        let mimeType = 'image/jpeg';
        let fileName = `foto_${auto.anio}_${f}.jpg`;

        if (urls[f - 1]) {
          try {
            const resImg = await fetch(urls[f - 1]);
            const ab = await resImg.arrayBuffer();
            imgBuf = Buffer.from(ab);
          } catch (e) {
            console.warn(`  (Fallback para foto ${f}: ${e.message})`);
          }
        }

        if (!imgBuf) {
          mimeType = 'image/png';
          fileName = `foto_${auto.anio}_${f}.png`;
          imgBuf = createSolidColorPng(500, 360, 40, 100, 200);
        }

        await query(`
          INSERT INTO dbo.FOTOS_VEHICULO2105 (VEHICULO_ID, NOMBRE_ARCHIVO, TIPO_MIME, IMAGEN, ORDEN)
          VALUES (@vehiculoId, @nombre, @mime, @imagen, @orden)
        `, [
          { name: 'vehiculoId', value: vehiculoId },
          { name: 'nombre', value: fileName },
          { name: 'mime', value: mimeType },
          { name: 'imagen', type: sql.VarBinary(sql.MAX), value: imgBuf },
          { name: 'orden', value: f }
        ]);
      }

      // 3. Crear Subasta
      const ahora = new Date();
      const inicio = new Date(ahora.getTime() - 60 * 60 * 1000); // Empezó hace 1 hora
      const fin = new Date(ahora.getTime() + 72 * 60 * 60 * 1000); // Termina en 3 días

      const rSub = await query(`
        INSERT INTO dbo.SUBASTAS2105 (
          VEHICULO_ID, PRECIO_BASE, INICIO_UTC, FIN_UTC, ESTADO, CREADO_UTC
        )
        OUTPUT INSERTED.SUBASTA_ID
        VALUES (
          @vehiculoId, @precioBase, @inicio, @fin, 'BORRADOR', SYSUTCDATETIME()
        )
      `, [
        { name: 'vehiculoId', value: vehiculoId },
        { name: 'precioBase', value: auto.precioBase },
        { name: 'inicio', value: inicio },
        { name: 'fin', value: fin }
      ]);
      const subastaId = rSub.recordset[0].SUBASTA_ID;

      // 4. Publicar la subasta mediante el Stored Procedure
      await executeProc('dbo.PUBLICAR_SUBASTA2105', [
        { name: 'SUBASTA_ID', value: subastaId },
        { name: 'PUBLICADOR_USUARIO_ID', value: publicadorId }
      ]);

      console.log(` -> Subasta #${subastaId} publicada para vehículo #${vehiculoId} (${auto.nombre})`);
    }
  }

  console.log('\n🎉 Proceso de siembra finalizado exitosamente.');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Error en seed:', err);
  process.exit(1);
});
