// js/auth.js — Supabase auth layer
// Credentials are hardcoded (anon/publishable key — safe to commit).
// secrets.js can override via window.SUPABASE_URL / window.SUPABASE_ANON_KEY.
(function () {
  // Clean OAuth token hash immediately, before any async work
  try {
    if (window.location.hash && window.location.hash.includes('access_token')) {
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    }
  } catch(e) {}

  const URL = window.SUPABASE_URL || 'https://rxnljetuukqtlmauuruz.supabase.co';
  const KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_oM6zcplDuEfB1vowTdnUDg_Uxdf0ulm';

  if (typeof window.supabase === 'undefined') {
    console.warn('[auth] Supabase CDN not loaded — auth disabled');
    return;
  }

  const client = window.supabase.createClient(URL, KEY);
  window.__supabase = client;

  function _initials(user) {
    const name = user.user_metadata?.full_name || user.email || '';
    return name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() || '?';
  }

  function updateAuthWidget(user) {
    const w = document.getElementById('authWidget');
    if (w) {
      if (user) {
        w.innerHTML = `<a href="./profile.html" title="Profile" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-weight:700;font-size:0.8rem;color:#67e8f9;text-decoration:none;">${_initials(user)}</a>`;
      } else {
        w.innerHTML = `<a href="./login.html" title="Sign in" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:1rem;color:#94a3b8;text-decoration:none;">⎋</a>`;
      }
    }
    // Update system panel profile label
    const lbl = document.getElementById('systemProfileLabel');
    if (lbl) {
      const name = user?.user_metadata?.full_name || user?.email || null;
      lbl.textContent = name ? `Profile — ${name.split(' ')[0]}` : 'Profile / Sign in';
    }
    const link = document.getElementById('systemProfileLink');
    if (link) link.href = user ? './profile.html' : './login.html';
  }

  function showGuestNotice() {
    if (sessionStorage.getItem('mg_guest_dismissed')) return;
    const n = document.getElementById('guestNotice');
    if (n) n.classList.remove('hidden');
  }

  window.__dismissGuestNotice = function () {
    sessionStorage.setItem('mg_guest_dismissed', '1');
    const n = document.getElementById('guestNotice');
    if (n) n.classList.add('hidden');
  };

  window.mgAuth = {
    getSession: () => client.auth.getSession(),
    getCurrentUser: async () => {
      const { data: { session } } = await client.auth.getSession();
      return session?.user || null;
    },
    signInWithGoogle: () => client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href.split('?')[0].split('#')[0] },
    }),
    signOut: async () => {
      await client.auth.signOut();
      updateAuthWidget(null);
    },
  };

  // Init: check session, wire widget, show guest notice if needed
  client.auth.getSession().then(({ data: { session } }) => {
    updateAuthWidget(session?.user || null);
    if (!session) showGuestNotice();
    else console.log('[auth] signed in as', session.user.email);
  }).catch(() => {});

  client.auth.onAuthStateChange((_event, session) => {
    updateAuthWidget(session?.user || null);
    if (!session) showGuestNotice();
    else {
      console.log('[auth] session established for', session.user.email);
      sessionStorage.setItem('mg_guest_dismissed', '1');
      const n = document.getElementById('guestNotice');
      if (n) n.classList.add('hidden');
    }
  });
})();
