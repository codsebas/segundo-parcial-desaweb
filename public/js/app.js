// App Controller en Vanilla JS (ES6+) para Subastas Copart
const app = {
  // Estado global
  state: {
    user: null,
    token: null,
    catalogos: null,
    subastas: [],
    currentSubasta: null,
    currentPhotoIndex: 0,
    livePollingInterval: null,
    countdownInterval: null,
    pubFotos: [],
    searchDebounceTimer: null
  },

  // Prevención de inyección XSS en renderizado dinámico
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // Inicialización de la aplicación
  async init() {
    this.restoreSession();
    this.renderUserMenu();
    await this.loadCatalogos();
    await this.loadSubastas();
  },

  // Manejo de Sesión y Token JWT
  restoreSession() {
    try {
      const savedUser = localStorage.getItem('copart_user');
      const savedToken = localStorage.getItem('copart_token');
      if (savedUser && savedToken) {
        this.state.user = JSON.parse(savedUser);
        this.state.token = savedToken;
      }
    } catch (e) {
      console.warn('Error restaurando sesión:', e);
      this.clearSession();
    }
  },

  saveSession(user, token) {
    this.state.user = user;
    this.state.token = token;
    localStorage.setItem('copart_user', JSON.stringify(user));
    localStorage.setItem('copart_token', token);
    this.renderUserMenu();
  },

  clearSession() {
    this.state.user = null;
    this.state.token = null;
    localStorage.removeItem('copart_user');
    localStorage.removeItem('copart_token');
    this.renderUserMenu();
  },

  // Renderizado del Menú de Usuario en Header
  renderUserMenu() {
    const container = document.getElementById('user-menu-container');
    if (!container) return;

    if (this.state.user) {
      container.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="text-right hidden sm:block">
            <span class="block text-xs font-bold text-slate-900">${this.state.user.nombre} ${this.state.user.apellido}</span>
            <span class="block text-[11px] text-slate-500">${this.state.user.correo}</span>
          </div>
          <div class="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
            ${this.state.user.nombre.charAt(0).toUpperCase()}
          </div>
          <button onclick="app.logout()" title="Cerrar Sesión" class="text-slate-400 hover:text-red-600 transition p-1.5 rounded-lg hover:bg-slate-100">
            <i class="fa-solid fa-arrow-right-from-bracket text-base"></i>
          </button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="flex items-center gap-2">
          <button onclick="app.openModal('modal-login')" class="text-xs font-semibold text-slate-700 hover:text-blue-600 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 transition">
            Iniciar Sesión
          </button>
          <button onclick="app.openModal('modal-registro')" class="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 rounded-lg shadow-sm transition">
            Registrarse
          </button>
        </div>
      `;
    }
  },

  // Inicio de Sesión Rápido (para pruebas del catedrático)
  async quickLogin(correo) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, contrasena: 'Password123!' })
      });
      const json = await res.json();
      if (json.status === 'success') {
        this.saveSession(json.data.usuario, json.data.token);
        this.showToast(`Sesión iniciada como: ${json.data.usuario.nombre} (${correo})`, 'success');
        if (this.state.currentSubasta) {
          this.loadSubastaDetalle(this.state.currentSubasta.SUBASTA_ID);
        }
      } else {
        this.showToast(json.message || 'Error en login rápido', 'error');
      }
    } catch (e) {
      this.showToast('Error de red al iniciar sesión rápida', 'error');
    }
  },

  async submitLogin(e) {
    e.preventDefault();
    const correo = document.getElementById('login-correo').value;
    const contrasena = document.getElementById('login-contrasena').value;
    const btn = document.getElementById('btn-login');

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Ingresando...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, contrasena })
      });
      const json = await res.json();
      if (json.status === 'success') {
        this.saveSession(json.data.usuario, json.data.token);
        this.closeModal('modal-login');
        this.showToast('¡Bienvenido, ' + json.data.usuario.nombre + '!', 'success');
        if (this.state.currentSubasta) {
          this.loadSubastaDetalle(this.state.currentSubasta.SUBASTA_ID);
        }
      } else {
        this.showToast(json.message || 'Credenciales incorrectas', 'error');
      }
    } catch (err) {
      this.showToast('Error de conexión al servidor', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Ingresar';
    }
  },

  async submitRegistro(e) {
    e.preventDefault();
    const nombre = document.getElementById('reg-nombre').value;
    const apellido = document.getElementById('reg-apellido').value;
    const correo = document.getElementById('reg-correo').value;
    const telefono = document.getElementById('reg-telefono').value;
    const contrasena = document.getElementById('reg-contrasena').value;
    const btn = document.getElementById('btn-registro');

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Registrando...';

    try {
      const res = await fetch('/api/auth/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, apellido, correo, telefono, contrasena })
      });
      const json = await res.json();
      if (json.status === 'success') {
        this.saveSession(json.data.usuario, json.data.token);
        this.closeModal('modal-registro');
        this.showToast('¡Registro completado! Bienvenido a Copart GT.', 'success');
      } else {
        this.showToast(json.message || 'Error al registrar', 'error');
      }
    } catch (err) {
      this.showToast('Error de conexión al servidor', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Completar Registro';
    }
  },

  logout() {
    this.clearSession();
    this.showToast('Sesión cerrada correctamente.', 'info');
    if (this.state.currentSubasta) {
      this.loadSubastaDetalle(this.state.currentSubasta.SUBASTA_ID);
    }
  },

  // Navegación SPA entre Vistas
  navigate(viewName, params = {}) {
    // Limpiar intervalos de tiempo real anteriores
    if (this.state.livePollingInterval) {
      clearInterval(this.state.livePollingInterval);
      this.state.livePollingInterval = null;
    }
    if (this.state.countdownInterval) {
      clearInterval(this.state.countdownInterval);
      this.state.countdownInterval = null;
    }

    const views = ['home', 'detalle', 'publicar', 'mis-vehiculos'];
    views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.add('hidden');
      const navBtn = document.getElementById(`nav-${v}`);
      if (navBtn) {
        navBtn.classList.remove('text-blue-600', 'border-blue-600');
        navBtn.classList.add('text-slate-600', 'border-transparent');
      }
    });

    const activeEl = document.getElementById(`view-${viewName}`);
    if (activeEl) activeEl.classList.remove('hidden');

    const activeNav = document.getElementById(`nav-${viewName}`);
    if (activeNav) {
      activeNav.classList.remove('text-slate-600', 'border-transparent');
      activeNav.classList.add('text-blue-600', 'border-blue-600');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (viewName === 'home') {
      this.loadSubastas();
    } else if (viewName === 'detalle' && params.id) {
      this.loadSubastaDetalle(params.id);
    } else if (viewName === 'publicar') {
      if (!this.state.user) {
        this.showToast('Debes iniciar sesión para publicar un vehículo.', 'warning');
        this.openModal('modal-login');
        this.navigate('home');
        return;
      }
      this.populatePublicarSelects();
    } else if (viewName === 'mis-vehiculos') {
      if (!this.state.user) {
        this.showToast('Debes iniciar sesión para ver tus publicaciones.', 'warning');
        this.openModal('modal-login');
        this.navigate('home');
        return;
      }
      this.loadMisVehiculos();
    }
  },

  // Carga de Catálogos
  async loadCatalogos() {
    try {
      const res = await fetch('/api/catalogos');
      const json = await res.json();
      if (json.status === 'success') {
        this.state.catalogos = json.data;
        this.populateFilterSelects();
      }
    } catch (e) {
      console.error('Error cargando catálogos:', e);
    }
  },

  populateFilterSelects() {
    if (!this.state.catalogos) return;
    const { marcas, combustibles } = this.state.catalogos;

    const selMarca = document.getElementById('filter-marca');
    if (selMarca) {
      selMarca.innerHTML = '<option value="">Todas las marcas</option>' +
        marcas.map(m => `<option value="${m.MARCA_ID}">${m.NOMBRE}</option>`).join('');
    }

    const selComb = document.getElementById('filter-combustible');
    if (selComb) {
      selComb.innerHTML = '<option value="">Todos los combustibles</option>' +
        combustibles.map(c => `<option value="${c.COMBUSTIBLE_ID}">${c.NOMBRE}</option>`).join('');
    }
  },

  onMarcaFilterChange() {
    const marcaId = document.getElementById('filter-marca').value;
    const selModelo = document.getElementById('filter-modelo');
    if (!selModelo) return;

    if (!marcaId) {
      selModelo.innerHTML = '<option value="">Todos los modelos</option>';
      this.applyFilters();
      return;
    }

    const modelosFiltrados = (this.state.catalogos?.modelos || []).filter(m => m.MARCA_ID == marcaId);
    selModelo.innerHTML = '<option value="">Todos los modelos</option>' +
      modelosFiltrados.map(mo => `<option value="${mo.MODELO_ID}">${mo.NOMBRE}</option>`).join('');

    this.applyFilters();
  },

  debouncedSearch() {
    clearTimeout(this.state.searchDebounceTimer);
    this.state.searchDebounceTimer = setTimeout(() => {
      this.applyFilters();
    }, 300);
  },

  resetFilters() {
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-marca').value = '';
    document.getElementById('filter-modelo').innerHTML = '<option value="">Todos los modelos</option>';
    document.getElementById('filter-anio').value = '';
    document.getElementById('filter-combustible').value = '';
    document.getElementById('filter-dano').value = '';
    document.getElementById('filter-precio').value = '';
    this.loadSubastas();
  },

  applyFilters() {
    const query = new URLSearchParams();
    const search = document.getElementById('filter-search')?.value.trim();
    const marcaId = document.getElementById('filter-marca')?.value;
    const modeloId = document.getElementById('filter-modelo')?.value;
    const anio = document.getElementById('filter-anio')?.value;
    const combId = document.getElementById('filter-combustible')?.value;
    const dano = document.getElementById('filter-dano')?.value;
    const precioMax = document.getElementById('filter-precio')?.value;

    if (search) query.append('search', search);
    if (marcaId) query.append('marcaId', marcaId);
    if (modeloId) query.append('modeloId', modeloId);
    if (anio) query.append('anio', anio);
    if (combId) query.append('combustibleId', combId);
    if (dano) query.append('nivelDano', dano);
    if (precioMax) query.append('precioMax', precioMax);

    this.loadSubastas(query.toString());
  },

  // Consulta de Subastas / Inventario
  async loadSubastas(queryString = '') {
    const grid = document.getElementById('vehiculos-grid');
    const emptyState = document.getElementById('empty-state');
    const countEl = document.getElementById('catalogo-count');

    grid.innerHTML = `
      <div class="col-span-full text-center py-16">
        <i class="fa-solid fa-circle-notch fa-spin text-3xl text-blue-600 mb-2"></i>
        <p class="text-xs text-slate-500 font-medium">Buscando vehículos disponibles...</p>
      </div>
    `;

    try {
      const url = '/api/subastas' + (queryString ? `?${queryString}` : '');
      const res = await fetch(url);
      const json = await res.json();

      if (json.status === 'success') {
        this.state.subastas = json.data;
        countEl.textContent = `${json.total} vehículo(s) encontrado(s)`;

        if (json.total === 0) {
          grid.innerHTML = '';
          emptyState.classList.remove('hidden');
          return;
        }

        emptyState.classList.add('hidden');
        grid.innerHTML = json.data.map(sub => this.renderVehiculoCard(sub)).join('');
      }
    } catch (e) {
      console.error('Error cargando subastas:', e);
      grid.innerHTML = `
        <div class="col-span-full bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-center text-sm">
          <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
          <p>Ocurrió un error al cargar el catálogo de vehículos.</p>
        </div>
      `;
    }
  },

  renderVehiculoCard(sub) {
    // Determinar badge de daño
    let badgeDanoClass = 'badge-dano-verde';
    let iconDano = '🟢';
    if (sub.NIVEL_DANO_CODIGO === 'AMARILLO') {
      badgeDanoClass = 'badge-dano-amarillo';
      iconDano = '🟡';
    } else if (sub.NIVEL_DANO_CODIGO === 'ROJO') {
      badgeDanoClass = 'badge-dano-rojo';
      iconDano = '🔴';
    }

    const fotoUrl = sub.FOTO_PORTADA_ID ? `/api/fotos/${sub.FOTO_PORTADA_ID}` : 'https://placehold.co/600x400/e2e8f0/475569?text=Sin+Foto';
    const ofertaActual = sub.OFERTA_ACTUAL ? `Q. ${Number(sub.OFERTA_ACTUAL).toLocaleString('es-GT', { minimumFractionDigits: 2 })}` : 'Sin ofertas';
    const precioBase = `Q. ${Number(sub.PRECIO_BASE).toLocaleString('es-GT', { minimumFractionDigits: 2 })}`;

    return `
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all duration-200 flex flex-col overflow-hidden group">
        <!-- Imagen y Badges -->
        <div class="relative h-48 bg-slate-100 overflow-hidden">
          <img src="${fotoUrl}" alt="${sub.MARCA} ${sub.MODELO}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.src='https://placehold.co/600x400/e2e8f0/475569?text=Vehiculo'">
          
          <!-- Badge de Daño -->
          <div class="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold shadow-sm ${badgeDanoClass}">
            ${iconDano} ${sub.NIVEL_DANO_DESC}
          </div>

          <!-- Contador de Fotos -->
          <div class="absolute bottom-3 right-3 bg-slate-900/70 text-white text-[11px] font-semibold px-2 py-0.5 rounded backdrop-blur-sm flex items-center gap-1">
            <i class="fa-solid fa-camera"></i> ${sub.TOTAL_FOTOS} fotos
          </div>
        </div>

        <!-- Información del Vehículo -->
        <div class="p-5 flex-grow flex flex-col justify-between space-y-4">
          <div>
            <div class="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
              <span>${this.escapeHtml(sub.ANIO)} • ${this.escapeHtml(sub.TIPO_ARTICULO)}</span>
              <span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold text-[10px] uppercase">Lote #${sub.SUBASTA_ID}</span>
            </div>
            <h3 class="text-lg font-bold text-slate-900 tracking-tight leading-snug group-hover:text-blue-600 transition">
              ${this.escapeHtml(sub.ANIO)} ${this.escapeHtml(sub.MARCA)} ${this.escapeHtml(sub.MODELO)}
            </h3>
            <p class="text-xs text-slate-500 mt-1 flex items-center gap-2">
              <span><i class="fa-solid fa-gauge text-slate-400"></i> ${this.escapeHtml(sub.MOTOR)}</span>
              <span>•</span>
              <span>${this.escapeHtml(sub.TRANSMISION)}</span>
              <span>•</span>
              <span>${this.escapeHtml(sub.TRACCION)}</span>
            </p>
          </div>

          <!-- Precios y Pujas -->
          <div class="bg-slate-50 rounded-lg p-3 border border-slate-100 flex items-center justify-between">
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Oferta Actual</span>
              <span class="text-base font-extrabold ${sub.OFERTA_ACTUAL ? 'text-green-700' : 'text-slate-600'}">
                ${ofertaActual}
              </span>
            </div>
            <div class="text-right">
              <span class="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Monto Base</span>
              <span class="text-xs font-semibold text-slate-600">${precioBase}</span>
            </div>
          </div>

          <!-- Botón de Acción -->
          <button onclick="app.navigate('detalle', { id: ${sub.SUBASTA_ID} })" class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs shadow-sm transition flex items-center justify-center gap-2">
            <i class="fa-solid fa-gavel"></i> Participar en Subasta
          </button>
        </div>
      </div>
    `;
  },

  // ==========================================
  // MOTOR DE SUBASTA Y TIEMPO REAL
  // ==========================================
  async loadSubastaDetalle(subastaId) {
    const container = document.getElementById('detalle-container');
    container.innerHTML = `
      <div class="col-span-12 text-center py-20">
        <i class="fa-solid fa-circle-notch fa-spin text-4xl text-blue-600 mb-3"></i>
        <p class="text-slate-500 font-medium text-sm">Conectando a la subasta en vivo...</p>
      </div>
    `;

    try {
      const headers = {};
      if (this.state.token) headers['Authorization'] = `Bearer ${this.state.token}`;

      const res = await fetch(`/api/subastas/${subastaId}`, { headers });
      const json = await res.json();

      if (json.status !== 'success') {
        container.innerHTML = `
          <div class="col-span-12 bg-red-50 border border-red-200 text-red-700 p-8 rounded-2xl text-center">
            <p class="font-bold text-lg mb-2">No fue posible cargar la subasta</p>
            <p class="text-sm">${json.message || 'Subasta inexistente.'}</p>
          </div>
        `;
        return;
      }

      this.state.currentSubasta = json.data;
      this.state.currentPhotoIndex = 0;

      // Renderizar vista completa
      this.renderSubastaView(json.data);

      // Iniciar el reloj de cuenta regresiva
      this.startCountdown(json.data.segundosRestantes);

      // Iniciar sincronización en tiempo real sin recarga de pantalla (F5 prohibido)
      this.startLivePolling(subastaId);

    } catch (err) {
      console.error('Error al cargar detalle:', err);
    }
  },

  renderSubastaView(sub) {
    const container = document.getElementById('detalle-container');
    if (!container) return;

    let badgeDanoClass = 'badge-dano-verde';
    let iconDano = '🟢';
    if (sub.NIVEL_DANO_CODIGO === 'AMARILLO') {
      badgeDanoClass = 'badge-dano-amarillo';
      iconDano = '🟡';
    } else if (sub.NIVEL_DANO_CODIGO === 'ROJO') {
      badgeDanoClass = 'badge-dano-rojo';
      iconDano = '🔴';
    }

    const fotos = sub.fotos || [];
    const mainPhotoUrl = fotos.length > 0 ? `/api/fotos/${fotos[0].FOTO_ID}` : 'https://placehold.co/800x500/e2e8f0/475569?text=Sin+Foto';

    container.innerHTML = `
      <!-- COLUMNA IZQUIERDA: CARRUSEL DE FOTOS INTERACTIVO (5+ FOTOS) -->
      <div class="lg:col-span-7 space-y-4">
        <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <!-- Foto Principal en Carrusel -->
          <div class="relative h-80 sm:h-96 bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center">
            <img id="carousel-main-img" src="${mainPhotoUrl}" alt="Foto Vehículo" class="w-full h-full object-cover transition-opacity duration-200">
            
            <!-- Flechas de navegación -->
            <button onclick="app.prevPhoto()" class="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/60 hover:bg-slate-900/80 text-white flex items-center justify-center backdrop-blur-sm transition">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button onclick="app.nextPhoto()" class="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/60 hover:bg-slate-900/80 text-white flex items-center justify-center backdrop-blur-sm transition">
              <i class="fa-solid fa-chevron-right"></i>
            </button>

            <!-- Contador de imagen actual -->
            <div class="absolute bottom-3 left-3 bg-slate-900/70 text-white text-xs font-semibold px-2.5 py-1 rounded-md backdrop-blur-sm">
              <span id="carousel-indicator">1 / ${fotos.length}</span>
            </div>
          </div>

          <!-- Miniaturas Interactivas -->
          <div class="flex items-center gap-2 mt-3 overflow-x-auto pb-1" id="carousel-thumbnails">
            ${fotos.map((f, idx) => `
              <button onclick="app.selectPhoto(${idx})" class="w-16 h-14 rounded-lg overflow-hidden border-2 flex-shrink-0 transition ${idx === 0 ? 'border-blue-600 scale-105' : 'border-slate-200 opacity-70 hover:opacity-100'}">
                <img src="/api/fotos/${f.FOTO_ID}" alt="Thumb" class="w-full h-full object-cover">
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Ficha Técnica Completa -->
        <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h3 class="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <i class="fa-solid fa-clipboard-list text-blue-600"></i> Ficha Técnica del Vehículo
          </h3>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 text-xs">
            <div>
              <span class="text-slate-400 uppercase font-bold block mb-0.5">Año</span>
              <span class="text-slate-800 font-semibold text-sm">${this.escapeHtml(sub.ANIO)}</span>
            </div>
            <div>
              <span class="text-slate-400 uppercase font-bold block mb-0.5">Tipo de Artículo</span>
              <span class="text-slate-800 font-semibold text-sm">${this.escapeHtml(sub.TIPO_ARTICULO)}</span>
            </div>
            <div>
              <span class="text-slate-400 uppercase font-bold block mb-0.5">Marca / Modelo</span>
              <span class="text-slate-800 font-semibold text-sm">${this.escapeHtml(sub.MARCA)} ${this.escapeHtml(sub.MODELO)}</span>
            </div>
            <div>
              <span class="text-slate-400 uppercase font-bold block mb-0.5">Especificación de Motor</span>
              <span class="text-slate-800 font-semibold text-sm">${this.escapeHtml(sub.MOTOR)}</span>
            </div>
            <div>
              <span class="text-slate-400 uppercase font-bold block mb-0.5">Cilindros</span>
              <span class="text-slate-800 font-semibold text-sm">${this.escapeHtml(sub.NUMERO_CILINDROS)} Cilindros</span>
            </div>
            <div>
              <span class="text-slate-400 uppercase font-bold block mb-0.5">Transmisión</span>
              <span class="text-slate-800 font-semibold text-sm">${this.escapeHtml(sub.TRANSMISION)}</span>
            </div>
            <div>
              <span class="text-slate-400 uppercase font-bold block mb-0.5">Combustible</span>
              <span class="text-slate-800 font-semibold text-sm">${this.escapeHtml(sub.COMBUSTIBLE)}</span>
            </div>
            <div>
              <span class="text-slate-400 uppercase font-bold block mb-0.5">Tren de Manejo (Tracción)</span>
              <span class="text-slate-800 font-semibold text-sm">${this.escapeHtml(sub.TRACCION)}</span>
            </div>
            <div>
              <span class="text-slate-400 uppercase font-bold block mb-0.5">Clasificación de Daño</span>
              <span class="inline-block px-2 py-0.5 rounded text-xs font-bold ${badgeDanoClass}">
                ${iconDano} ${this.escapeHtml(sub.NIVEL_DANO_DESC)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- COLUMNA DERECHA: MOTOR DE PUJAS EN TIEMPO REAL -->
      <div class="lg:col-span-5 space-y-5">
        
        <!-- Tarjeta de Subasta en Vivo -->
        <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
          
          <!-- Encabezado de la Subasta -->
          <div class="flex items-start justify-between gap-3">
            <div>
              <span class="text-xs font-bold text-blue-600 uppercase tracking-wider">Subasta Lote #${sub.SUBASTA_ID}</span>
              <h2 class="text-2xl font-black text-slate-900 tracking-tight leading-snug">
                ${this.escapeHtml(sub.ANIO)} ${this.escapeHtml(sub.MARCA)} ${this.escapeHtml(sub.MODELO)}
              </h2>
            </div>
            <div class="px-3 py-1 rounded-full text-xs font-bold ${badgeDanoClass}">
              ${iconDano} ${sub.NIVEL_DANO_CODIGO}
            </div>
          </div>

          <!-- INDICADOR VISUAL DINÁMICO EN TIEMPO REAL (GANANDO / SUPERADO) -->
          <div id="live-bid-badge-container">
            ${this.renderBidBadgeHtml(sub.badgeEstado, sub.estaCerrada)}
          </div>

          <!-- CRONÓMETRO DE CUENTA REGRESIVA EN VIVO -->
          <div class="bg-slate-50 rounded-xl p-4 border border-slate-200 text-center">
            <span class="text-xs uppercase font-bold text-slate-500 tracking-wider block mb-2">
              <i class="fa-regular fa-clock text-blue-600"></i> Tiempo Restante para el Cierre
            </span>
            <div class="grid grid-cols-4 gap-2 font-mono" id="countdown-clock">
              <div class="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                <span id="clock-days" class="text-2xl font-black text-slate-900 block">--</span>
                <span class="text-[10px] text-slate-400 font-bold uppercase">Días</span>
              </div>
              <div class="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                <span id="clock-hours" class="text-2xl font-black text-slate-900 block">--</span>
                <span class="text-[10px] text-slate-400 font-bold uppercase">Horas</span>
              </div>
              <div class="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                <span id="clock-mins" class="text-2xl font-black text-slate-900 block">--</span>
                <span class="text-[10px] text-slate-400 font-bold uppercase">Min</span>
              </div>
              <div class="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                <span id="clock-secs" class="text-2xl font-black text-blue-600 block">--</span>
                <span class="text-[10px] text-slate-400 font-bold uppercase">Seg</span>
              </div>
            </div>
            <p id="subasta-ended-msg" class="hidden text-sm font-bold text-red-600 mt-2">
              <i class="fa-solid fa-lock"></i> Oferta cerrada — Esta subasta ha concluido.
            </p>
          </div>

          <!-- PANEL DE MONTOS Y OFERTAS -->
          <div class="bg-gradient-to-br from-slate-50 to-blue-50/40 rounded-xl p-4 border border-slate-200 space-y-3">
            <div class="flex items-baseline justify-between">
              <div>
                <span class="text-xs uppercase font-bold text-slate-500 block">Oferta Actual Más Alta</span>
                <span id="live-oferta-actual" class="text-3xl font-black text-green-700 tracking-tight">
                  ${sub.OFERTA_ACTUAL ? `Q. ${Number(sub.OFERTA_ACTUAL).toLocaleString('es-GT', { minimumFractionDigits: 2 })}` : 'Q. 0.00'}
                </span>
              </div>
              <div class="text-right">
                <span class="text-[11px] uppercase font-bold text-slate-400 block">Monto Base</span>
                <span class="text-sm font-bold text-slate-700">Q. ${Number(sub.PRECIO_BASE).toLocaleString('es-GT', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div class="flex items-center justify-between text-xs text-slate-500 border-t border-slate-200/60 pt-2">
              <span>Total de ofertas registradas: <strong id="live-total-pujas" class="text-slate-800">${sub.TOTAL_PUJAS}</strong></span>
              <span class="text-[11px] text-slate-400"><i class="fa-solid fa-user-secret"></i> Postores anónimos</span>
            </div>
          </div>

          <!-- FORMULARIO DE PUJA (CON REGLAS DE NEGOCIO EN VIVO) -->
          <div id="bid-action-box" class="space-y-3 pt-2">
            ${this.renderBidFormHtml(sub)}
          </div>

        </div>

        <!-- HISTORIAL DE PUJAS EN TIEMPO REAL (ANONIMIZADO) -->
        <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 class="text-sm font-bold text-slate-900 flex items-center gap-2">
              <i class="fa-solid fa-timeline text-blue-600"></i> Historial de Ofertas en Vivo
            </h4>
            <span class="text-[11px] font-semibold text-slate-400">Trazabilidad Anónima</span>
          </div>

          <div id="historial-pujas-container" class="space-y-2 max-h-56 overflow-y-auto pr-1">
            <p class="text-xs text-slate-400 text-center py-4">Cargando historial de pujas...</p>
          </div>
        </div>

      </div>
    `;

    this.loadHistorialPujas(sub.SUBASTA_ID);
  },

  renderBidBadgeHtml(badgeEstado, estaCerrada) {
    if (estaCerrada) {
      return `
        <div class="bg-slate-100 border border-slate-300 text-slate-700 p-3 rounded-xl flex items-center gap-3 text-xs font-semibold">
          <i class="fa-solid fa-flag-checkered text-lg text-slate-500"></i>
          <div>
            <span class="font-bold block text-sm">Subasta Finalizada</span>
            <span>Esta subasta ya cerró y no acepta nuevas ofertas.</span>
          </div>
        </div>
      `;
    }

    if (badgeEstado === 'GANANDO') {
      return `
        <div class="bg-emerald-50 border-2 border-emerald-500 text-emerald-900 p-3 rounded-xl flex items-center gap-3 shadow-sm pulse-bid">
          <div class="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-base flex-shrink-0">
            <i class="fa-solid fa-trophy"></i>
          </div>
          <div>
            <span class="font-black text-sm text-emerald-800 block">¡Vas ganando esta subasta! 🟢</span>
            <span class="text-xs text-emerald-700">Tu oferta es actualmente la más alta. Mantente atento hasta el cierre.</span>
          </div>
        </div>
      `;
    } else if (badgeEstado === 'SUPERADO') {
      return `
        <div class="bg-red-50 border-2 border-red-500 text-red-900 p-3 rounded-xl flex items-center gap-3 shadow-sm">
          <div class="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-base flex-shrink-0 animate-bounce">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <div>
            <span class="font-black text-sm text-red-800 block">Tu oferta ha sido superada 🔴</span>
            <span class="text-xs text-red-700">¡Haz tu oferta ahora antes de que termine el tiempo para retomar la delantera!</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-xl flex items-center gap-3 text-xs">
        <i class="fa-solid fa-circle-info text-blue-500 text-base"></i>
        <span>Ingresa tu oferta con al menos un 10% adicional sobre la oferta actual para liderar.</span>
      </div>
    `;
  },

  renderBidFormHtml(sub) {
    if (sub.estaCerrada) {
      return `
        <button disabled class="w-full py-3 bg-slate-200 text-slate-500 font-semibold rounded-xl text-sm cursor-not-allowed">
          Oferta Cerrada
        </button>
      `;
    }

    if (!this.state.user) {
      return `
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center space-y-2">
          <p class="text-xs font-semibold text-amber-800">
            <i class="fa-solid fa-lock text-amber-600"></i> Debes iniciar sesión para realizar una oferta.
          </p>
          <div class="flex items-center justify-center gap-2 pt-1">
            <button onclick="app.openModal('modal-login')" class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs shadow-sm transition">
              Iniciar Sesión
            </button>
            <button onclick="app.quickLogin('comprador1@copart.com')" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs transition">
              Entrar como Comprador 1
            </button>
          </div>
        </div>
      `;
    }

    if (sub.usuarioEsPublicador) {
      return `
        <div class="bg-slate-100 border border-slate-300 rounded-xl p-3 text-center text-xs text-slate-600">
          <i class="fa-solid fa-user-shield text-slate-500"></i> Eres el publicador de este vehículo. No puedes ofertar en tu propia subasta.
        </div>
      `;
    }

    const minBid = sub.minimoSiguientePuja || sub.PRECIO_BASE;

    return `
      <form onsubmit="app.submitPuja(event)" class="space-y-3">
        <div>
          <div class="flex items-center justify-between text-xs mb-1">
            <label class="font-bold text-slate-700">Tu Monto de Oferta (Q.)</label>
            <span class="text-slate-500 font-medium">Mínimo sugerido: <strong class="text-blue-700">Q. ${Number(minBid).toLocaleString('es-GT', { minimumFractionDigits: 2 })}</strong></span>
          </div>
          <div class="relative">
            <span class="absolute left-3.5 top-2.5 text-slate-400 font-bold">Q.</span>
            <input 
              type="number" 
              id="input-bid-amount" 
              step="100" 
              min="${minBid}" 
              value="${minBid}" 
              required 
              class="w-full pl-9 pr-4 py-2.5 bg-white border-2 border-blue-500 rounded-xl text-lg font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
          </div>
        </div>

        <!-- Incrementos rápidos -->
        <div class="grid grid-cols-3 gap-2 text-xs">
          <button type="button" onclick="app.addIncrement(0.10)" class="py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-lg font-semibold transition">
            +10%
          </button>
          <button type="button" onclick="app.addIncrement(0.20)" class="py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-lg font-semibold transition">
            +20%
          </button>
          <button type="button" onclick="app.addIncrement(0.50)" class="py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-lg font-semibold transition">
            +50%
          </button>
        </div>

        <button type="submit" id="btn-submit-puja" class="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold rounded-xl shadow-md transition flex items-center justify-center gap-2 text-sm">
          <i class="fa-solid fa-gavel"></i> Confirmar Oferta Inmediata
        </button>
      </form>
    `;
  },

  addIncrement(percentage) {
    const input = document.getElementById('input-bid-amount');
    if (!input || !this.state.currentSubasta) return;

    const baseParaIncremento = Number(this.state.currentSubasta.OFERTA_ACTUAL) || Number(this.state.currentSubasta.PRECIO_BASE);
    const nuevoMonto = Math.ceil(baseParaIncremento * (1 + percentage));
    input.value = nuevoMonto;
  },

  // Envío de Oferta / Puja
  async submitPuja(e) {
    e.preventDefault();
    if (!this.state.user || !this.state.currentSubasta) return;

    const subastaId = this.state.currentSubasta.SUBASTA_ID;
    const input = document.getElementById('input-bid-amount');
    const monto = parseFloat(input.value);
    const btn = document.getElementById('btn-submit-puja');

    if (isNaN(monto) || monto <= 0) {
      this.showToast('Ingresa un monto numérico válido.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Registrando puja...';

    try {
      const res = await fetch(`/api/subastas/${subastaId}/pujas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.state.token}`
        },
        body: JSON.stringify({ monto })
      });
      const json = await res.json();

      if (json.status === 'success') {
        this.showToast('¡Oferta registrada con éxito! Vas ganando la subasta.', 'success');
        // Actualización inmediata del detalle
        await this.syncLiveState(subastaId);
        await this.loadHistorialPujas(subastaId);
      } else {
        this.showToast(json.message || 'La oferta fue rechazada.', 'error');
      }
    } catch (err) {
      this.showToast('Error de conexión al enviar oferta.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-gavel"></i> Confirmar Oferta Inmediata';
    }
  },

  // Consulta de Historial de Pujas
  async loadHistorialPujas(subastaId) {
    const container = document.getElementById('historial-pujas-container');
    if (!container) return;

    try {
      const res = await fetch(`/api/subastas/${subastaId}/pujas`);
      const json = await res.json();

      if (json.status === 'success') {
        if (json.data.length === 0) {
          container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Aún no hay ofertas registradas. ¡Sé el primero!</p>';
          return;
        }

        container.innerHTML = json.data.map(p => {
          const fecha = new Date(p.fechaUtc).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          return `
            <div class="flex items-center justify-between p-2 rounded-lg text-xs ${p.esMayor ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-100'}">
              <div class="flex items-center gap-2">
                <span class="w-6 h-6 rounded-full ${p.esMayor ? 'bg-green-600 text-white' : 'bg-slate-300 text-slate-700'} flex items-center justify-center font-bold text-[10px]">
                  ${p.esMayor ? '★' : '•'}
                </span>
                <div>
                  <span class="font-bold text-slate-800">${p.postorAnonimo}</span>
                  <span class="text-[10px] text-slate-400 block">${fecha}</span>
                </div>
              </div>
              <span class="font-black ${p.esMayor ? 'text-green-700 text-sm' : 'text-slate-600'}">
                Q. ${Number(p.monto).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
              </span>
            </div>
          `;
        }).join('');
      }
    } catch (e) {
      console.warn('Error al cargar historial de pujas:', e);
    }
  },

  // Sincronización en Tiempo Real mediante Polling Reactivo de Alta Frecuencia (1.5s)
  startLivePolling(subastaId) {
    if (this.state.livePollingInterval) clearInterval(this.state.livePollingInterval);

    this.state.livePollingInterval = setInterval(async () => {
      // Si ya no estamos en la vista de detalle, detener
      const viewDetalle = document.getElementById('view-detalle');
      if (!viewDetalle || viewDetalle.classList.contains('hidden')) {
        clearInterval(this.state.livePollingInterval);
        return;
      }

      await this.syncLiveState(subastaId);
    }, 1500);
  },

  async syncLiveState(subastaId) {
    try {
      const headers = {};
      if (this.state.token) headers['Authorization'] = `Bearer ${this.state.token}`;

      const res = await fetch(`/api/subastas/${subastaId}/live`, { headers });
      const json = await res.json();

      if (json.status === 'success') {
        const live = json.data;

        // Actualizar valores en el DOM sin recargar la página (F5 prohibido)
        const ofertaEl = document.getElementById('live-oferta-actual');
        if (ofertaEl) {
          const anteriorTexto = ofertaEl.textContent;
          const nuevoTexto = live.ofertaActual ? `Q. ${Number(live.ofertaActual).toLocaleString('es-GT', { minimumFractionDigits: 2 })}` : 'Q. 0.00';
          if (anteriorTexto !== nuevoTexto) {
            ofertaEl.textContent = nuevoTexto;
            ofertaEl.classList.add('pulse-bid');
            setTimeout(() => ofertaEl.classList.remove('pulse-bid'), 1500);
            this.loadHistorialPujas(subastaId);
          }
        }

        const totalPujasEl = document.getElementById('live-total-pujas');
        if (totalPujasEl) totalPujasEl.textContent = live.totalPujas;

        // Actualizar Badge de Estado (Ganando / Superado)
        const badgeContainer = document.getElementById('live-bid-badge-container');
        if (badgeContainer) {
          badgeContainer.innerHTML = this.renderBidBadgeHtml(live.badgeEstado, live.estaCerrada);
        }

        // Actualizar estado de subasta si finalizó
        if (live.estaCerrada) {
          const msgEl = document.getElementById('subasta-ended-msg');
          if (msgEl) msgEl.classList.remove('hidden');
          const bidBox = document.getElementById('bid-action-box');
          if (bidBox) bidBox.innerHTML = '<button disabled class="w-full py-3 bg-slate-200 text-slate-500 font-semibold rounded-xl text-sm cursor-not-allowed">Oferta Cerrada</button>';
        }

        // Actualizar valor mínimo en el input si no está enfocado
        const inputBid = document.getElementById('input-bid-amount');
        if (inputBid && document.activeElement !== inputBid) {
          inputBid.min = live.minimoSiguientePuja;
          if (parseFloat(inputBid.value) < live.minimoSiguientePuja) {
            inputBid.value = live.minimoSiguientePuja;
          }
        }
      }
    } catch (e) {
      console.warn('Error en sincronización en tiempo real:', e);
    }
  },

  // Cronómetro regresivo suave
  startCountdown(initialSeconds) {
    if (this.state.countdownInterval) clearInterval(this.state.countdownInterval);

    let remaining = Math.max(0, initialSeconds);

    const updateClock = () => {
      if (remaining <= 0) {
        clearInterval(this.state.countdownInterval);
        document.getElementById('clock-days').textContent = '00';
        document.getElementById('clock-hours').textContent = '00';
        document.getElementById('clock-mins').textContent = '00';
        document.getElementById('clock-secs').textContent = '00';
        const msgEl = document.getElementById('subasta-ended-msg');
        if (msgEl) msgEl.classList.remove('hidden');
        return;
      }

      const days = Math.floor(remaining / (3600 * 24));
      const hours = Math.floor((remaining % (3600 * 24)) / 3600);
      const mins = Math.floor((remaining % 3600) / 60);
      const secs = Math.floor(remaining % 60);

      const dEl = document.getElementById('clock-days');
      const hEl = document.getElementById('clock-hours');
      const mEl = document.getElementById('clock-mins');
      const sEl = document.getElementById('clock-secs');

      if (dEl) dEl.textContent = String(days).padStart(2, '0');
      if (hEl) hEl.textContent = String(hours).padStart(2, '0');
      if (mEl) mEl.textContent = String(mins).padStart(2, '0');
      if (sEl) sEl.textContent = String(secs).padStart(2, '0');

      remaining--;
    };

    updateClock();
    this.state.countdownInterval = setInterval(updateClock, 1000);
  },

  // Navegación de Carrusel Fotográfico
  selectPhoto(idx) {
    if (!this.state.currentSubasta?.fotos) return;
    const fotos = this.state.currentSubasta.fotos;
    if (idx < 0 || idx >= fotos.length) return;

    this.state.currentPhotoIndex = idx;
    const imgEl = document.getElementById('carousel-main-img');
    const indicatorEl = document.getElementById('carousel-indicator');

    if (imgEl) {
      imgEl.style.opacity = '0.3';
      setTimeout(() => {
        imgEl.src = `/api/fotos/${fotos[idx].FOTO_ID}`;
        imgEl.style.opacity = '1';
      }, 100);
    }

    if (indicatorEl) indicatorEl.textContent = `${idx + 1} / ${fotos.length}`;

    // Actualizar bordes de miniaturas
    const thumbs = document.querySelectorAll('#carousel-thumbnails button');
    thumbs.forEach((btn, i) => {
      if (i === idx) {
        btn.classList.add('border-blue-600', 'scale-105', 'opacity-100');
        btn.classList.remove('border-slate-200', 'opacity-70');
      } else {
        btn.classList.remove('border-blue-600', 'scale-105', 'opacity-100');
        btn.classList.add('border-slate-200', 'opacity-70');
      }
    });
  },

  prevPhoto() {
    if (!this.state.currentSubasta?.fotos) return;
    const total = this.state.currentSubasta.fotos.length;
    const newIdx = (this.state.currentPhotoIndex - 1 + total) % total;
    this.selectPhoto(newIdx);
  },

  nextPhoto() {
    if (!this.state.currentSubasta?.fotos) return;
    const total = this.state.currentSubasta.fotos.length;
    const newIdx = (this.state.currentPhotoIndex + 1) % total;
    this.selectPhoto(newIdx);
  },

  // ==========================================
  // PUBLICACIÓN DE VEHÍCULOS
  // ==========================================
  populatePublicarSelects() {
    if (!this.state.catalogos) return;
    const { tipos, marcas, transmisiones, combustibles, tracciones } = this.state.catalogos;

    const selTipo = document.getElementById('pub-tipo');
    if (selTipo) {
      selTipo.innerHTML = '<option value="">Selecciona tipo...</option>' +
        tipos.map(t => `<option value="${t.TIPO_ARTICULO_ID}">${t.NOMBRE}</option>`).join('');
    }

    const selMarca = document.getElementById('pub-marca');
    if (selMarca) {
      selMarca.innerHTML = '<option value="">Selecciona marca...</option>' +
        marcas.map(m => `<option value="${m.MARCA_ID}">${m.NOMBRE}</option>`).join('');
    }

    const selTrans = document.getElementById('pub-transmision');
    if (selTrans) {
      selTrans.innerHTML = '<option value="">Selecciona transmisión...</option>' +
        transmisiones.map(t => `<option value="${t.TRANSMISION_ID}">${t.NOMBRE}</option>`).join('');
    }

    const selComb = document.getElementById('pub-combustible');
    if (selComb) {
      selComb.innerHTML = '<option value="">Selecciona combustible...</option>' +
        combustibles.map(c => `<option value="${c.COMBUSTIBLE_ID}">${c.NOMBRE}</option>`).join('');
    }

    const selTrac = document.getElementById('pub-traccion');
    if (selTrac) {
      selTrac.innerHTML = '<option value="">Selecciona tracción...</option>' +
        tracciones.map(t => `<option value="${t.TRACCION_ID}">${t.CODIGO}</option>`).join('');
    }

    this.state.pubFotos = [];
    this.renderPubFotosPreview();
  },

  onPubMarcaChange() {
    const marcaId = document.getElementById('pub-marca').value;
    const selModelo = document.getElementById('pub-modelo');
    if (!selModelo) return;

    if (!marcaId) {
      selModelo.innerHTML = '<option value="">Primero elija una marca...</option>';
      return;
    }

    const modelosFiltrados = (this.state.catalogos?.modelos || []).filter(m => m.MARCA_ID == marcaId);
    selModelo.innerHTML = '<option value="">Selecciona modelo...</option>' +
      modelosFiltrados.map(mo => `<option value="${mo.MODELO_ID}">${mo.NOMBRE}</option>`).join('');
  },

  // Helper para redimensionar y comprimir imágenes en el cliente (evita payloads pesados a Vercel)
  compressImage(file, maxWidth = 1000, maxHeight = 750, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            if (width / height > maxWidth / maxHeight) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          let mime = 'image/jpeg';
          if (file.type === 'image/png') mime = 'image/png';
          else if (file.type === 'image/webp') mime = 'image/webp';

          const compressedBase64 = canvas.toDataURL(mime, quality);
          resolve({
            nombreArchivo: file.name,
            tipoMime: mime,
            base64: compressedBase64
          });
        };
        img.onerror = () => reject(new Error('No se pudo decodificar la imagen seleccionada.'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsDataURL(file);
    });
  },

  async handlePhotoUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const statusEl = document.getElementById('fotos-count-status');
    if (statusEl) {
      statusEl.innerHTML = '<span class="text-blue-600 font-bold"><i class="fa-solid fa-circle-notch fa-spin"></i> Optimizando fotografías para la web...</span>';
    }

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressed = await this.compressImage(file);
        this.state.pubFotos.push(compressed);
      }
      this.renderPubFotosPreview();
      this.showToast('Fotografías optimizadas y listas para publicación.', 'success');
    } catch (e) {
      console.error('Error optimizando foto:', e);
      this.showToast('Error al optimizar una o más imágenes.', 'error');
    }
  },

  // Cargar 5 fotos demo para facilidad de prueba del docente con autos reales
  async loadDemoPhotos() {
    this.state.pubFotos = [];
    this.showToast('Cargando 5 fotografías reales de vehículos...', 'info');

    const realCars = [
      { label: 'Frontal', url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&auto=format&fit=crop&q=80' },
      { label: 'Angulo', url: 'https://images.unsplash.com/photo-1559416523-140ddc3d238c?w=600&auto=format&fit=crop&q=80' },
      { label: 'Lateral', url: 'https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=600&auto=format&fit=crop&q=80' },
      { label: 'Posterior', url: 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=600&auto=format&fit=crop&q=80' },
      { label: 'Interior', url: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=600&auto=format&fit=crop&q=80' }
    ];

    try {
      for (let i = 0; i < realCars.length; i++) {
        const item = realCars[i];
        const res = await fetch(item.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        this.state.pubFotos.push({
          nombreArchivo: `real_${item.label.toLowerCase()}_${i + 1}.jpg`,
          tipoMime: 'image/jpeg',
          base64: base64
        });
      }

      this.renderPubFotosPreview();
      this.showToast('5 fotografías reales cargadas exitosamente.', 'success');
    } catch (err) {
      console.warn('Fallback a fotos sintéticas generadas por canvas:', err);
      const colors = [
        { r: 37, g: 99, b: 235, label: 'Frontal' },
        { r: 16, g: 185, b: 129, label: 'Lateral Izq.' },
        { r: 245, g: 158, b: 11, label: 'Posterior' },
        { r: 239, g: 68, b: 68, label: 'Interior' },
        { r: 147, g: 51, b: 234, label: 'Motor' }
      ];

      colors.forEach((c, idx) => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = `rgb(${c.r}, ${c.g}, ${c.b})`;
        ctx.fillRect(0, 0, 600, 400);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 10;
        ctx.strokeRect(10, 10, 580, 380);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Foto #${idx + 1} — ${c.label}`, 300, 200);
        ctx.font = '16px Inter, sans-serif';
        ctx.fillText('Subastas Copart GT — Verificado', 300, 240);

        this.state.pubFotos.push({
          nombreArchivo: `demo_foto_${idx + 1}.png`,
          tipoMime: 'image/png',
          base64: canvas.toDataURL('image/png')
        });
      });

      this.renderPubFotosPreview();
      this.showToast('5 fotos de demostración generadas.', 'info');
    }
  },

  removePubFoto(idx) {
    this.state.pubFotos.splice(idx, 1);
    this.renderPubFotosPreview();
  },

  renderPubFotosPreview() {
    const container = document.getElementById('fotos-preview-container');
    const statusEl = document.getElementById('fotos-count-status');
    if (!container || !statusEl) return;

    const total = this.state.pubFotos.length;
    if (total >= 5) {
      statusEl.innerHTML = `<span class="text-green-700 font-bold"><i class="fa-solid fa-circle-check"></i> ${total} fotografías seleccionadas (Cumple con el mínimo de 5).</span>`;
    } else {
      statusEl.innerHTML = `<span class="text-red-600 font-bold"><i class="fa-solid fa-triangle-exclamation"></i> ${total} de 5 fotografías mínimas requeridas.</span>`;
    }

    container.innerHTML = this.state.pubFotos.map((f, idx) => `
      <div class="relative group rounded-lg overflow-hidden border border-slate-200 aspect-video bg-slate-100">
        <img src="${f.base64}" alt="${f.nombreArchivo}" class="w-full h-full object-cover">
        <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
          <button type="button" onclick="app.removePubFoto(${idx})" class="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center text-xs shadow-md hover:bg-red-700">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
        <span class="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1 rounded font-semibold">#${idx + 1}</span>
      </div>
    `).join('');
  },

  async submitPublicacion(e) {
    e.preventDefault();
    if (!this.state.user) {
      this.showToast('Debes iniciar sesión para publicar.', 'error');
      return;
    }

    if (this.state.pubFotos.length < 5) {
      this.showToast('Se requieren al menos 5 fotografías por vehículo según la rúbrica.', 'warning');
      return;
    }

    const btn = document.getElementById('btn-submit-publicar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Publicando subasta...';

    const anio = document.getElementById('pub-anio').value;
    const tipoArticuloId = document.getElementById('pub-tipo').value;
    const marcaId = document.getElementById('pub-marca').value;
    const modeloId = document.getElementById('pub-modelo').value;
    const motor = document.getElementById('pub-motor').value;
    const numeroCilindros = document.getElementById('pub-cilindros').value;
    const transmisionId = document.getElementById('pub-transmision').value;
    const combustibleId = document.getElementById('pub-combustible').value;
    const traccionId = document.getElementById('pub-traccion').value;
    const nivelDanoId = document.getElementById('pub-dano').value;
    const precioBase = document.getElementById('pub-precio-base').value;
    const duracionHoras = parseInt(document.getElementById('pub-duracion').value, 10);

    const ahora = new Date();
    const fin = new Date(ahora.getTime() + duracionHoras * 3600 * 1000);

    const payload = {
      anio: parseInt(anio, 10),
      tipoArticuloId: parseInt(tipoArticuloId, 10),
      marcaId: parseInt(marcaId, 10),
      modeloId: parseInt(modeloId, 10),
      motor,
      numeroCilindros: parseInt(numeroCilindros, 10),
      transmisionId: parseInt(transmisionId, 10),
      combustibleId: parseInt(combustibleId, 10),
      traccionId: parseInt(traccionId, 10),
      nivelDanoId: parseInt(nivelDanoId, 10),
      precioBase: parseFloat(precioBase),
      inicioUtc: ahora.toISOString(),
      finUtc: fin.toISOString(),
      fotos: this.state.pubFotos
    };

    try {
      const res = await fetch('/api/vehiculos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.state.token}`
        },
        body: JSON.stringify(payload)
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch (_) {
        throw new Error(text || `Error del servidor HTTP ${res.status}`);
      }

      if (json && json.status === 'success') {
        this.showToast('¡Vehículo y subasta publicados exitosamente!', 'success');
        document.getElementById('form-publicar').reset();
        this.state.pubFotos = [];
        this.navigate('detalle', { id: json.data.subastaId });
      } else {
        this.showToast((json && json.message) || 'Error al publicar vehículo.', 'error');
      }
    } catch (err) {
      console.error('Error al publicar vehículo:', err);
      this.showToast(err.message || 'Error al procesar la publicación.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Publicar Vehículo';
    }
  },

  // ==========================================
  // MIS VEHÍCULOS / GESTIÓN Y EDICIÓN
  // ==========================================
  async loadMisVehiculos() {
    const list = document.getElementById('mis-vehiculos-list');
    if (!list) return;

    list.innerHTML = `
      <div class="bg-white p-8 rounded-xl text-center border border-slate-200">
        <i class="fa-solid fa-circle-notch fa-spin text-2xl text-blue-600 mb-2"></i>
        <p class="text-xs text-slate-500">Cargando tus publicaciones...</p>
      </div>
    `;

    try {
      const search = document.getElementById('mis-search')?.value.trim() || '';
      const query = search ? `?search=${encodeURIComponent(search)}` : '';

      const res = await fetch(`/api/vehiculos/mis-vehiculos${query}`, {
        headers: { 'Authorization': `Bearer ${this.state.token}` }
      });
      const json = await res.json();

      if (json.status === 'success') {
        if (json.data.length === 0) {
          list.innerHTML = `
            <div class="bg-white p-12 rounded-xl text-center border border-slate-200">
              <i class="fa-solid fa-car text-3xl text-slate-300 mb-3"></i>
              <h4 class="text-sm font-bold text-slate-700">No tienes vehículos publicados</h4>
              <p class="text-xs text-slate-400 mt-1 mb-4">Empieza publicando tu primer vehículo para participar en subastas.</p>
              <button onclick="app.navigate('publicar')" class="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg">
                Publicar Ahora
              </button>
            </div>
          `;
          return;
        }

        list.innerHTML = json.data.map(v => `
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-blue-600 uppercase">Vehículo #${v.VEHICULO_ID}</span>
                <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold">${v.TIPO_ARTICULO}</span>
                <span class="text-xs px-2 py-0.5 rounded font-semibold ${v.SUBASTA_ESTADO === 'PUBLICADA' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}">
                  ${v.SUBASTA_ESTADO || 'Sin subasta'}
                </span>
              </div>
              <h3 class="text-base font-bold text-slate-900">${this.escapeHtml(v.ANIO)} ${this.escapeHtml(v.MARCA)} ${this.escapeHtml(v.MODELO)}</h3>
              <p class="text-xs text-slate-500">
                ${this.escapeHtml(v.MOTOR)} • ${this.escapeHtml(v.NUMERO_CILINDROS)} Cil. • ${this.escapeHtml(v.TRANSMISION)} • ${this.escapeHtml(v.COMBUSTIBLE)} • ${this.escapeHtml(v.TRACCION)}
              </p>
              <p class="text-xs text-slate-400 mt-1">
                Precio Base: <strong>Q. ${Number(v.PRECIO_BASE).toLocaleString('es-GT', { minimumFractionDigits: 2 })}</strong> |
                Pujas: <strong>${v.TOTAL_PUJAS}</strong> |
                Mayor oferta: <strong>${v.OFERTA_MAXIMA ? `Q. ${Number(v.OFERTA_MAXIMA).toLocaleString('es-GT', { minimumFractionDigits: 2 })}` : 'Ninguna'}</strong>
              </p>
            </div>

            <div class="flex items-center gap-2 w-full md:w-auto justify-end">
              <button onclick="app.openEditModal(${JSON.stringify(v).replace(/"/g, '&quot;')})" class="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition flex items-center gap-1.5">
                <i class="fa-solid fa-pen-to-square"></i> Editar Ficha
              </button>
              ${v.SUBASTA_ID ? `
                <button onclick="app.navigate('detalle', { id: ${v.SUBASTA_ID} })" class="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition flex items-center gap-1.5">
                  <i class="fa-solid fa-eye"></i> Ver Subasta
                </button>
              ` : ''}
            </div>
          </div>
        `).join('');
      }
    } catch (e) {
      console.error('Error cargando mis vehículos:', e);
    }
  },

  openEditModal(vehiculo) {
    if (!this.state.catalogos) return;
    const { transmisiones, combustibles, tracciones } = this.state.catalogos;

    document.getElementById('edit-vehiculo-id').value = vehiculo.VEHICULO_ID;
    document.getElementById('edit-vehiculo-subtitulo').textContent = `${vehiculo.ANIO} ${vehiculo.MARCA} ${vehiculo.MODELO} (ID: ${vehiculo.VEHICULO_ID})`;
    document.getElementById('edit-motor').value = vehiculo.MOTOR;
    document.getElementById('edit-cilindros').value = vehiculo.NUMERO_CILINDROS;

    const selTrans = document.getElementById('edit-transmision');
    selTrans.innerHTML = transmisiones.map(t => `<option value="${t.TRANSMISION_ID}" ${t.TRANSMISION_ID == vehiculo.TRANSMISION_ID ? 'selected' : ''}>${t.NOMBRE}</option>`).join('');

    const selComb = document.getElementById('edit-combustible');
    selComb.innerHTML = combustibles.map(c => `<option value="${c.COMBUSTIBLE_ID}" ${c.COMBUSTIBLE_ID == vehiculo.COMBUSTIBLE_ID ? 'selected' : ''}>${c.NOMBRE}</option>`).join('');

    const selTrac = document.getElementById('edit-traccion');
    selTrac.innerHTML = tracciones.map(t => `<option value="${t.TRACCION_ID}" ${t.TRACCION_ID == vehiculo.TRACCION_ID ? 'selected' : ''}>${t.CODIGO}</option>`).join('');

    document.getElementById('edit-dano').value = vehiculo.NIVEL_DANO_ID;

    this.openModal('modal-editar');
  },

  async submitEdicionVehiculo(e) {
    e.preventDefault();
    const id = document.getElementById('edit-vehiculo-id').value;
    const motor = document.getElementById('edit-motor').value;
    const numeroCilindros = parseInt(document.getElementById('edit-cilindros').value, 10);
    const transmisionId = parseInt(document.getElementById('edit-transmision').value, 10);
    const combustibleId = parseInt(document.getElementById('edit-combustible').value, 10);
    const traccionId = parseInt(document.getElementById('edit-traccion').value, 10);
    const nivelDanoId = parseInt(document.getElementById('edit-dano').value, 10);

    try {
      const res = await fetch(`/api/vehiculos/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.state.token}`
        },
        body: JSON.stringify({
          motor,
          numeroCilindros,
          transmisionId,
          combustibleId,
          traccionId,
          nivelDanoId
        })
      });
      const json = await res.json();

      if (json.status === 'success') {
        this.showToast('Ficha técnica actualizada exitosamente.', 'success');
        this.closeModal('modal-editar');
        this.loadMisVehiculos();
      } else {
        this.showToast(json.message || 'Error al actualizar', 'error');
      }
    } catch (err) {
      this.showToast('Error de red al actualizar ficha técnica', 'error');
    }
  },

  // Modales
  openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('hidden');
  },

  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('hidden');
  },

  // Notificaciones Toast
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `p-3.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2.5 pointer-events-auto fade-in transition-all ${
      type === 'success' ? 'bg-emerald-600 text-white' :
      type === 'error' ? 'bg-red-600 text-white' :
      type === 'warning' ? 'bg-amber-500 text-white' :
      'bg-slate-800 text-white'
    }`;

    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-triangle-exclamation';
    if (type === 'warning') icon = 'fa-bell';

    toast.innerHTML = `<i class="fa-solid ${icon} text-sm"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
};

// Arrancar aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  window.app = app;
  app.init();
});
