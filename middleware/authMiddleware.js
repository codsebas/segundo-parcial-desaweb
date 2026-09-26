const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = (process.env.JWT_SECRET || '').trim().replace(/^["']|["']$/g, '');
  if (secret.length > 0) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    throw new Error('Seguridad crítica: JWT_SECRET no está definida en las variables de entorno.');
  }
  if (!global._devJwtSecret) {
    global._devJwtSecret = crypto.randomBytes(32).toString('hex');
  }
  return global._devJwtSecret;
}

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
    const decoded = jwt.verify(token, getJwtSecret());
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
      req.user = jwt.verify(token, getJwtSecret());
    } catch (_) {
      req.user = null;
    }
  }
  next();
}

module.exports = {
  authRequired,
  optionalAuth,
  getJwtSecret
};
