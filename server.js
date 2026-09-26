require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger/swagger.json');
const apiRoutes = require('./routes/apiRoutes');
const { ensureDbConnected } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));

// Documentación Swagger / OpenAPI 3.0 en /api-docs y /swagger
const swaggerOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info { margin: 20px 0; }
    .swagger-ui .info .title { color: #1e3a8a; font-family: system-ui, sans-serif; }
    .swagger-ui .btn.authorize { background-color: #2563eb; color: #fff; border-color: #2563eb; }
  `,
  customSiteTitle: 'Swagger - Subastas Copart API',
  customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css',
  customJs: [
    'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.min.js'
  ]
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerOptions));
app.get('/swagger', (req, res) => res.redirect('/api-docs'));
app.get('/api/swagger.json', (req, res) => res.json(swaggerDocument));

// Rutas de la API REST
app.use('/api', apiRoutes);

// Ruta de diagnóstico / Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Servicio de Subastas Copart operativo.',
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL ? 'vercel-serverless' : 'local'
  });
});

// Fallback SPA: redirigir rutas no encontradas a index.html
app.use((req, res) => {
  // Si no es una ruta de api o docs, servir index.html
  if (!req.path.startsWith('/api') && !req.path.startsWith('/api-docs') && !req.path.startsWith('/swagger')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ status: 'error', message: 'Ruta no encontrada' });
  }
});

// Manejador global de errores
app.use((err, req, res, next) => {
  console.error('Error no controlado en la aplicación:', err);
  res.status(500).json({
    status: 'error',
    message: 'Error interno en el servidor: ' + (err.message || 'Error desconocido')
  });
});

// Inicialización de servidor local (solo cuando no corre en serverless Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, async () => {
    console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}: http://localhost:${PORT}`);
    console.log(`📄 Documentación Swagger disponible en: http://localhost:${PORT}/api-docs`);
    try {
      await ensureDbConnected();
    } catch (e) {
      console.warn('Conexión inicial a DB diferida:', e.message);
    }
  });
}

module.exports = app;
