const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const catalogosController = require('../controllers/catalogosController');
const vehiculosController = require('../controllers/vehiculosController');
const subastasController = require('../controllers/subastasController');
const pujasController = require('../controllers/pujasController');

const { authRequired, optionalAuth } = require('../middleware/authMiddleware');

// Rutas de Autenticación
router.post('/auth/registro', authController.registro);
router.post('/auth/login', authController.login);
router.get('/auth/perfil', authRequired, authController.perfil);
router.get('/auth/usuarios-prueba', authController.usuariosPrueba);

// Rutas de Catálogos
router.get('/catalogos', catalogosController.getTodosCatalogos);
router.get('/catalogos/modelos/:marcaId', catalogosController.getModelosPorMarca);

// Rutas de Vehículos
router.post('/vehiculos', authRequired, vehiculosController.crearVehiculo);
router.get('/vehiculos/mis-vehiculos', authRequired, vehiculosController.getMisVehiculos);
router.put('/vehiculos/:id', authRequired, vehiculosController.editarVehiculo);
router.get('/vehiculos/:id/fotos/:fotoId', vehiculosController.getFoto);
router.get('/fotos/:fotoId', vehiculosController.getFoto);

// Rutas de Subastas
router.get('/subastas', subastasController.getSubastas);
router.get('/subastas/:id', optionalAuth, subastasController.getSubastaPorId);
router.get('/subastas/:id/live', optionalAuth, subastasController.getSubastaLive);

// Rutas de Pujas y Notificaciones
router.post('/subastas/:id/pujas', authRequired, pujasController.registrarPuja);
router.get('/subastas/:id/pujas', pujasController.getHistorialPujas);
router.get('/notificaciones', authRequired, pujasController.getMisNotificaciones);

module.exports = router;
