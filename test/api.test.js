const http = require('http');
const app = require('../server');

let server;
const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

let authToken = '';
let testSubastaId = null;

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return { status: response.status, data };
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 INICIANDO SUITE DE PRUEBAS AUTOMATIZADAS COPART');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASÓ: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FALLÓ: ${message}`);
      failed++;
    }
  }

  // Iniciar servidor temporal para pruebas
  await new Promise((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`[TEST] Servidor de prueba montado en puerto ${PORT}\n`);
      resolve();
    });
  });

  try {
    // -------------------------------------------------------------
    // PRUEBA 1: Consulta de Catálogos y Estado de la API (GETs)
    // -------------------------------------------------------------
    console.log('--- 1. Pruebas de Consulta de Catálogos y Salud ---');
    const health = await request('/api/health');
    assert(health.status === 200 && health.data.status === 'success', 'GET /api/health responde 200 OK');

    const cat = await request('/api/catalogos');
    assert(
      cat.status === 200 &&
      cat.data.data.marcas.length > 0 &&
      cat.data.data.tipos.length > 0,
      'GET /api/catalogos devuelve estructura completa con marcas y tipos'
    );

    // -------------------------------------------------------------
    // PRUEBA 2: Autenticación (Login con usuario de prueba y obtención de JWT)
    // -------------------------------------------------------------
    console.log('\n--- 2. Pruebas de Autenticación y Seguridad ---');
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        correo: 'comprador1@copart.com',
        contrasena: 'Password123!'
      })
    });
    assert(loginRes.status === 200 && loginRes.data.data.token, 'POST /api/auth/login autentica al usuario y devuelve token JWT');
    authToken = loginRes.data.data ? loginRes.data.data.token : '';

    const perfilRes = await request('/api/auth/perfil');
    assert(perfilRes.status === 200 && perfilRes.data.data.correo === 'comprador1@copart.com', 'GET /api/auth/perfil valida token JWT protegido');

    // -------------------------------------------------------------
    // PRUEBA 3: Consulta de Inventario y Detalle de Subasta
    // -------------------------------------------------------------
    console.log('\n--- 3. Pruebas de Inventario y Subastas Activas ---');
    const subastasRes = await request('/api/subastas');
    assert(
      subastasRes.status === 200 && Array.isArray(subastasRes.data.data) && subastasRes.data.data.length > 0,
      'GET /api/subastas devuelve catálogo con subastas activas'
    );

    if (subastasRes.data.data.length > 0) {
      testSubastaId = subastasRes.data.data[0].SUBASTA_ID;
      const detalleRes = await request(`/api/subastas/${testSubastaId}`);
      assert(
        detalleRes.status === 200 && detalleRes.data.data.SUBASTA_ID === testSubastaId,
        `GET /api/subastas/${testSubastaId} devuelve ficha técnica completa y fotos`
      );

      const liveRes = await request(`/api/subastas/${testSubastaId}/live`);
      assert(
        liveRes.status === 200 && typeof liveRes.data.data.segundosRestantes === 'number',
        `GET /api/subastas/${testSubastaId}/live responde para sincronización en tiempo real`
      );
    }

    // -------------------------------------------------------------
    // PRUEBA 4: Reglas de Negocio en Ofertas / Pujas (Validaciones Estrictas)
    // -------------------------------------------------------------
    console.log('\n--- 4. Pruebas de Motor de Pujas y Reglas de Negocio ---');
    if (testSubastaId) {
      // 4.1 Puja menor al monto base o inválida -> debe fallar con 400
      const pujaBaja = await request(`/api/subastas/${testSubastaId}/pujas`, {
        method: 'POST',
        body: JSON.stringify({ monto: 100 }) // Menor a Q.20,000
      });
      assert(
        pujaBaja.status === 400 && pujaBaja.data.status === 'error',
        'POST /api/subastas/:id/pujas rechaza montos inferiores al monto base (400 Bad Request)'
      );

      // 4.2 Error de referencia intencional (Subasta inexistente ID 999999)
      const pujaInexistente = await request('/api/subastas/999999/pujas', {
        method: 'POST',
        body: JSON.stringify({ monto: 999999 })
      });
      assert(
        pujaInexistente.status === 400,
        'POST /api/subastas/999999/pujas rechaza subastas inexistentes (Error de referencia 400)'
      );
    }

    // -------------------------------------------------------------
    // PRUEBA 5: Manejo de Errores de Sintaxis y Protección
    // -------------------------------------------------------------
    console.log('\n--- 5. Pruebas de Manejo de Errores de Sintaxis ---');
    const syntaxErr = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({}) // campos vacíos
    });
    assert(
      syntaxErr.status === 400 && syntaxErr.data.status === 'error',
      'POST /api/auth/login maneja payload vacío controladamente sin crash'
    );

    const anonBid = await fetch(`${BASE_URL}/api/subastas/1/pujas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monto: 80000 })
    });
    assert(
      anonBid.status === 401,
      'POST /api/subastas/:id/pujas bloquea ofertas de usuarios anónimos (401 Unauthorized)'
    );

  } catch (err) {
    console.error('Error fatal durante la ejecución de pruebas:', err);
    failed++;
  } finally {
    if (server) {
      await new Promise(res => server.close(res));
      console.log('\n[TEST] Servidor de pruebas cerrado.');
    }

    console.log('\n====================================================');
    console.log(`📊 RESUMEN: ${passed} PASADAS | ${failed} FALLIDAS`);
    console.log('====================================================');

    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
