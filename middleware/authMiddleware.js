const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'CopartSubastasSecretKey2026_UMG_Parcial!';

function authRequired(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({
      status: 'error',
      message: 'Acceso no autorizado: Debe iniciar sesión para realizar esta acción.'
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      status: 'error',
      message: 'Formato de token de autenticación inválido (Bearer token esperado).'
    });
  }

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      status: 'error',
      message: 'Sesión expirada o token no válido. Por favor inicie sesión nuevamente.'
    });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (_) {
      req.user = null;
    }
  }
  next();
}

module.exports = {
  authRequired,
  optionalAuth,
  JWT_SECRET
};
