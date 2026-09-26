const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { getJwtSecret } = require('../middleware/authMiddleware');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function registro(req, res) {
  try {
    const { nombre, apellido, correo, telefono, contrasena } = req.body;

    // Validaciones sintácticas
    if (!nombre || !apellido || !correo || !telefono || !contrasena) {
      return res.status(400).json({
        status: 'error',
        message: 'Todos los campos son obligatorios: nombre, apellido, correo, telefono y contrasena.'
      });
    }

    const trimmedNombre = nombre.trim();
    const trimmedApellido = apellido.trim();
    const trimmedCorreo = correo.trim().toLowerCase();
    const trimmedTelefono = telefono.trim();

    if (trimmedNombre.length < 2 || trimmedApellido.length < 2) {
      return res.status(400).json({
        status: 'error',
        message: 'El nombre y apellido deben tener al menos 2 caracteres.'
      });
    }

    if (!emailRegex.test(trimmedCorreo)) {
      return res.status(400).json({
        status: 'error',
        message: 'El correo electrónico no tiene un formato válido.'
      });
    }

    if (contrasena.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'La contraseña debe contener un mínimo de 6 caracteres.'
      });
    }

    // Comprobar existencia previa de correo
    const existing = await query(
      'SELECT USUARIO_ID FROM dbo.USUARIOS2105 WHERE CORREO = @correo',
      [{ name: 'correo', value: trimmedCorreo }]
    );

    if (existing.recordset.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Ya existe una cuenta registrada con este correo electrónico.'
      });
    }

    // Hashear contraseña
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(contrasena, salt);

    const result = await query(`
      INSERT INTO dbo.USUARIOS2105 (
        NOMBRE, APELLIDO, CORREO, TELEFONO, CONTRASENA_HASH, ROL, ACTIVO, CREADO_UTC
      )
      OUTPUT INSERTED.USUARIO_ID, INSERTED.NOMBRE, INSERTED.APELLIDO, INSERTED.CORREO, INSERTED.TELEFONO, INSERTED.ROL
      VALUES (
        @nombre, @apellido, @correo, @telefono, @hash, 'USUARIO', 1, SYSUTCDATETIME()
      )
    `, [
      { name: 'nombre', value: trimmedNombre },
      { name: 'apellido', value: trimmedApellido },
      { name: 'correo', value: trimmedCorreo },
      { name: 'telefono', value: trimmedTelefono },
      { name: 'hash', value: hash }
    ]);

    const user = result.recordset[0];
    const token = jwt.sign(
      { id: user.USUARIO_ID, correo: user.CORREO, nombre: user.NOMBRE, rol: user.ROL },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      status: 'success',
      message: 'Usuario registrado exitosamente en la plataforma de subastas.',
      data: {
        token,
        usuario: {
          id: user.USUARIO_ID,
          nombre: user.NOMBRE,
          apellido: user.APELLIDO,
          correo: user.CORREO,
          telefono: user.TELEFONO,
          rol: user.ROL
        }
      }
    });
  } catch (err) {
    console.error('Error en registro:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error interno al registrar el usuario: ' + err.message
    });
  }
}

async function login(req, res) {
  try {
    const { correo, contrasena } = req.body;

    if (!correo || !contrasena) {
      return res.status(400).json({
        status: 'error',
        message: 'Debe ingresar correo y contraseña.'
      });
    }

    const trimmedCorreo = correo.trim().toLowerCase();

    const userResult = await query(`
      SELECT USUARIO_ID, NOMBRE, APELLIDO, CORREO, TELEFONO, CONTRASENA_HASH, ROL, ACTIVO
      FROM dbo.USUARIOS2105
      WHERE CORREO = @correo
    `, [{ name: 'correo', value: trimmedCorreo }]);

    if (userResult.recordset.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Credenciales inválidas. Verifique su correo y contraseña.'
      });
    }

    const user = userResult.recordset[0];

    if (!user.ACTIVO) {
      return res.status(403).json({
        status: 'error',
        message: 'Esta cuenta de usuario se encuentra inactiva o suspendida.'
      });
    }

    const validPass = await bcrypt.compare(contrasena, user.CONTRASENA_HASH);
    if (!validPass) {
      return res.status(400).json({
        status: 'error',
        message: 'Credenciales inválidas. Verifique su correo y contraseña.'
      });
    }

    const token = jwt.sign(
      { id: user.USUARIO_ID, correo: user.CORREO, nombre: user.NOMBRE, rol: user.ROL },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      status: 'success',
      message: 'Inicio de sesión exitoso.',
      data: {
        token,
        usuario: {
          id: user.USUARIO_ID,
          nombre: user.NOMBRE,
          apellido: user.APELLIDO,
          correo: user.CORREO,
          telefono: user.TELEFONO,
          rol: user.ROL
        }
      }
    });
  } catch (err) {
    console.error('Error en login:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error interno en autenticación: ' + err.message
    });
  }
}

async function perfil(req, res) {
  try {
    const result = await query(`
      SELECT USUARIO_ID, NOMBRE, APELLIDO, CORREO, TELEFONO, ROL, ACTIVO, CREADO_UTC
      FROM dbo.USUARIOS2105
      WHERE USUARIO_ID = @id
    `, [{ name: 'id', value: req.user.id }]);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Usuario no encontrado.'
      });
    }

    const user = result.recordset[0];
    return res.status(200).json({
      status: 'success',
      data: {
        id: user.USUARIO_ID,
        nombre: user.NOMBRE,
        apellido: user.APELLIDO,
        correo: user.CORREO,
        telefono: user.TELEFONO,
        rol: user.ROL,
        creadoUtc: user.CREADO_UTC
      }
    });
  } catch (err) {
    console.error('Error en perfil:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al consultar perfil: ' + err.message
    });
  }
}

async function usuariosPrueba(req, res) {
  try {
    return res.status(200).json({
      status: 'success',
      message: 'Cuentas pre-creadas para pruebas cruzadas del examen.',
      data: [
        { correo: 'comprador1@copart.com', contrasena: 'Password123!', nombre: 'Carlos Méndez (Comprador 1)' },
        { correo: 'comprador2@copart.com', contrasena: 'Password123!', nombre: 'Ana Morales (Comprador 2)' },
        { correo: 'publicador@copart.com', contrasena: 'Password123!', nombre: 'Sebastián Rosales (Publicador)' }
      ]
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  registro,
  login,
  perfil,
  usuariosPrueba
};
