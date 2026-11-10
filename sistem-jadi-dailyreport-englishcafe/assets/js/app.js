/* ==========================================================================
   ENGLISH CAFE - DAILY REPORT SYSTEM (PRODUCTION CLIENT ENGINE)
   Full-stack REST API client, auth guard, deferred validation, light-dismiss
   <dialog>, sortable tables with view transitions, image upload optimization,
   CSV export, and print support.
   ========================================================================== */

(function () {
  'use strict';

  const TOKEN_KEY = 'ec_auth_token';
  const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const MONTHS_ID = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  // ========================================================================
  // 1. UTILITIES: HTML ESCAPE, TOASTS, DATE FORMAT, IMAGE OPTIMIZER, CSV
  // ========================================================================
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stripRelativeUpload(url) {
    if (!url) return '';
    return url.startsWith('/') ? url.slice(1) : url;
  }

  function resolveAssetUrl(url) {
    if (!url) return '';
    if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) return url;
    const normalized = url.startsWith('/') ? url : `/${url}`;
    if (normalized.startsWith('/uploads/') && resolvedApiBase) {
      return `${resolvedApiBase}${normalized}`;
    }
    if (window.location.protocol === 'file:') {
      return normalized.slice(1);
    }
    return normalized;
  }

  function getToastContainer() {
    let container = document.getElementById('ecToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'ecToastContainer';
      container.className = 'ec-toast-container';
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(type, title, message, duration = 4200) {
    const container = getToastContainer();
    const toast = document.createElement('div');
    const typeClass = type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : 'toast-warning';
    const iconClass = type === 'success'
      ? 'bi-check-circle-fill text-success'
      : type === 'error'
        ? 'bi-x-octagon-fill text-danger'
        : 'bi-exclamation-triangle-fill text-warning';

    toast.className = `ec-toast ${typeClass}`;
    toast.innerHTML = `
      <i class="bi ${iconClass} ec-toast-icon" aria-hidden="true"></i>
      <div class="flex-grow-1">
        <div class="ec-toast-title">${escapeHtml(title)}</div>
        <p class="ec-toast-desc">${escapeHtml(message)}</p>
      </div>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-6px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 220);
    }, duration);
  }

  function setAlertBanner(box, type, htmlMessage) {
    if (!box) return;
    if (!htmlMessage) {
      box.innerHTML = '';
      return;
    }
    const icon = type === 'error'
      ? 'bi-x-octagon-fill'
      : type === 'success'
        ? 'bi-check-circle-fill'
        : 'bi-exclamation-triangle-fill';
    box.innerHTML = `
      <div class="ec-alert-banner ${type}" role="alert">
        <i class="bi ${icon} mt-1 flex-shrink-0" aria-hidden="true"></i>
        <div>${htmlMessage}</div>
      </div>
    `;
  }

  function getTodayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatDateIndoClient(dateIso) {
    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      return { main: dateIso || '-', day: '', full: dateIso || '-', timestamp: 0 };
    }
    const [y, m, d] = dateIso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const day = DAYS_ID[dt.getUTCDay()];
    const main = `${d} ${MONTHS_ID[m - 1]} ${y}`;
    return { main, day, full: `${day}, ${main}`, timestamp: dt.getTime() };
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
      reader.readAsDataURL(file);
    });
  }

  async function optimizeImageFile(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      throw new Error('File yang dipilih harus berupa gambar (JPG, PNG, WEBP, atau SVG).');
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new Error('Ukuran file terlalu besar (maksimal 8 MB sebelum kompresi).');
    }

    const rawUrl = await readFileAsDataUrl(file);
    // Skip canvas re-encoding for SVG, GIF, or already compact files (< 350 KB)
    if (file.type === 'image/svg+xml' || file.type === 'image/gif' || file.size <= 350 * 1024) {
      return {
        fileName: file.name,
        dataUrl: rawUrl,
        sizeLabel: formatBytes(file.size)
      };
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1280;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve({ fileName: file.name, dataUrl: rawUrl, sizeLabel: formatBytes(file.size) });
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressedUrl = canvas.toDataURL('image/jpeg', 0.82);
        const approxBytes = Math.round((compressedUrl.length * 3) / 4);
        resolve({
          fileName: file.name.replace(/\.[^.]+$/, '.jpg'),
          dataUrl: compressedUrl,
          sizeLabel: formatBytes(approxBytes)
        });
      };
      img.onerror = () => resolve({ fileName: file.name, dataUrl: rawUrl, sizeLabel: formatBytes(file.size) });
      img.src = rawUrl;
    });
  }

  function downloadCsvFile(filename, headers, rows) {
    const csvEscape = (v) => {
      const s = String(v ?? '').replace(/\r?\n/g, ' ');
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [headers.map(csvEscape).join(',')];
    rows.forEach((row) => lines.push(row.map(csvEscape).join(',')));
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 100);
  }

  function defaultAvatarSvg(size = 34) {
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <circle cx="60" cy="44" r="21" fill="#8D5B4C"/>
        <path d="M18 112C18 89.9086 36.804 72 60 72C83.196 72 102 89.9086 102 112" fill="#8D5B4C"/>
      </svg>
    `;
  }

  function renderAvatarInto(containerEl, avatarUrl, altName, svgSize = 108) {
    if (!containerEl) return;
    if (avatarUrl) {
      containerEl.innerHTML = `<img src="${escapeHtml(resolveAssetUrl(avatarUrl))}" alt="${escapeHtml(altName || 'Foto Profil')}" />`;
    } else {
      containerEl.innerHTML = defaultAvatarSvg(svgSize);
    }
  }

  // ========================================================================
  // 2. API CLIENT, AUTO-DISCOVERY & AUTH GUARD
  // ========================================================================
  let resolvedApiBase = '';
  let cachedHealth = null;
  let apiDiscoveryPromise = null;

  function buildServerOfflineMessage() {
    if (window.location.protocol === 'file:') {
      return 'Server backend belum aktif karena file dibuka langsung (file://). Klik dua kali MULAI-SISTEM.bat atau jalankan "node server.js", lalu buka http://localhost:3000 (atau klik Masuk lagi setelah server menyala).';
    }
    return 'Server backend tidak merespons. Pastikan MULAI-SISTEM.bat / "node server.js" sedang berjalan atau periksa koneksi jaringan Anda.';
  }

  async function probeHealthEndpoint(base) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 1600) : null;
    try {
      const res = await fetch(`${base}/api/health`, {
        method: 'GET',
        cache: 'no-store',
        credentials: base && window.location.protocol === 'file:' ? 'omit' : 'same-origin',
        ...(controller ? { signal: controller.signal } : {})
      });
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return null;
      const json = await res.json();
      return json && json.ok ? json : null;
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function ensureApiReady(forceRetry = false) {
    if (cachedHealth && !forceRetry) return cachedHealth;
    if (apiDiscoveryPromise && !forceRetry) return apiDiscoveryPromise;

    apiDiscoveryPromise = (async () => {
      const candidates = [];
      if (window.location.protocol !== 'file:') {
        candidates.push('');
      }
      // Fallback to local Node server on port 3000 when opened via file:// or VS Code Live Server
      if (window.location.protocol === 'file:' || (window.location.hostname === 'localhost' && window.location.port !== '3000') || (window.location.hostname === '127.0.0.1' && window.location.port !== '3000')) {
        candidates.push('http://localhost:3000', 'http://127.0.0.1:3000');
      }

      for (const base of candidates) {
        const health = await probeHealthEndpoint(base);
        if (health) {
          resolvedApiBase = base;
          cachedHealth = health;
          return health;
        }
      }
      resolvedApiBase = '';
      cachedHealth = null;
      apiDiscoveryPromise = null;
      return null;
    })();

    return apiDiscoveryPromise;
  }

  function getAuthToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }

  function setAuthToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Ignore storage restrictions
    }
  }

  function absorbTokenFromHash() {
    if (!window.location.hash || !window.location.hash.includes('ec_token=')) return;
    const match = window.location.hash.match(/ec_token=([^&]+)/);
    if (match && match[1]) {
      try {
        setAuthToken(decodeURIComponent(match[1]));
      } catch {
        // Ignore malformed token hash
      }
      if (typeof history.replaceState === 'function') {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }
  absorbTokenFromHash();

  function navigateAfterLogin(targetFile, token) {
    if (resolvedApiBase) {
      window.location.href = `${resolvedApiBase}/${targetFile}#ec_token=${encodeURIComponent(token || '')}`;
      return;
    }
    window.location.href = targetFile;
  }

  async function apiFetch(url, options = {}) {
    const health = await ensureApiReady(!cachedHealth);
    if (!health) {
      throw new Error(buildServerOfflineMessage());
    }

    const token = getAuthToken();
    const targetUrl = `${resolvedApiBase}${url}`;
    const headers = {
      ...(options.body && typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    let res;
    try {
      res = await fetch(targetUrl, {
        ...options,
        credentials: resolvedApiBase && window.location.protocol === 'file:' ? 'omit' : 'same-origin',
        headers
      });
    } catch {
      cachedHealth = null;
      apiDiscoveryPromise = null;
      throw new Error(buildServerOfflineMessage());
    }

    const contentType = res.headers.get('content-type') || '';
    let data = {};
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
        data = { ok: res.ok };
      }
    } else if (!res.ok) {
      throw new Error(buildServerOfflineMessage());
    }

    if (!res.ok) {
      const err = new Error(data.message || `Permintaan gagal (HTTP ${res.status}).`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function fetchCurrentUser() {
    try {
      const data = await apiFetch('/api/auth/me');
      return data.user || null;
    } catch {
      return null;
    }
  }

  async function requireAuth(expectedRole) {
    const loginUrl = expectedRole === 'admin' ? '07-login-admin.html' : '02-login-peserta.html';
    const user = await fetchCurrentUser();
    if (!user) {
      setAuthToken('');
      window.location.replace(loginUrl);
      return null;
    }
    if (expectedRole && user.role !== expectedRole) {
      window.location.replace(user.role === 'admin' ? '08-admin-peserta.html' : '04-laporan-peserta.html');
      return null;
    }
    hydrateSidebarUser(user);
    return user;
  }

  function hydrateSidebarUser(user) {
    if (!user) return;
    const nameEl = document.getElementById('sidebarUserName');
    const emailEl = document.getElementById('sidebarUserEmail');
    const avatarEl = document.getElementById('sidebarUserAvatar');

    if (nameEl) {
      nameEl.textContent = user.role === 'admin' ? (user.nama || 'Admin') : (user.namaPanggilan || user.nama || 'Peserta');
    }
    if (emailEl) {
      emailEl.textContent = user.email || '-';
    }
    if (avatarEl && user.role === 'peserta') {
      renderAvatarInto(avatarEl, user.avatarUrl, user.nama, 34);
    }

    if (user.role === 'peserta' && user.stats) {
      const needFix = (user.stats.revisi || 0) + (user.stats.ditolak || 0);
      const badge = document.getElementById('sidebarRevisiBadge');
      if (badge) {
        badge.textContent = String(needFix);
        badge.classList.toggle('d-none', needFix === 0);
      }
    }

    if (user.role === 'admin') {
      updateAdminPendingBadge(user.pendingTotal || 0);
    }
  }

  function updateAdminPendingBadge(count) {
    const badge = document.getElementById('adminSidebarPendingBadge');
    if (!badge) return;
    badge.textContent = String(count);
    badge.classList.toggle('d-none', count <= 0);
  }

  function setupGlobalChrome() {
    // Mobile sidebar drawer
    const mobileBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');

    if (mobileBtn && sidebar && backdrop) {
      const toggleSidebar = (open) => {
        sidebar.classList.toggle('show', open);
        backdrop.classList.toggle('show', open);
      };
      mobileBtn.addEventListener('click', () => toggleSidebar(!sidebar.classList.contains('show')));
      backdrop.addEventListener('click', () => toggleSidebar(false));
    }

    // Password toggle with aria-pressed
    document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.ec-input-group');
        const input = group ? group.querySelector('input') : null;
        const icon = btn.querySelector('i');
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', show ? 'true' : 'false');
        btn.setAttribute('aria-label', show ? 'Sembunyikan Password' : 'Tampilkan Password');
        if (icon) {
          icon.classList.toggle('bi-eye-slash', !show);
          icon.classList.toggle('bi-eye', show);
        }
      });
    });

    // Logout buttons
    document.querySelectorAll('[data-logout-btn]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiFetch('/api/auth/logout', { method: 'POST' });
        } catch {
          // Proceed regardless
        }
        setAuthToken('');
        const isAdminPage = window.location.pathname.includes('admin');
        window.location.href = isAdminPage ? '07-login-admin.html' : '02-login-peserta.html';
      });
    });
  }

  // ========================================================================
  // 3. ACCESSIBLE DEFERRED VALIDATION (WeakMap + ARIA Live Announcer)
  // ========================================================================
  let globalAnnouncer = null;
  let announceTimer = null;

  function getAnnouncer() {
    if (!globalAnnouncer) {
      globalAnnouncer = document.createElement('div');
      globalAnnouncer.setAttribute('aria-live', 'polite');
      globalAnnouncer.className = 'visually-hidden';
      document.body.appendChild(globalAnnouncer);
    }
    return globalAnnouncer;
  }

  function syncAriaErrorLink(el, errorMsg) {
    const errId = el.dataset.error;
    const errBox = errId ? document.getElementById(errId) : null;
    if (errBox) {
      if (errorMsg) {
        errBox.innerHTML = `<i class="bi bi-exclamation-circle-fill" aria-hidden="true"></i><span>Error: ${escapeHtml(errorMsg)}</span>`;
        errBox.classList.add('visible');
      } else {
        errBox.innerHTML = '';
        errBox.classList.remove('visible');
      }
    }

    if (errId) {
      const ids = (el.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter((id) => id && id !== errId);
      if (errorMsg) ids.push(errId);
      if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
      else el.removeAttribute('aria-describedby');
    }
    el.setAttribute('aria-invalid', errorMsg ? 'true' : 'false');
  }

  function createFormValidator(form, customValidators = {}) {
    if (!form) return null;
    const dirtyState = new WeakMap();
    const announcer = getAnnouncer();

    const getControlMessage = (control) => {
      if (typeof customValidators[control.id] === 'function') {
        const customMsg = customValidators[control.id](control, form);
        control.setCustomValidity(customMsg || '');
      } else {
        control.setCustomValidity('');
      }

      if (control.validity.valid) return '';
      if (control.validity.customError) return control.validationMessage;
      if (control.validity.valueMissing) return 'Kolom ini wajib diisi.';
      if (control.validity.typeMismatch && control.type === 'email') {
        return 'Masukkan alamat email yang valid (contoh: nama@gmail.com).';
      }
      if (control.validity.patternMismatch) {
        return control.id.includes('Telp') || control.id.includes('Phone')
          ? 'Nomor telepon harus terdiri dari 10–15 digit angka.'
          : 'Format isian belum sesuai ketentuan.';
      }
      if (control.validity.tooShort) {
        return `Minimal terdiri dari ${control.minLength} karakter.`;
      }
      return control.validationMessage || 'Isian belum valid.';
    };

    const applyControlState = (control, announce = false) => {
      if (!control.matches || !control.matches('input, select, textarea') || control.type === 'file') return true;
      const msg = getControlMessage(control);
      const isValid = !msg;

      control.classList.toggle('is-invalid-field', !isValid);
      control.classList.toggle('user-invalid-fallback', !isValid);
      control.classList.toggle('is-valid-field', isValid);
      syncAriaErrorLink(control, msg);

      if (!isValid && announce) {
        const label = control.labels?.[0]?.textContent?.replace(/\*/g, '').trim() || control.name || 'Kolom';
        clearTimeout(announceTimer);
        announcer.textContent = '';
        announceTimer = setTimeout(() => {
          announcer.textContent = `${label}: ${msg}`;
        }, 500);
      }
      return isValid;
    };

    // Start every field at aria-invalid="false"
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.type !== 'file') el.setAttribute('aria-invalid', 'false');
    });

    form.addEventListener('input', (e) => {
      const target = e.target;
      if (!target.matches?.('input, select, textarea')) return;
      const state = dirtyState.get(target) || { hasInteracted: false, hasBlurred: false };
      state.hasInteracted = true;
      dirtyState.set(target, state);
      if (state.hasBlurred) {
        applyControlState(target, false);
      }
    });

    form.addEventListener('change', (e) => {
      const target = e.target;
      if (!target.matches?.('input, select, textarea')) return;
      const state = dirtyState.get(target) || { hasInteracted: false, hasBlurred: false };
      state.hasInteracted = true;
      state.hasBlurred = true;
      dirtyState.set(target, state);
      applyControlState(target, true);
    });

    form.addEventListener('blur', (e) => {
      const target = e.target;
      if (!target.matches?.('input, select, textarea')) return;
      const state = dirtyState.get(target) || { hasInteracted: false, hasBlurred: false };
      state.hasBlurred = true;
      dirtyState.set(target, state);
      if (state.hasInteracted) {
        applyControlState(target, true);
      }
    }, true);

    return {
      validateAll() {
        let firstInvalid = null;
        form.querySelectorAll('input, select, textarea').forEach((control) => {
          if (control.type === 'file' || control.disabled) return;
          dirtyState.set(control, { hasInteracted: true, hasBlurred: true });
          const ok = applyControlState(control, false);
          if (!ok && !firstInvalid) firstInvalid = control;
        });
        if (firstInvalid) {
          firstInvalid.focus();
          return false;
        }
        return true;
      },
      clearAll() {
        form.querySelectorAll('input, select, textarea').forEach((control) => {
          dirtyState.delete(control);
          control.setCustomValidity('');
          control.classList.remove('is-invalid-field', 'user-invalid-fallback', 'is-valid-field');
          control.setAttribute('aria-invalid', 'false');
          syncAriaErrorLink(control, '');
        });
      }
    };
  }

  // ========================================================================
  // 4. LIGHT-DISMISS DIALOG POLYFILL & SORTABLE TABLES ENGINE
  // ========================================================================
  function initLightDismissDialogs() {
    document.querySelectorAll('dialog.ec-dialog').forEach((dialog) => {
      if ('closedBy' in HTMLDialogElement.prototype) return;
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );
        if (!isDialogContent) dialog.close('cancel');
      });
    });
  }

  function initSortableTable(tableEl, statusEl) {
    if (!tableEl || !tableEl.tHead || !tableEl.tBodies[0]) return;
    const collator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' });
    const tbody = tableEl.tBodies[0];

    const performSort = (button) => {
      const th = button.closest('th');
      if (!th) return;
      const direction = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
      const factor = direction === 'ascending' ? 1 : -1;
      const colIndex = th.cellIndex;
      const colType = th.dataset.type || 'text';

      for (const header of tableEl.tHead.rows[0].cells) {
        header.removeAttribute('aria-sort');
      }
      th.setAttribute('aria-sort', direction);

      const rows = [...tbody.rows].filter((r) => !r.dataset.emptyRow);
      if (rows.length === 0) return;

      const valueOf = (row) => {
        const cell = row.cells[colIndex];
        if (!cell) return '';
        return cell.dataset.value ?? cell.textContent.trim();
      };

      rows.sort((a, b) => {
        const va = valueOf(a);
        const vb = valueOf(b);
        if (colType === 'number') {
          return factor * (Number(va || 0) - Number(vb || 0));
        }
        return factor * collator.compare(va, vb);
      });

      const reorderRows = () => {
        for (const row of rows) {
          if (typeof tbody.moveBefore === 'function') tbody.moveBefore(row, null);
          else tbody.appendChild(row);
        }
      };

      if (typeof tableEl.startViewTransition === 'function') {
        try {
          tableEl.startViewTransition(reorderRows);
        } catch {
          reorderRows();
        }
      } else {
        reorderRows();
      }

      if (statusEl) {
        const labelText = button.textContent.trim();
        const dirText = direction === 'ascending' ? 'urutan naik' : 'urutan turun';
        statusEl.textContent = `Tabel diurutkan menurut ${labelText} (${dirText}), ${rows.length} baris.`;
      }
    };

    tableEl.addEventListener('command', (event) => {
      if (event.command !== '--sort' || !event.source) return;
      performSort(event.source);
    });

    // Fallback for browsers without Invoker Commands API
    if (!('commandForElement' in HTMLButtonElement.prototype)) {
      tableEl.querySelectorAll('thead th > button[command="--sort"]').forEach((btn) => {
        btn.addEventListener('click', () => performSort(btn));
      });
    }
  }

  function openProofModal(title, dateText, imageUrl, fileName) {
    const modalEl = document.getElementById('proofPreviewModal');
    if (!modalEl) return;
    const titleEl = document.getElementById('proofModalTitle');
    const dateEl = document.getElementById('proofModalDate');
    const imgEl = document.getElementById('proofModalImg');
    const fileEl = document.getElementById('proofModalFilename');
    const dlEl = document.getElementById('proofModalDownload');

    const finalImgUrl = resolveAssetUrl(imageUrl || '/assets/img/samples/rapat.svg');
    if (titleEl) titleEl.textContent = title || 'Bukti Pekerjaan';
    if (dateEl) dateEl.textContent = dateText || '-';
    if (imgEl) {
      imgEl.src = finalImgUrl;
      imgEl.alt = `Bukti pekerjaan: ${title || fileName || 'Dokumentasi'}`;
    }
    if (fileEl) fileEl.textContent = fileName || 'Dokumentasi_Kegiatan.jpg';
    if (dlEl) {
      dlEl.href = finalImgUrl;
      dlEl.download = fileName || 'bukti-laporan-englishcafe.jpg';
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }

  // ========================================================================
  // 5. PORTAL LANDING PAGE (index.html)
  // ========================================================================
  async function checkAuthServerBanner(alertBox) {
    if (!alertBox) return;
    const health = await ensureApiReady();
    if (!health && !alertBox.innerHTML.trim()) {
      setAlertBanner(
        alertBox,
        'warning',
        `<strong>Server Database Belum Aktif.</strong> Jangan membuka halaman langsung dari File Explorer (<code>file://</code>). Jalankan <strong><code>MULAI-SISTEM.bat</code></strong> atau <code>node server.js</code> lalu buka <a href="http://localhost:3000" class="fw-bold text-decoration-underline" style="color: #92400e;">http://localhost:3000</a> sebelum login.`
      );
    }
  }

  async function initPortalLandingPage() {
    const activeBanner = document.getElementById('portalActiveSession');
    const serverBadge = document.getElementById('portalServerBadge');
    const serverWarning = document.getElementById('portalServerWarning');
    if (!activeBanner && !serverBadge) return;

    const health = await ensureApiReady();
    if (serverBadge) {
      if (!health) {
        serverBadge.innerHTML = '<i class="bi bi-exclamation-triangle-fill me-1" style="color: #dc2626;" aria-hidden="true"></i>Server Belum Aktif';
        if (serverWarning) serverWarning.classList.remove('d-none');
      } else if (health.persistence === 'redis-kv') {
        serverBadge.innerHTML = '<i class="bi bi-cloud-check-fill me-1" style="color: #16a34a;" aria-hidden="true"></i>Terhubung ke Database Cloud';
      } else if (health.runtime === 'vercel-serverless') {
        serverBadge.innerHTML = '<i class="bi bi-cloud-check-fill me-1" style="color: #16a34a;" aria-hidden="true"></i>Server Vercel Aktif';
      } else {
        serverBadge.innerHTML = '<i class="bi bi-hdd-network-fill me-1" style="color: #16a34a;" aria-hidden="true"></i>Terhubung ke Server Database';
      }
    }

    if (!health || !activeBanner) return;

    const user = await fetchCurrentUser();
    if (!user) return;

    const titleEl = document.getElementById('portalSessionTitle');
    const descEl = document.getElementById('portalSessionDesc');
    const resumeBtn = document.getElementById('portalResumeBtn');
    const logoutBtn = document.getElementById('portalLogoutBtn');

    activeBanner.classList.remove('d-none');
    if (user.role === 'admin') {
      titleEl.textContent = `Anda sudah masuk sebagai Mentor / Admin (${user.nama})`;
      descEl.textContent = 'Klik lanjutkan untuk membuka dashboard pengawasan peserta magang.';
      resumeBtn.href = '08-admin-peserta.html';
    } else {
      titleEl.textContent = `Anda sudah masuk sebagai Peserta (${user.nama})`;
      descEl.textContent = `${user.jenis || 'Magang'} Divisi ${user.divisi || '-'} — ${user.universitas || ''}`;
      resumeBtn.href = '04-laporan-peserta.html';
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await apiFetch('/api/auth/logout', { method: 'POST' });
        } catch {
          // ignore
        }
        setAuthToken('');
        activeBanner.classList.add('d-none');
        showToast('success', 'Sesi Ditutup', 'Anda telah keluar dari sesi aktif.');
      });
    }
  }

  // ========================================================================
  // 6. AUTH PAGES: REGISTER, LOGIN PESERTA, LOGIN ADMIN
  // ========================================================================
  function initRegisterPage() {
    const form = document.getElementById('formRegisterPeserta');
    if (!form) return;

    const validator = createFormValidator(form, {
      regTglAkhir: (el, frm) => {
        const start = frm.querySelector('#regTglMulai')?.value || '';
        if (el.value && start && el.value < start) {
          return 'Tanggal berakhir magang tidak boleh lebih awal dari tanggal mulai.';
        }
        return '';
      },
      regPasswordConfirm: (el, frm) => {
        const pass = frm.querySelector('#regPassword')?.value || '';
        if (el.value && pass && el.value !== pass) {
          return 'Konfirmasi password tidak cocok.';
        }
        return '';
      }
    });

    const alertBox = document.getElementById('registerAlertBox');
    const submitBtn = document.getElementById('btnRegisterSubmit');
    checkAuthServerBanner(alertBox);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setAlertBanner(alertBox, '', '');
      if (!validator.validateAll()) {
        setAlertBanner(alertBox, 'error', 'Mohon lengkapi semua kolom wajib dengan format yang benar.');
        return;
      }

      submitBtn.disabled = true;
      try {
        const payload = {
          nama: document.getElementById('regNama').value.trim(),
          email: document.getElementById('regEmail').value.trim(),
          telepon: document.getElementById('regTelp').value.trim(),
          alamat: document.getElementById('regAlamat').value.trim(),
          universitas: document.getElementById('regInstansi').value.trim(),
          jurusan: document.getElementById('regJurusan').value.trim(),
          tglMulai: document.getElementById('regTglMulai').value,
          tglAkhir: document.getElementById('regTglAkhir').value,
          jenis: document.getElementById('regJenis').value,
          divisi: document.getElementById('regDivisi').value,
          password: document.getElementById('regPassword').value,
          passwordConfirm: document.getElementById('regPasswordConfirm').value
        };

        const res = await apiFetch('/api/auth/register-peserta', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast('success', 'Pendaftaran Berhasil!', res.message || 'Silakan login menggunakan akun Anda.');
        setAlertBanner(alertBox, 'success', 'Pendaftaran berhasil! Mengalihkan ke halaman login peserta...');
        setTimeout(() => {
          window.location.href = `02-login-peserta.html?registered=${encodeURIComponent(payload.email)}`;
        }, 950);
      } catch (err) {
        setAlertBanner(alertBox, 'error', escapeHtml(err.message));
        submitBtn.disabled = false;
      }
    });
  }

  function initLoginPesertaPage() {
    const form = document.getElementById('formLoginPeserta');
    if (!form) return;

    const alertBox = document.getElementById('loginPesertaAlertBox');
    checkAuthServerBanner(alertBox);
    const params = new URLSearchParams(window.location.search);
    const registeredEmail = params.get('registered');
    if (registeredEmail) {
      document.getElementById('loginEmail').value = registeredEmail;
      setAlertBanner(alertBox, 'success', `Akun <strong>${escapeHtml(registeredEmail)}</strong> berhasil dibuat. Silakan masukkan nomor telepon dan password untuk masuk.`);
    }

    const validator = createFormValidator(form);
    const submitBtn = document.getElementById('btnLoginPesertaSubmit');

    const quickFillBtn = document.getElementById('btnQuickFillPeserta');
    if (quickFillBtn) {
      quickFillBtn.addEventListener('click', () => {
        document.getElementById('loginEmail').value = 'angeline@gmail.com';
        document.getElementById('loginPhone').value = '089637491877';
        document.getElementById('loginPassword').value = 'password123';
        validator.clearAll();
        setAlertBanner(alertBox, '', '');
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setAlertBanner(alertBox, '', '');
      if (!validator.validateAll()) return;

      submitBtn.disabled = true;
      try {
        const res = await apiFetch('/api/auth/login-peserta', {
          method: 'POST',
          body: JSON.stringify({
            email: document.getElementById('loginEmail').value.trim(),
            telepon: document.getElementById('loginPhone').value.trim(),
            password: document.getElementById('loginPassword').value
          })
        });
        setAuthToken(res.token || '');
        showToast('success', 'Login Berhasil', `Selamat datang, ${res.user?.nama || 'Peserta'}!`);
        navigateAfterLogin('04-laporan-peserta.html', res.token);
      } catch (err) {
        setAlertBanner(alertBox, 'error', escapeHtml(err.message));
        submitBtn.disabled = false;
      }
    });
  }

  function initLoginAdminPage() {
    const form = document.getElementById('formLoginAdmin');
    if (!form) return;

    const alertBox = document.getElementById('loginAdminAlertBox');
    checkAuthServerBanner(alertBox);
    const validator = createFormValidator(form);
    const submitBtn = document.getElementById('btnLoginAdminSubmit');

    const quickFillBtn = document.getElementById('btnQuickFillAdmin');
    if (quickFillBtn) {
      quickFillBtn.addEventListener('click', () => {
        document.getElementById('adminUsername').value = 'admin';
        document.getElementById('adminPassword').value = 'admin123';
        validator.clearAll();
        setAlertBanner(alertBox, '', '');
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setAlertBanner(alertBox, '', '');
      if (!validator.validateAll()) return;

      submitBtn.disabled = true;
      try {
        const res = await apiFetch('/api/auth/login-admin', {
          method: 'POST',
          body: JSON.stringify({
            username: document.getElementById('adminUsername').value.trim(),
            password: document.getElementById('adminPassword').value
          })
        });
        setAuthToken(res.token || '');
        showToast('success', 'Login Mentor Berhasil', `Selamat datang, ${res.user?.nama || 'Mentor'}.`);
        navigateAfterLogin('08-admin-peserta.html', res.token);
      } catch (err) {
        setAlertBanner(alertBox, 'error', escapeHtml(err.message));
        submitBtn.disabled = false;
      }
    });
  }

  // ========================================================================
  // 7. PESERTA: PROFIL SAYA (03-profil-peserta.html)
  // ========================================================================
  async function initPesertaProfilPage() {
    if (!document.getElementById('profileHeroName')) return;
    let currentUser = await requireAuth('peserta');
    if (!currentUser) return;

    const populateProfileUI = (u) => {
      hydrateSidebarUser(u);
      document.getElementById('profileHeroName').textContent = u.nama;
      document.getElementById('profileHeroDivisi').textContent = `${u.jenis} - Divisi ${u.divisi}`;
      document.getElementById('profileHeroPeriode').textContent = u.periode;
      renderAvatarInto(document.getElementById('profileAvatarPreview'), u.avatarUrl, u.nama, 108);

      document.getElementById('chipStatusMagang').textContent = `Status: ${u.status === 'selesai' ? 'Selesai' : 'Aktif'}`;
      document.getElementById('chipTotalLaporan').textContent = `${u.stats?.total ?? 0} Laporan`;
      document.getElementById('chipValidLaporan').textContent = `${u.stats?.valid ?? 0} Disetujui`;

      document.querySelectorAll('[data-profile-field]').forEach((el) => {
        const key = el.dataset.profileField;
        el.textContent = u[key] || '-';
      });
    };

    populateProfileUI(currentUser);

    // Inline Edit Mode
    const btnEdit = document.getElementById('btnEditProfil');
    const btnSave = document.getElementById('btnSimpanProfil');
    let isEditing = false;

    const setEditMode = (editing) => {
      isEditing = editing;
      const fields = document.querySelectorAll('[data-profile-field]');
      if (editing) {
        fields.forEach((p) => {
          const key = p.dataset.profileField;
          if (key === 'periode') {
            p.innerHTML = `
              <div class="row g-1 mt-1">
                <div class="col-6"><input type="date" class="profile-edit-input" data-edit-key="tglMulai" value="${escapeHtml(currentUser.tglMulai || '')}" aria-label="Tanggal Mulai"></div>
                <div class="col-6"><input type="date" class="profile-edit-input" data-edit-key="tglAkhir" value="${escapeHtml(currentUser.tglAkhir || '')}" aria-label="Tanggal Akhir"></div>
              </div>
            `;
            return;
          }
          if (key === 'jenis') {
            const opts = ['MBKM', 'Reguler', 'PKL', 'Mandiri'];
            p.innerHTML = `<select class="profile-edit-input" data-edit-key="jenis">${opts.map((o) => `<option value="${o}" ${currentUser.jenis === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
            return;
          }
          if (key === 'divisi') {
            const opts = ['IT', 'HRD', 'Marketing', 'Public Relation', 'Finance'];
            p.innerHTML = `<select class="profile-edit-input" data-edit-key="divisi">${opts.map((o) => `<option value="${o}" ${currentUser.divisi === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
            return;
          }
          const type = key === 'email' ? 'email' : key === 'telepon' ? 'tel' : 'text';
          p.innerHTML = `<input type="${type}" class="profile-edit-input" data-edit-key="${key}" value="${escapeHtml(currentUser[key] || '')}" />`;
        });
        btnEdit.innerHTML = '<i class="bi bi-x-circle" aria-hidden="true"></i><span>Batal</span>';
        showToast('warning', 'Mode Edit Aktif', 'Ubah data profil Anda lalu klik Simpan Perubahan.');
      } else {
        populateProfileUI(currentUser);
        btnEdit.innerHTML = '<i class="bi bi-pencil-square" aria-hidden="true"></i><span>Edit Profil</span>';
      }
    };

    btnEdit.addEventListener('click', () => setEditMode(!isEditing));

    btnSave.addEventListener('click', async () => {
      if (!isEditing) {
        showToast('warning', 'Belum Ada Perubahan', 'Klik tombol Edit Profil terlebih dahulu untuk mengubah data.');
        return;
      }
      const payload = {};
      document.querySelectorAll('[data-edit-key]').forEach((inp) => {
        payload[inp.dataset.editKey] = inp.value.trim();
      });

      btnSave.disabled = true;
      try {
        const res = await apiFetch('/api/me', { method: 'PUT', body: JSON.stringify(payload) });
        currentUser = res.user;
        isEditing = false;
        setEditMode(false);
        showToast('success', 'Profil Diperbarui', res.message || 'Data profil berhasil disimpan.');
      } catch (err) {
        showToast('error', 'Gagal Menyimpan Profil', err.message);
      } finally {
        btnSave.disabled = false;
      }
    });

    // Avatar Upload
    const inputFoto = document.getElementById('inputFotoProfil');
    if (inputFoto) {
      inputFoto.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const optimized = await optimizeImageFile(file);
          const res = await apiFetch('/api/me/avatar', {
            method: 'POST',
            body: JSON.stringify({ fileName: optimized.fileName, dataUrl: optimized.dataUrl })
          });
          currentUser = res.user;
          populateProfileUI(currentUser);
          showToast('success', 'Foto Profil Tersimpan', 'Foto profil baru berhasil diunggah ke server.');
        } catch (err) {
          showToast('error', 'Gagal Upload Foto', err.message);
        } finally {
          inputFoto.value = '';
        }
      });
    }

    // Password Update
    const passForm = document.getElementById('formEditPassword');
    const passAlertBox = document.getElementById('passwordAlertBox');
    const passValidator = createFormValidator(passForm, {
      confPass: (el, frm) => {
        const nw = frm.querySelector('#newPass')?.value || '';
        return el.value && nw && el.value !== nw ? 'Konfirmasi password baru tidak cocok.' : '';
      }
    });

    passForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setAlertBanner(passAlertBox, '', '');
      if (!passValidator.validateAll()) return;

      try {
        const res = await apiFetch('/api/me/password', {
          method: 'PUT',
          body: JSON.stringify({
            oldPassword: document.getElementById('oldPass').value,
            newPassword: document.getElementById('newPass').value,
            confirmPassword: document.getElementById('confPass').value
          })
        });
        passForm.reset();
        passValidator.clearAll();
        setAlertBanner(passAlertBox, 'success', escapeHtml(res.message));
        showToast('success', 'Password Diubah', res.message);
      } catch (err) {
        setAlertBanner(passAlertBox, 'error', escapeHtml(err.message));
      }
    });
  }

  // ========================================================================
  // 8. PESERTA: LOGBOOK LAPORAN HARIAN (04-laporan-peserta.html)
  // ========================================================================
  async function initPesertaLogbookPage() {
    const tbody = document.getElementById('pesertaReportTbody');
    const tableEl = document.getElementById('pesertaReportTable');
    if (!tbody || !tableEl) return;

    const currentUser = await requireAuth('peserta');
    if (!currentUser) return;

    const printInfo = document.getElementById('printInternSummary');
    if (printInfo) {
      printInfo.textContent = `Nama: ${currentUser.nama} | Divisi: ${currentUser.jenis} - ${currentUser.divisi} | Instansi: ${currentUser.universitas}`;
    }

    initSortableTable(tableEl, document.getElementById('pesertaSortStatus'));

    let allReports = [];
    let activeFilter = 'all';
    let searchTerm = '';
    let targetDeleteId = null;

    const statButtons = document.querySelectorAll('#logbookStatGrid [data-stat-filter]');
    const statusSelect = document.getElementById('reportStatusFilter');
    const searchInput = document.getElementById('pesertaReportSearch');
    const deleteDialog = document.getElementById('deleteReportDialog');

    const updateCountsAndFilterUI = () => {
      const counts = {
        all: allReports.length,
        menunggu: allReports.filter((r) => r.status === 'menunggu').length,
        revisi: allReports.filter((r) => r.status === 'revisi').length,
        ditolak: allReports.filter((r) => r.status === 'ditolak').length,
        valid: allReports.filter((r) => r.status === 'valid').length
      };
      Object.entries(counts).forEach(([k, val]) => {
        const numEl = document.querySelector(`[data-stat-count="${k}"]`);
        if (numEl) numEl.textContent = String(val);
      });
      if (statusSelect) {
        statusSelect.querySelector('option[value="all"]').textContent = `Semua Status (${counts.all})`;
        statusSelect.querySelector('option[value="menunggu"]').textContent = `Menunggu Validasi (${counts.menunggu})`;
        statusSelect.querySelector('option[value="revisi"]').textContent = `Perlu Revisi (${counts.revisi})`;
        statusSelect.querySelector('option[value="ditolak"]').textContent = `Ditolak (${counts.ditolak})`;
        statusSelect.querySelector('option[value="valid"]').textContent = `Valid / Disetujui (${counts.valid})`;
        statusSelect.value = activeFilter;
      }
      statButtons.forEach((btn) => {
        btn.classList.toggle('active-stat', btn.dataset.statFilter === activeFilter);
      });
      // Update sidebar revisi badge live
      const needFix = counts.revisi + counts.ditolak;
      const sb = document.getElementById('sidebarRevisiBadge');
      if (sb) {
        sb.textContent = String(needFix);
        sb.classList.toggle('d-none', needFix === 0);
      }
    };

    const getFilteredReports = () => {
      return allReports.filter((r) => {
        const matchStatus = activeFilter === 'all' || r.status === activeFilter;
        if (!matchStatus) return false;
        if (!searchTerm) return true;
        const hay = `${r.hasilKerja} ${r.kendala} ${r.dateFull} ${r.mentorNote || ''}`.toLowerCase();
        return hay.includes(searchTerm);
      });
    };

    const buildStatusActionsHtml = (r) => {
      if (r.status === 'valid') {
        return `
          <div class="mentor-action-group" data-validation-cell>
            <span class="badge-check-valid" title="Telah Divalidasi Mentor">
              <i class="bi bi-patch-check-fill" aria-hidden="true"></i>
              <span>Valid</span>
            </span>
          </div>
        `;
      }
      if (r.status === 'revisi') {
        return `
          <div class="mentor-action-group" data-validation-cell>
            <span class="badge-status-revision" title="Mentor meminta revisi pada laporan ini">
              <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
              <span>Perlu Revisi</span>
            </span>
            <a href="06-edit-laporan.html?id=${encodeURIComponent(r.id)}" class="btn-icon-edit full-action" title="Perbaiki &amp; Kirim Ulang Revisi">
              <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
              <span>Perbaiki Revisi</span>
            </a>
          </div>
        `;
      }
      if (r.status === 'ditolak') {
        return `
          <div class="mentor-action-group" data-validation-cell>
            <span class="badge-status-rejected" title="Laporan ditolak oleh Mentor">
              <i class="bi bi-x-octagon-fill" aria-hidden="true"></i>
              <span>Ditolak</span>
            </span>
            <a href="06-edit-laporan.html?id=${encodeURIComponent(r.id)}" class="btn-icon-edit" title="Perbaiki Laporan">
              <i class="bi bi-pencil-square" aria-hidden="true"></i>
              <span>Perbaiki</span>
            </a>
            <button type="button" class="btn-icon-delete" data-delete-id="${escapeHtml(r.id)}" data-delete-label="${escapeHtml(r.dateFull)}" title="Hapus Laporan">
              <i class="bi bi-trash3-fill" aria-hidden="true"></i>
              <span>Hapus</span>
            </button>
          </div>
        `;
      }
      return `
        <div class="mentor-action-group" data-validation-cell>
          <span class="badge-status-pending" title="Menunggu pemeriksaan Mentor">
            <i class="bi bi-hourglass-split" aria-hidden="true"></i>
            <span>Menunggu</span>
          </span>
          <a href="06-edit-laporan.html?id=${encodeURIComponent(r.id)}" class="btn-icon-edit" title="Edit Laporan">
            <i class="bi bi-pencil-square" aria-hidden="true"></i>
            <span>Edit</span>
          </a>
          <button type="button" class="btn-icon-delete" data-delete-id="${escapeHtml(r.id)}" data-delete-label="${escapeHtml(r.dateFull)}" title="Hapus Laporan">
            <i class="bi bi-trash3-fill" aria-hidden="true"></i>
            <span>Hapus</span>
          </button>
        </div>
      `;
    };

    const renderRows = () => {
      updateCountsAndFilterUI();
      const filtered = getFilteredReports();
      if (filtered.length === 0) {
        tbody.innerHTML = `
          <tr data-empty-row="true">
            <td colspan="5">
              <div class="ec-empty-state my-2">
                <i class="bi bi-journal-x" aria-hidden="true"></i>
                <div>Tidak ada laporan harian pada kategori atau kata kunci pencarian saat ini.</div>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = filtered.map((r) => {
        const noteHtml = (r.status === 'revisi' || r.status === 'ditolak') && r.mentorNote
          ? `
            <div class="mentor-note-box ${r.status}">
              <div class="mentor-note-header">
                <i class="bi ${r.status === 'revisi' ? 'bi-exclamation-triangle-fill' : 'bi-x-octagon-fill'}" aria-hidden="true"></i>
                <span>${r.status === 'revisi' ? 'Catatan Revisi Mentor' : 'Alasan Ditolak Mentor'}</span>
              </div>
              <div class="mentor-note-text">${escapeHtml(r.mentorNote)}</div>
            </div>
          `
          : '';

        return `
          <tr data-report-row data-report-id="${escapeHtml(r.id)}" data-report-status="${escapeHtml(r.status)}">
            <td data-label="Tanggal" data-value="${r.timestamp || 0}">
              <div class="date-cell">
                <span class="date-cal-badge" aria-hidden="true"><i class="bi bi-calendar2-week-fill"></i></span>
                <div class="date-text-group">
                  <div class="date-text-main">${escapeHtml(r.dateMain)}</div>
                  <div class="date-text-day">${escapeHtml(r.dateDay)}</div>
                </div>
              </div>
            </td>
            <td data-label="Hasil Kerja" data-value="${escapeHtml(r.hasilKerja)}">
              <div class="hasil-kerja-text">${escapeHtml(r.hasilKerja)}</div>
              ${noteHtml}
            </td>
            <td data-label="Kendala Pekerjaan">${escapeHtml(r.kendala || 'Tidak ada')}</td>
            <td data-label="Bukti" class="text-center">
              <button type="button" class="btn-proof-img" data-proof-idx="${escapeHtml(r.id)}" aria-label="Lihat Bukti Pekerjaan tanggal ${escapeHtml(r.dateMain)}">
                <i class="bi bi-image-fill" aria-hidden="true"></i>
                <span>Lihat</span>
              </button>
            </td>
            <td data-label="Status &amp; Aksi" class="text-center">
              ${buildStatusActionsHtml(r)}
            </td>
          </tr>
        `;
      }).join('');
    };

    const loadReports = async () => {
      try {
        const res = await apiFetch('/api/reports');
        allReports = res.reports || [];
        renderRows();
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-danger">${escapeHtml(err.message)}</td></tr>`;
      }
    };

    await loadReports();

    // Filter handlers
    statButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        activeFilter = btn.dataset.statFilter;
        renderRows();
      });
    });
    if (statusSelect) {
      statusSelect.addEventListener('change', () => {
        activeFilter = statusSelect.value;
        renderRows();
      });
    }
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchTerm = searchInput.value.trim().toLowerCase();
        renderRows();
      });
    }

    // Delegated Proof & Delete actions
    tbody.addEventListener('click', (e) => {
      const proofBtn = e.target.closest('[data-proof-idx]');
      if (proofBtn) {
        const rep = allReports.find((r) => r.id === proofBtn.dataset.proofIdx);
        if (rep) openProofModal(rep.hasilKerja, rep.dateFull, rep.proofUrl, rep.proofName);
        return;
      }

      const delBtn = e.target.closest('[data-delete-id]');
      if (delBtn && deleteDialog) {
        targetDeleteId = delBtn.dataset.deleteId;
        const subEl = document.getElementById('deleteReportDialogSubtitle');
        if (subEl) subEl.textContent = `Laporan tanggal ${delBtn.dataset.deleteLabel || ''}`;
        deleteDialog.returnValue = '';
        deleteDialog.showModal();
      }
    });

    if (deleteDialog) {
      deleteDialog.addEventListener('close', async () => {
        if (deleteDialog.returnValue !== 'confirm' || !targetDeleteId) {
          targetDeleteId = null;
          return;
        }
        const idToDelete = targetDeleteId;
        targetDeleteId = null;
        try {
          const res = await apiFetch(`/api/reports/${encodeURIComponent(idToDelete)}`, { method: 'DELETE' });
          allReports = allReports.filter((r) => r.id !== idToDelete);
          renderRows();
          showToast('success', 'Laporan Dihapus', res.message || 'Laporan berhasil dihapus.');
        } catch (err) {
          showToast('error', 'Gagal Menghapus', err.message);
        }
      });
    }

    // Export CSV & Print
    const btnCsv = document.getElementById('btnExportPesertaCsv');
    if (btnCsv) {
      btnCsv.addEventListener('click', () => {
        const rowsToExport = getFilteredReports();
        if (rowsToExport.length === 0) {
          showToast('warning', 'Data Kosong', 'Tidak ada baris laporan untuk diekspor.');
          return;
        }
        const statusLabels = { menunggu: 'Menunggu Validasi', revisi: 'Perlu Revisi', ditolak: 'Ditolak', valid: 'Valid / Disetujui' };
        downloadCsvFile(
          `logbook-${currentUser.nama.toLowerCase().replace(/\s+/g, '-')}-${getTodayIso()}.csv`,
          ['Tanggal', 'Hari', 'Hasil Kerja', 'Kendala Pekerjaan', 'Status', 'Catatan Mentor'],
          rowsToExport.map((r) => [r.dateMain, r.dateDay, r.hasilKerja, r.kendala, statusLabels[r.status] || r.status, r.mentorNote || '-'])
        );
        showToast('success', 'Ekspor Berhasil', `File CSV berisi ${rowsToExport.length} laporan telah diunduh.`);
      });
    }

    const btnPrint = document.getElementById('btnPrintPesertaLogbook');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => window.print());
    }
  }

  // ========================================================================
  // 9. PESERTA: UPLOAD LAPORAN (05-upload-laporan.html)
  // ========================================================================
  async function initUploadLaporanPage() {
    const form = document.getElementById('formUploadLaporan');
    if (!form) return;

    const currentUser = await requireAuth('peserta');
    if (!currentUser) return;

    const tglInput = document.getElementById('tglLaporan');
    if (tglInput && !tglInput.value) tglInput.value = getTodayIso();

    const alertBox = document.getElementById('uploadAlertBox');
    const fileInput = document.getElementById('buktiFileInput');
    const previewBox = document.getElementById('uploadThumbPreviewBox');
    const previewImg = document.getElementById('uploadThumbImg');
    const previewName = document.getElementById('uploadThumbName');
    const previewMeta = document.getElementById('uploadThumbMeta');
    const clearBtn = document.getElementById('btnClearUploadPreview');
    const uploadZone = document.getElementById('uploadBoxZone');
    const errBukti = document.getElementById('errUploadBukti');
    const submitBtn = document.getElementById('btnSubmitUpload');

    let selectedProof = null;

    const validator = createFormValidator(form);

    const setProofError = (msg) => {
      if (uploadZone) uploadZone.classList.toggle('is-invalid-zone', Boolean(msg));
      if (errBukti) {
        if (msg) {
          errBukti.innerHTML = `<i class="bi bi-exclamation-circle-fill" aria-hidden="true"></i><span>Error: ${escapeHtml(msg)}</span>`;
          errBukti.classList.add('visible');
        } else {
          errBukti.innerHTML = '';
          errBukti.classList.remove('visible');
        }
      }
    };

    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          selectedProof = await optimizeImageFile(file);
          setProofError('');
          previewImg.src = selectedProof.dataUrl;
          previewName.textContent = selectedProof.fileName;
          previewMeta.textContent = `Ukuran siap unggah: ${selectedProof.sizeLabel}`;
          previewBox.classList.remove('d-none');
        } catch (err) {
          selectedProof = null;
          setProofError(err.message);
          previewBox.classList.add('d-none');
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        selectedProof = null;
        if (fileInput) fileInput.value = '';
        previewBox.classList.add('d-none');
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setAlertBanner(alertBox, '', '');
      const validFields = validator.validateAll();
      if (!selectedProof) {
        setProofError('Lampirkan minimal 1 foto dokumentasi bukti pekerjaan.');
        if (validFields && uploadZone) uploadZone.focus();
      }
      if (!validFields || !selectedProof) {
        setAlertBanner(alertBox, 'error', 'Mohon lengkapi semua isian wajib termasuk bukti dokumentasi foto.');
        return;
      }

      submitBtn.disabled = true;
      try {
        const res = await apiFetch('/api/reports', {
          method: 'POST',
          body: JSON.stringify({
            dateIso: document.getElementById('tglLaporan').value,
            hasilKerja: document.getElementById('hasilKerja').value.trim(),
            kendala: document.getElementById('kendalaKerja').value.trim(),
            proofName: selectedProof.fileName,
            proofDataUrl: selectedProof.dataUrl
          })
        });
        showToast('success', 'Laporan Terkirim!', res.message);
        setAlertBanner(alertBox, 'success', 'Laporan berhasil disimpan ke server! Mengalihkan ke Logbook...');
        setTimeout(() => {
          window.location.href = '04-laporan-peserta.html';
        }, 700);
      } catch (err) {
        setAlertBanner(alertBox, 'error', escapeHtml(err.message));
        submitBtn.disabled = false;
      }
    });
  }

  // ========================================================================
  // 10. PESERTA: EDIT / PERBAIKI LAPORAN (06-edit-laporan.html)
  // ========================================================================
  async function initEditLaporanPage() {
    const form = document.getElementById('formEditLaporan');
    if (!form) return;

    const currentUser = await requireAuth('peserta');
    if (!currentUser) return;

    const params = new URLSearchParams(window.location.search);
    const reportId = params.get('id');
    const alertBox = document.getElementById('editAlertBox');
    const submitBtn = document.getElementById('btnSubmitEdit');

    let targetReport = null;
    try {
      if (reportId) {
        const res = await apiFetch(`/api/reports/${encodeURIComponent(reportId)}`);
        targetReport = res.report;
      } else {
        const res = await apiFetch('/api/reports');
        const list = res.reports || [];
        targetReport = list.find((r) => r.status === 'revisi' || r.status === 'ditolak') || list.find((r) => r.status !== 'valid') || list[0];
      }
    } catch (err) {
      setAlertBanner(alertBox, 'error', escapeHtml(err.message));
      submitBtn.disabled = true;
      return;
    }

    if (!targetReport) {
      setAlertBanner(alertBox, 'warning', 'Laporan yang dipilih tidak ditemukan.');
      submitBtn.disabled = true;
      return;
    }

    // Hydrate fields
    document.getElementById('editTglLaporan').value = targetReport.dateIso || getTodayIso();
    document.getElementById('editHasilKerja').value = targetReport.hasilKerja || '';
    document.getElementById('editKendalaKerja').value = targetReport.kendala || '';
    document.getElementById('editProofThumb').src = resolveAssetUrl(targetReport.proofUrl || '/assets/img/samples/rapat.svg');
    document.getElementById('editFileName').textContent = targetReport.proofName || 'Dokumentasi_Kegiatan.jpg';

    const submitLabel = document.getElementById('editSubmitBtnLabel');
    if (submitLabel) {
      submitLabel.textContent = (targetReport.status === 'revisi' || targetReport.status === 'ditolak')
        ? 'Simpan Perbaikan & Kirim Ulang'
        : 'Simpan Perubahan Laporan';
    }

    const noteBanner = document.getElementById('editMentorNoteBanner');
    if (noteBanner && targetReport.mentorNote && (targetReport.status === 'revisi' || targetReport.status === 'ditolak')) {
      noteBanner.classList.remove('d-none', 'revisi', 'ditolak');
      noteBanner.classList.add(targetReport.status);
      document.getElementById('editMentorNoteHeaderText').textContent =
        targetReport.status === 'revisi' ? 'Catatan Revisi Mentor' : 'Alasan Ditolak Mentor';
      document.getElementById('editMentorNoteBodyText').textContent = targetReport.mentorNote;
    }

    const validator = createFormValidator(form);
    const fileInput = document.getElementById('editBuktiFileInput');
    let replacementProof = null;

    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          replacementProof = await optimizeImageFile(file);
          document.getElementById('editProofThumb').src = replacementProof.dataUrl;
          document.getElementById('editFileName').textContent = replacementProof.fileName;
          document.getElementById('editProofStatusLabel').textContent = `Gambar baru siap diunggah (${replacementProof.sizeLabel})`;
        } catch (err) {
          showToast('error', 'Format File Tidak Sesuai', err.message);
        }
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setAlertBanner(alertBox, '', '');
      if (!validator.validateAll()) {
        setAlertBanner(alertBox, 'error', 'Mohon periksa kembali isian formulir.');
        return;
      }

      submitBtn.disabled = true;
      try {
        const payload = {
          dateIso: document.getElementById('editTglLaporan').value,
          hasilKerja: document.getElementById('editHasilKerja').value.trim(),
          kendala: document.getElementById('editKendalaKerja').value.trim()
        };
        if (replacementProof) {
          payload.proofName = replacementProof.fileName;
          payload.proofDataUrl = replacementProof.dataUrl;
        }
        const res = await apiFetch(`/api/reports/${encodeURIComponent(targetReport.id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showToast('success', 'Perubahan Disimpan', res.message);
        setAlertBanner(alertBox, 'success', 'Perubahan berhasil disimpan ke server! Mengalihkan ke Logbook...');
        setTimeout(() => {
          window.location.href = '04-laporan-peserta.html';
        }, 700);
      } catch (err) {
        setAlertBanner(alertBox, 'error', escapeHtml(err.message));
        submitBtn.disabled = false;
      }
    });
  }

  // ========================================================================
  // 11. ADMIN / MENTOR: DAFTAR PESERTA (08-admin-peserta.html)
  // ========================================================================
  async function initAdminPesertaGridPage() {
    const gridEl = document.getElementById('internCardsGrid');
    if (!gridEl) return;

    const admin = await requireAuth('admin');
    if (!admin) return;

    let allInterns = [];
    let statusFilter = 'all';
    let divisiFilter = 'all';
    let searchTerm = '';

    const searchInput = document.getElementById('searchPesertaInput');
    const divSelect = document.getElementById('adminDivisiFilter');
    const filterButtons = document.querySelectorAll('[data-filter-status]');
    const emptyBox = document.getElementById('internEmptyState');

    const renderGrid = () => {
      const counts = {
        all: allInterns.length,
        aktif: allInterns.filter((i) => i.status === 'aktif').length,
        selesai: allInterns.filter((i) => i.status === 'selesai').length
      };
      document.getElementById('countAllInterns').textContent = String(counts.all);
      document.getElementById('countAktifInterns').textContent = String(counts.aktif);
      document.getElementById('countSelesaiInterns').textContent = String(counts.selesai);

      filterButtons.forEach((b) => b.classList.toggle('active', b.dataset.filterStatus === statusFilter));

      const filtered = allInterns.filter((intern) => {
        if (statusFilter !== 'all' && intern.status !== statusFilter) return false;
        if (divisiFilter !== 'all' && intern.divisi !== divisiFilter) return false;
        if (!searchTerm) return true;
        const hay = `${intern.nama} ${intern.universitas} ${intern.divisi} ${intern.jurusan} ${intern.jenis}`.toLowerCase();
        return hay.includes(searchTerm);
      });

      if (filtered.length === 0) {
        gridEl.innerHTML = '';
        if (emptyBox) emptyBox.classList.remove('d-none');
        return;
      }

      if (emptyBox) emptyBox.classList.add('d-none');
      gridEl.innerHTML = filtered.map((intern) => {
        const pending = intern.stats?.menunggu || 0;
        const pendingPill = pending > 0
          ? `<span class="intern-pending-pill" title="${pending} laporan menunggu validasi">${pending} baru</span>`
          : '';
        const avatarHtml = intern.avatarUrl
          ? `<img src="${escapeHtml(resolveAssetUrl(intern.avatarUrl))}" alt="Foto ${escapeHtml(intern.nama)}" />`
          : defaultAvatarSvg(84);

        return `
          <div class="col">
            <a href="09-admin-detail-peserta.html?id=${encodeURIComponent(intern.id)}" class="intern-card">
              <span class="intern-ribbon ${intern.status === 'selesai' ? 'selesai' : 'aktif'}" title="Status: ${intern.status === 'selesai' ? 'Selesai' : 'Aktif'}"></span>
              ${pendingPill}
              <div class="intern-card-avatar">${avatarHtml}</div>
              <h2 class="intern-card-name">${escapeHtml(intern.nama)}</h2>
              <p class="intern-card-univ">${escapeHtml(intern.universitas)}</p>
              <span class="intern-card-divisi">${escapeHtml(intern.jenis)} &bull; ${escapeHtml(intern.divisi)}</span>
            </a>
          </div>
        `;
      }).join('');
    };

    try {
      const res = await apiFetch('/api/admin/interns');
      allInterns = res.interns || [];
      updateAdminPendingBadge(res.pendingTotal || 0);
      renderGrid();
    } catch (err) {
      gridEl.innerHTML = `<div class="col-12 text-center py-4 text-danger">${escapeHtml(err.message)}</div>`;
    }

    filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        statusFilter = btn.dataset.filterStatus;
        renderGrid();
      });
    });

    if (divSelect) {
      divSelect.addEventListener('change', () => {
        divisiFilter = divSelect.value;
        renderGrid();
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchTerm = searchInput.value.trim().toLowerCase();
        renderGrid();
      });
    }

    const resetBtn = document.getElementById('btnResetInternSearch');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        statusFilter = 'all';
        divisiFilter = 'all';
        searchTerm = '';
        if (searchInput) searchInput.value = '';
        if (divSelect) divSelect.value = 'all';
        renderGrid();
      });
    }
  }

  // ========================================================================
  // 12. ADMIN / MENTOR: DETAIL PESERTA (09-admin-detail-peserta.html)
  // ========================================================================
  async function initAdminDetailPesertaPage() {
    if (!document.getElementById('detailHeroNama')) return;

    const admin = await requireAuth('admin');
    if (!admin) return;

    const params = new URLSearchParams(window.location.search);
    let internId = params.get('id');
    if (!internId) {
      const listRes = await apiFetch('/api/admin/interns');
      internId = listRes.interns?.[0]?.id;
    }
    if (!internId) {
      showToast('error', 'Tidak Ada Data', 'Belum ada peserta terdaftar.');
      return;
    }

    let intern = null;
    const renderDetail = (data) => {
      intern = data;
      document.getElementById('detailHeroNama').textContent = data.nama;
      document.getElementById('detailHeroDivisi').textContent = `${data.jenis} - Divisi ${data.divisi}`;
      document.getElementById('detailHeroPeriode').textContent = data.periode;
      renderAvatarInto(document.getElementById('detailAvatarWrap'), data.avatarUrl, data.nama, 108);

      document.getElementById('detailChipTotal').textContent = `${data.stats?.total ?? 0} Laporan`;
      document.getElementById('detailChipValid').textContent = `${data.stats?.valid ?? 0} Disetujui`;
      document.getElementById('detailChipPending').textContent = `${data.stats?.menunggu ?? 0} Menunggu`;

      document.getElementById('detailEmail').textContent = data.email || '-';
      document.getElementById('detailTelepon').textContent = data.telepon || '-';
      document.getElementById('detailAlamat').textContent = data.alamat || '-';
      document.getElementById('detailNamaLengkap').textContent = data.nama || '-';
      document.getElementById('detailUniversitas').textContent = data.universitas || '-';
      document.getElementById('detailJurusan').textContent = data.jurusan || '-';
      document.getElementById('detailJenis').textContent = data.jenis || '-';
      document.getElementById('detailDivisi').textContent = data.divisi || '-';
      document.getElementById('detailPeriode').textContent = data.periode || '-';

      const pill = document.getElementById('detailStatusPill');
      const isSelesai = data.status === 'selesai';
      pill.className = `status-pill ${isSelesai ? 'selesai' : 'aktif'} position-absolute`;
      pill.innerHTML = `<i class="bi ${isSelesai ? 'bi-flag-fill' : 'bi-check-circle-fill'}" aria-hidden="true"></i><span>${isSelesai ? 'Selesai' : 'Aktif'}</span>`;

      document.getElementById('toggleStatusLabel').textContent = isSelesai ? 'Aktifkan Kembali' : 'Tandai Selesai';
      document.getElementById('linkLihatLaporanPeserta').href = `11-admin-detail-laporan.html?id=${encodeURIComponent(data.id)}`;
      document.getElementById('deletePesertaSubtitle').textContent = `${data.nama} — ${data.jenis} Divisi ${data.divisi}`;
      document.getElementById('deletePesertaNameInline').textContent = data.nama;
    };

    try {
      const res = await apiFetch(`/api/admin/interns/${encodeURIComponent(internId)}`);
      renderDetail(res.intern);
    } catch (err) {
      showToast('error', 'Peserta Tidak Ditemukan', err.message);
      return;
    }

    const btnToggle = document.getElementById('btnToggleStatusPeserta');
    btnToggle.addEventListener('click', async () => {
      if (!intern) return;
      const nextStatus = intern.status === 'selesai' ? 'aktif' : 'selesai';
      btnToggle.disabled = true;
      try {
        const res = await apiFetch(`/api/admin/interns/${encodeURIComponent(intern.id)}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus })
        });
        renderDetail(res.intern);
        showToast('success', 'Status Diperbarui', res.message);
      } catch (err) {
        showToast('error', 'Gagal Mengubah Status', err.message);
      } finally {
        btnToggle.disabled = false;
      }
    });

    const delDialog = document.getElementById('deletePesertaDialog');
    document.getElementById('btnHapusPeserta').addEventListener('click', () => {
      if (delDialog) {
        delDialog.returnValue = '';
        delDialog.showModal();
      }
    });

    if (delDialog) {
      delDialog.addEventListener('close', async () => {
        if (delDialog.returnValue !== 'confirm' || !intern) return;
        try {
          const res = await apiFetch(`/api/admin/interns/${encodeURIComponent(intern.id)}`, { method: 'DELETE' });
          showToast('success', 'Peserta Dihapus', res.message);
          setTimeout(() => {
            window.location.href = '08-admin-peserta.html';
          }, 700);
        } catch (err) {
          showToast('error', 'Gagal Menghapus Peserta', err.message);
        }
      });
    }
  }

  // ========================================================================
  // 13. ADMIN / MENTOR: REKAP LAPORAN PESERTA (10-admin-laporan-peserta.html)
  // ========================================================================
  async function initAdminRekapLaporanPage() {
    const tbody = document.getElementById('adminRekapTbody');
    const tableEl = document.getElementById('adminRekapTable');
    if (!tbody || !tableEl) return;

    const admin = await requireAuth('admin');
    if (!admin) return;

    initSortableTable(tableEl, document.getElementById('adminRekapStatus'));

    let allInterns = [];
    let filterVal = 'all';
    let searchTerm = '';

    const filterSel = document.getElementById('adminRekapFilter');
    const searchInp = document.getElementById('adminRekapSearch');

    const renderRows = () => {
      const filtered = allInterns.filter((i) => {
        if (filterVal === 'pending_only' && (i.stats?.menunggu || 0) === 0) return false;
        if (filterVal === 'aktif' && i.status !== 'aktif') return false;
        if (filterVal === 'selesai' && i.status !== 'selesai') return false;
        if (!searchTerm) return true;
        return `${i.nama} ${i.universitas} ${i.divisi}`.toLowerCase().includes(searchTerm);
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `
          <tr data-empty-row="true">
            <td colspan="5">
              <div class="ec-empty-state my-2">
                <i class="bi bi-people" aria-hidden="true"></i>
                <div>Tidak ada peserta magang yang sesuai filter.</div>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = filtered.map((intern) => {
        const total = intern.stats?.total || 0;
        const pending = intern.stats?.menunggu || 0;
        const pendingChip = pending > 0
          ? `<span class="badge ms-1" style="background-color: #fef3c7; color: #92400e; border: 1px solid #fcd34d;">${pending} Menunggu</span>`
          : '';
        const avatarHtml = intern.avatarUrl
          ? `<img src="${escapeHtml(resolveAssetUrl(intern.avatarUrl))}" alt="${escapeHtml(intern.nama)}" />`
          : defaultAvatarSvg(30);

        return `
          <tr>
            <td data-label="Nama Lengkap" data-value="${escapeHtml(intern.nama)}">
              <div class="d-flex align-items-center gap-3">
                <div class="sidebar-user-avatar" style="width: 36px; height: 36px;">${avatarHtml}</div>
                <div>
                  <div class="fw-semibold">${escapeHtml(intern.nama)}</div>
                  <div class="text-muted" style="font-size: 0.72rem;">${escapeHtml(intern.jenis)} &bull; ${escapeHtml(intern.divisi)}</div>
                </div>
              </div>
            </td>
            <td data-label="Asal Sekolah / Universitas" data-value="${escapeHtml(intern.universitas)}">${escapeHtml(intern.universitas)}</td>
            <td data-label="Status" class="text-center">
              <span class="status-pill ${intern.status === 'selesai' ? 'selesai' : 'aktif'}">
                <i class="bi ${intern.status === 'selesai' ? 'bi-flag-fill' : 'bi-check-circle-fill'}" aria-hidden="true"></i>
                <span>${intern.status === 'selesai' ? 'Selesai' : 'Aktif'}</span>
              </span>
            </td>
            <td data-label="Laporan Terkirim" data-value="${total}">
              <i class="bi bi-journal-text me-1" style="color: var(--bs-primary);" aria-hidden="true"></i>
              <span>${total} Laporan</span>${pendingChip}
            </td>
            <td data-label="Detail" class="text-end">
              <a href="11-admin-detail-laporan.html?id=${encodeURIComponent(intern.id)}" class="btn-ec-detail">
                <i class="bi bi-folder2-open" aria-hidden="true"></i>
                <span>Selengkapnya</span>
              </a>
            </td>
          </tr>
        `;
      }).join('');
    };

    try {
      const res = await apiFetch('/api/admin/interns');
      allInterns = res.interns || [];
      updateAdminPendingBadge(res.pendingTotal || 0);
      renderRows();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-danger">${escapeHtml(err.message)}</td></tr>`;
    }

    if (filterSel) {
      filterSel.addEventListener('change', () => {
        filterVal = filterSel.value;
        renderRows();
      });
    }
    if (searchInp) {
      searchInp.addEventListener('input', () => {
        searchTerm = searchInp.value.trim().toLowerCase();
        renderRows();
      });
    }
  }

  // ========================================================================
  // 14. ADMIN / MENTOR: VALIDASI DETAIL LAPORAN (11-admin-detail-laporan.html)
  // ========================================================================
  async function initAdminDetailLaporanPage() {
    const tbody = document.getElementById('adminReportTbody');
    const tableEl = document.getElementById('adminDetailTable');
    if (!tbody || !tableEl) return;

    const admin = await requireAuth('admin');
    if (!admin) return;

    initSortableTable(tableEl, document.getElementById('adminDetailSortStatus'));

    const params = new URLSearchParams(window.location.search);
    const internId = params.get('id') || '';

    let internData = null;
    let reports = [];
    let activeFilter = 'all';
    let searchTerm = '';
    let activeModalReport = null;

    const statButtons = document.querySelectorAll('#adminStatGrid [data-stat-filter]');
    const statusSelect = document.getElementById('reportStatusFilter');
    const searchInput = document.getElementById('adminDetailSearch');
    const approveAllBtn = document.getElementById('btnApproveAllPending');
    const feedbackDialog = document.getElementById('mentorFeedbackDialog');
    const feedbackForm = document.getElementById('mentorFeedbackForm');
    const statusInput = document.getElementById('mentorStatusSelect');
    const noteInput = document.getElementById('mentorNoteInput');
    const noteFieldGroup = document.getElementById('mentorNoteFieldGroup');
    const dialogAlertBox = document.getElementById('mentorDialogAlertBox');

    const updateSummaryStats = () => {
      const counts = {
        all: reports.length,
        menunggu: reports.filter((r) => r.status === 'menunggu').length,
        revisi: reports.filter((r) => r.status === 'revisi').length,
        ditolak: reports.filter((r) => r.status === 'ditolak').length,
        valid: reports.filter((r) => r.status === 'valid').length
      };
      Object.entries(counts).forEach(([k, val]) => {
        const el = document.querySelector(`#adminStatGrid [data-stat-count="${k}"]`);
        if (el) el.textContent = String(val);
      });
      if (statusSelect) {
        statusSelect.querySelector('option[value="all"]').textContent = `Semua Status (${counts.all})`;
        statusSelect.querySelector('option[value="menunggu"]').textContent = `Menunggu Validasi (${counts.menunggu})`;
        statusSelect.querySelector('option[value="revisi"]').textContent = `Perlu Revisi (${counts.revisi})`;
        statusSelect.querySelector('option[value="ditolak"]').textContent = `Ditolak (${counts.ditolak})`;
        statusSelect.querySelector('option[value="valid"]').textContent = `Valid / Disetujui (${counts.valid})`;
        statusSelect.value = activeFilter;
      }
      statButtons.forEach((btn) => btn.classList.toggle('active-stat', btn.dataset.statFilter === activeFilter));
      if (approveAllBtn) {
        approveAllBtn.classList.toggle('d-none', counts.menunggu === 0);
      }
    };

    const getFilteredReports = () => {
      return reports.filter((r) => {
        const matchStatus = activeFilter === 'all' || r.status === activeFilter;
        if (!matchStatus) return false;
        if (!searchTerm) return true;
        return `${r.hasilKerja} ${r.kendala} ${r.dateFull} ${r.mentorNote || ''}`.toLowerCase().includes(searchTerm);
      });
    };

    const buildAdminActionsHtml = (r) => {
      if (r.status === 'valid') {
        return `
          <div class="mentor-action-group" data-validation-cell>
            <span class="badge-check-valid" title="Tervalidasi oleh Mentor">
              <i class="bi bi-patch-check-fill" aria-hidden="true"></i>
              <span>Valid</span>
            </span>
            <button type="button" class="btn-mentor-change" data-mentor-action="edit-status" data-report-id="${escapeHtml(r.id)}" title="Ubah Status Validasi">
              <i class="bi bi-pencil-square" aria-hidden="true"></i>
              <span>Ubah</span>
            </button>
          </div>
        `;
      }
      if (r.status === 'revisi') {
        return `
          <div class="mentor-action-group" data-validation-cell>
            <span class="badge-status-revision" title="Menunggu perbaikan dari peserta">
              <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
              <span>Perlu Revisi</span>
            </span>
            <button type="button" class="btn-mentor-change" data-mentor-action="edit-status" data-report-id="${escapeHtml(r.id)}" title="Ubah Keputusan atau Catatan">
              <i class="bi bi-pencil-square" aria-hidden="true"></i>
              <span>Ubah</span>
            </button>
          </div>
        `;
      }
      if (r.status === 'ditolak') {
        return `
          <div class="mentor-action-group" data-validation-cell>
            <span class="badge-status-rejected" title="Laporan ditolak oleh Mentor">
              <i class="bi bi-x-octagon-fill" aria-hidden="true"></i>
              <span>Ditolak</span>
            </span>
            <button type="button" class="btn-mentor-change" data-mentor-action="edit-status" data-report-id="${escapeHtml(r.id)}" title="Ubah Keputusan atau Catatan">
              <i class="bi bi-pencil-square" aria-hidden="true"></i>
              <span>Ubah</span>
            </button>
          </div>
        `;
      }
      return `
        <div class="mentor-action-group" data-validation-cell>
          <button type="button" class="btn-mentor-approve" data-mentor-action="approve" data-report-id="${escapeHtml(r.id)}" title="Setujui Laporan (Valid)">
            <i class="bi bi-check2-circle" aria-hidden="true"></i>
            <span>Setujui</span>
          </button>
          <button type="button" class="btn-mentor-revision" data-mentor-action="revision" data-report-id="${escapeHtml(r.id)}" title="Minta Revisi Laporan">
            <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
            <span>Revisi</span>
          </button>
          <button type="button" class="btn-mentor-reject" data-mentor-action="reject" data-report-id="${escapeHtml(r.id)}" title="Tolak Laporan">
            <i class="bi bi-x-circle" aria-hidden="true"></i>
            <span>Tolak</span>
          </button>
        </div>
      `;
    };

    const renderRows = () => {
      updateSummaryStats();
      const filtered = getFilteredReports();
      if (filtered.length === 0) {
        tbody.innerHTML = `
          <tr data-empty-row="true">
            <td colspan="5">
              <div class="ec-empty-state my-2">
                <i class="bi bi-journal-x" aria-hidden="true"></i>
                <div>Tidak ada laporan harian pada kategori atau kata kunci pencarian saat ini.</div>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = filtered.map((r) => {
        const noteHtml = (r.status === 'revisi' || r.status === 'ditolak') && r.mentorNote
          ? `
            <div class="mentor-note-box ${r.status}">
              <div class="mentor-note-header">
                <i class="bi ${r.status === 'revisi' ? 'bi-exclamation-triangle-fill' : 'bi-x-octagon-fill'}" aria-hidden="true"></i>
                <span>${r.status === 'revisi' ? 'Catatan Revisi Mentor' : 'Alasan Ditolak Mentor'}</span>
              </div>
              <div class="mentor-note-text">${escapeHtml(r.mentorNote)}</div>
            </div>
          `
          : '';

        return `
          <tr data-report-row data-report-id="${escapeHtml(r.id)}" data-report-status="${escapeHtml(r.status)}">
            <td data-label="Tanggal" data-value="${r.timestamp || 0}">
              <div class="date-cell">
                <span class="date-cal-badge" aria-hidden="true"><i class="bi bi-calendar2-week-fill"></i></span>
                <div class="date-text-group">
                  <div class="date-text-main">${escapeHtml(r.dateMain)}</div>
                  <div class="date-text-day">${escapeHtml(r.dateDay)}</div>
                </div>
              </div>
            </td>
            <td data-label="Hasil Kerja" data-value="${escapeHtml(r.hasilKerja)}">
              <div class="hasil-kerja-text">${escapeHtml(r.hasilKerja)}</div>
              ${noteHtml}
            </td>
            <td data-label="Kendala Pekerjaan">${escapeHtml(r.kendala || 'Tidak ada')}</td>
            <td data-label="Bukti Pekerjaan" class="text-center">
              <button type="button" class="btn-proof-img" data-proof-idx="${escapeHtml(r.id)}" aria-label="Lihat Bukti Pekerjaan tanggal ${escapeHtml(r.dateMain)}">
                <i class="bi bi-image-fill" aria-hidden="true"></i>
                <span>Lihat</span>
              </button>
            </td>
            <td data-label="Status &amp; Validasi" class="text-center">
              ${buildAdminActionsHtml(r)}
            </td>
          </tr>
        `;
      }).join('');
    };

    const loadDetailData = async () => {
      try {
        const url = internId ? `/api/reports?internId=${encodeURIComponent(internId)}` : '/api/reports';
        const res = await apiFetch(url);
        internData = res.intern;
        reports = res.reports || [];

        if (internData) {
          document.getElementById('adminDetailInternTitle').textContent = internData.nama;
          document.getElementById('linkDetailProfilPeserta').href = `09-admin-detail-peserta.html?id=${encodeURIComponent(internData.id)}`;
          document.getElementById('adminPrintSummary').textContent =
            `Peserta: ${internData.nama} | ${internData.jenis} - ${internData.divisi} | ${internData.universitas}`;
        }

        // Refresh global pending counter badge
        const internsRes = await apiFetch('/api/admin/interns');
        updateAdminPendingBadge(internsRes.pendingTotal || 0);

        renderRows();
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-danger">${escapeHtml(err.message)}</td></tr>`;
      }
    };

    await loadDetailData();

    // Filters
    statButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        activeFilter = btn.dataset.statFilter;
        renderRows();
      });
    });
    if (statusSelect) {
      statusSelect.addEventListener('change', () => {
        activeFilter = statusSelect.value;
        renderRows();
      });
    }
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchTerm = searchInput.value.trim().toLowerCase();
        renderRows();
      });
    }

    // Batch approve all pending
    if (approveAllBtn) {
      approveAllBtn.addEventListener('click', async () => {
        if (!internData) return;
        approveAllBtn.disabled = true;
        try {
          const res = await apiFetch(`/api/admin/interns/${encodeURIComponent(internData.id)}/approve-all-pending`, {
            method: 'POST'
          });
          showToast('success', 'Validasi Massal Berhasil', res.message);
          await loadDetailData();
        } catch (err) {
          showToast('error', 'Gagal Menyetujui Semua', err.message);
        } finally {
          approveAllBtn.disabled = false;
        }
      });
    }

    // Export CSV & Print
    const btnCsv = document.getElementById('btnExportAdminCsv');
    if (btnCsv) {
      btnCsv.addEventListener('click', () => {
        const rowsToExport = getFilteredReports();
        if (rowsToExport.length === 0) {
          showToast('warning', 'Data Kosong', 'Tidak ada laporan untuk diekspor.');
          return;
        }
        const statusLabels = { menunggu: 'Menunggu Validasi', revisi: 'Perlu Revisi', ditolak: 'Ditolak', valid: 'Valid / Disetujui' };
        const safeSlug = (internData?.nama || 'peserta').toLowerCase().replace(/\s+/g, '-');
        downloadCsvFile(
          `validasi-logbook-${safeSlug}-${getTodayIso()}.csv`,
          ['Peserta', 'Tanggal', 'Hari', 'Hasil Kerja', 'Kendala Pekerjaan', 'Status', 'Catatan Mentor'],
          rowsToExport.map((r) => [internData?.nama || '-', r.dateMain, r.dateDay, r.hasilKerja, r.kendala, statusLabels[r.status] || r.status, r.mentorNote || '-'])
        );
        showToast('success', 'Ekspor Berhasil', `${rowsToExport.length} baris logbook berhasil diunduh.`);
      });
    }

    const btnPrint = document.getElementById('btnPrintAdminLogbook');
    if (btnPrint) btnPrint.addEventListener('click', () => window.print());

    // Helper submit mentor decision
    const submitValidation = async (reportId, status, mentorNote = '') => {
      try {
        const res = await apiFetch(`/api/admin/reports/${encodeURIComponent(reportId)}/validate`, {
          method: 'PATCH',
          body: JSON.stringify({ status, mentorNote })
        });
        showToast('success', 'Keputusan Tersimpan', res.message);
        await loadDetailData();
        return true;
      } catch (err) {
        showToast('error', 'Gagal Memvalidasi', err.message);
        return false;
      }
    };

    const syncNoteVisibility = () => {
      const val = statusInput.value;
      const needsNote = val === 'revisi' || val === 'ditolak';
      noteFieldGroup.classList.toggle('d-none', !needsNote);
      document.getElementById('mentorNoteLabel').textContent = val === 'ditolak'
        ? 'Alasan Penolakan Laporan'
        : 'Catatan Arahan Revisi untuk Peserta';
    };

    if (statusInput) {
      statusInput.addEventListener('change', syncNoteVisibility);
    }

    // Delegated table click actions
    tbody.addEventListener('click', async (e) => {
      const proofBtn = e.target.closest('[data-proof-idx]');
      if (proofBtn) {
        const rep = reports.find((r) => r.id === proofBtn.dataset.proofIdx);
        if (rep) openProofModal(rep.hasilKerja, rep.dateFull, rep.proofUrl, rep.proofName);
        return;
      }

      const actionBtn = e.target.closest('[data-mentor-action]');
      if (!actionBtn) return;
      const action = actionBtn.dataset.mentorAction;
      const repId = actionBtn.dataset.reportId;
      const rep = reports.find((r) => r.id === repId);
      if (!rep) return;

      if (action === 'approve') {
        actionBtn.disabled = true;
        await submitValidation(rep.id, 'valid', '');
        return;
      }

      if (feedbackDialog) {
        activeModalReport = rep;
        setAlertBanner(dialogAlertBox, '', '');
        document.getElementById('mentorDialogSubtitle').textContent = `${rep.dateFull} — ${internData?.nama || ''}`;
        statusInput.value = action === 'revision' ? 'revisi' : action === 'reject' ? 'ditolak' : (rep.status || 'revisi');
        noteInput.value = rep.mentorNote || '';
        syncNoteVisibility();
        feedbackDialog.returnValue = '';
        feedbackDialog.showModal();
      }
    });

    // Validate dialog form before closing on confirm
    if (feedbackForm && feedbackDialog) {
      feedbackForm.addEventListener('submit', (e) => {
        const submitterVal = e.submitter ? e.submitter.value : 'confirm';
        if (submitterVal === 'cancel') return; // allow form method="dialog" close

        const chosenStatus = statusInput.value;
        const noteText = noteInput.value.trim();
        if ((chosenStatus === 'revisi' || chosenStatus === 'ditolak') && noteText.length < 5) {
          e.preventDefault();
          setAlertBanner(dialogAlertBox, 'error', 'Tuliskan catatan arahan/alasan minimal 5 karakter agar peserta memahami perbaikannya.');
          noteInput.focus();
        }
      });

      feedbackDialog.addEventListener('close', async () => {
        if (feedbackDialog.returnValue !== 'confirm' || !activeModalReport) {
          activeModalReport = null;
          return;
        }
        const rep = activeModalReport;
        activeModalReport = null;
        const chosenStatus = statusInput.value;
        const noteText = noteInput.value.trim();
        await submitValidation(rep.id, chosenStatus, noteText);
      });
    }
  }

  // ========================================================================
  // BOOTSTRAP INITIALIZATION ON DOM READY
  // ========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    setupGlobalChrome();
    initLightDismissDialogs();

    initPortalLandingPage();
    initRegisterPage();
    initLoginPesertaPage();
    initLoginAdminPage();
    initPesertaProfilPage();
    initPesertaLogbookPage();
    initUploadLaporanPage();
    initEditLaporanPage();
    initAdminPesertaGridPage();
    initAdminDetailPesertaPage();
    initAdminRekapLaporanPage();
    initAdminDetailLaporanPage();
  });
})();
