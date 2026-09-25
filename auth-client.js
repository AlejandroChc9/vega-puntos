/* No contiene ventas ni claves administrativas. Autorización efectiva: RLS. */
(() => {
  'use strict';
  const PROJECT = 'https://cotifawudlwgkcxksngl.supabase.co';
  const KEY = 'sb_publishable_chIe6tDXcecpyxxTvNApRQ_EQwtuwmT';
  class VegaSession {
    constructor(fetcher = globalThis.fetch.bind(globalThis), storage = globalThis.sessionStorage) {
      this.fetcher = fetcher; this.storage = storage; this.session = null; this.refreshing = null;
      try { this.session = JSON.parse(storage.getItem('vp-session') || 'null'); } catch { this.clear(); }
    }
    clear() { this.session = null; try { this.storage.removeItem('vp-session'); } catch {} }
    save(data) {
      if (!data.access_token || !data.refresh_token) throw Error('No se pudo establecer la sesión.');
      this.session = {access_token:data.access_token, refresh_token:data.refresh_token,
        expires_at: data.expires_at || Math.floor(Date.now()/1000) + data.expires_in};
      try { this.storage.setItem('vp-session', JSON.stringify(this.session)); } catch {}
    }
    async request(path, method = 'GET', body, token = null) {
      const response = await this.fetcher(PROJECT + path, {method,
        headers:{apikey:KEY, ...(token ? {Authorization:'Bearer ' + token} : {}),
          ...(body ? {'Content-Type':'application/json'} : {})},
        body:body ? JSON.stringify(body) : undefined,
        cache:'no-store', redirect:'error', signal:AbortSignal.timeout(45000)});
      if (!response.ok) {
        const error = Error(response.status === 429 ? 'Demasiados intentos. Espera un momento.' :
          'No se pudo completar la solicitud. Revisa tus credenciales, conexión y permisos.');
        error.status = response.status; throw error;
      }
      if (response.status === 204) return null;
      const text = await response.text(); return text ? JSON.parse(text) : null;
    }
    async login(email, password) {
      this.clear();
      this.save(await this.request('/auth/v1/token?grant_type=password', 'POST', {email, password}));
      try { await this.checkAccess(); } catch (e) { await this.logout(); throw e; }
    }
    async token() {
      if (!this.session) throw Error('Ingresa con tu correo y contraseña.');
      if (this.session.expires_at * 1000 < Date.now() + 60000) {
        if (!this.refreshing) this.refreshing = (async () => {
          try { this.save(await this.request('/auth/v1/token?grant_type=refresh_token', 'POST',
            {refresh_token:this.session.refresh_token})); }
          catch (e) { this.clear(); throw e; }
          finally { this.refreshing = null; }
        })();
        await this.refreshing;
      }
      return this.session.access_token;
    }
    async checkAccess() {
      const rows = await this.request('/rest/v1/vp_access?select=enabled', 'GET', null, await this.token());
      if (!Array.isArray(rows) || rows.length !== 1 || rows[0].enabled !== true)
        throw Error('Tu cuenta no está habilitada para esta cabina. Contacta a Alejandro.');
    }
    async snapshot() {
      await this.checkAccess();
      const rows = await this.request('/rest/v1/vp_snapshot?id=eq.1&select=payload_gzip_base64,sha256,sales_cut',
        'GET', null, await this.token());
      if (!Array.isArray(rows) || rows.length !== 1)
        throw Error('Ingreso correcto. Aún no se ha cargado el primer corte de ventas.');
      const bytes = Uint8Array.from(atob(rows[0].payload_gzip_base64), c => c.charCodeAt(0));
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        c => c.toString(16).padStart(2,'0')).join('');
      if (digest !== rows[0].sha256) throw Error('El corte recibido no superó la verificación de integridad.');
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const data = JSON.parse(await new Response(stream).text());
      if (!Array.isArray(data.clients) || !data.dimensions || data.meta?.salesCut !== rows[0].sales_cut)
        throw Error('El corte no tiene el formato esperado.');
      data.meta.security = 'ACCESO AUTORIZADO · todas las sucursales';
      return data;
    }
    async changePassword(current, password) {
      const token = await this.token();
      const user = await this.request('/auth/v1/user', 'GET', null, token);
      // Reautenticar antes del cambio. No conservar la contraseña en memoria persistente.
      this.save(await this.request('/auth/v1/token?grant_type=password', 'POST', {email:user.email,password:current}));
      await this.request('/auth/v1/user', 'PUT', {password}, await this.token());
    }
    async logout() {
      const token = this.session?.access_token;
      this.clear();
      if (token) { try { await this.request('/auth/v1/logout?scope=local', 'POST', null, token); } catch {} }
    }
  }
  globalThis.VegaSession = VegaSession;
  if (typeof document === 'undefined') return;
  const session = new VegaSession();
  const el = id => document.getElementById(id);
  let resolveLogin;
  function showLogin(message = '') {
    el('loading').classList.add('hidden'); el('auth-panel').hidden = false;
    el('auth-message').textContent = message;
  }
  const waitLogin = () => new Promise(resolve => { resolveLogin = resolve; showLogin(); });
  el('login-form').addEventListener('submit', async event => {
    event.preventDefault(); el('login-button').disabled = true;
    el('auth-message').textContent = 'Comprobando ingreso…';
    try {
      await session.login(el('auth-email').value.trim(), el('auth-password').value);
      el('auth-password').value = ''; el('auth-panel').hidden = true;
      el('loading').classList.remove('hidden'); resolveLogin();
    } catch (error) { showLogin(error.message); }
    finally { el('auth-password').value = ''; el('login-button').disabled = false; }
  });
  el('logout-button').addEventListener('click', async () => {
    document.getElementById('app').remove(); // Retirar inmediatamente los datos de la vista.
    await session.logout(); location.reload();
  });
  el('reload-button').addEventListener('click', () => location.reload());
  el('password-button').addEventListener('click', () => el('password-dialog').showModal());
  el('password-cancel').addEventListener('click', () => { el('password-form').reset(); el('password-dialog').close(); });
  el('password-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (el('new-password').value !== el('repeat-password').value) {
      el('password-message').textContent = 'Las contraseñas no coinciden.'; return;
    }
    el('password-save').disabled = true;
    try {
      await session.changePassword(el('current-password').value, el('new-password').value);
      el('password-message').textContent = 'Contraseña actualizada. Ya puedes cerrar esta ventana.';
    } catch (error) { el('password-message').textContent = error.message; }
    finally { el('password-form').reset(); el('password-save').disabled = false; }
  });
  globalThis.VegaPortal = {
    async load() {
      if (session.session) {
        try { await session.checkAccess(); } catch { session.clear(); }
      }
      if (!session.session) await waitLogin();
      el('session-bar').hidden = false;
      // Verificar habilitación periódicamente; no refrescar ni descargar toda la cartera.
      setInterval(async () => {
        try { await session.checkAccess(); }
        catch {
          document.getElementById('app')?.remove(); session.clear(); location.reload();
        }
      }, 60000);
      return session.snapshot();
    }
  };
})();
