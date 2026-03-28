// js/auth.js — Supabase auth layer
// Credentials are hardcoded (anon/publishable key — safe to commit).
// secrets.js can override via window.SUPABASE_URL / window.SUPABASE_ANON_KEY.
(function () {
  const URL = window.SUPABASE_URL || 'https://rxnljetuukqtlmauuruz.supabase.co';
  const KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_oM6zcplDuEfB1vowTdnUDg_Uxdf0ulm';

  if (typeof window.supabase === 'undefined') {
    console.warn('[auth] Supabase CDN not loaded — auth disabled');
    return;
  }

  // createClient processes the hash token asynchronously — do not touch the hash before this
  const client = window.supabase.createClient(URL, KEY);
  window.__supabase = client;

  function updateAuthWidget(user) {
    const lbl = document.getElementById('systemProfileLabel');
    if (lbl) {
      const name = user?.user_metadata?.full_name || user?.email || null;
      lbl.textContent = name ? `Profile — ${name.split(' ')[0]}` : 'Profile / Sign in';
    }
    // systemProfileLink is now a button — panel handles routing based on auth state
    const signOut = document.getElementById('btnSystemSignOut');
    if (signOut) signOut.classList.toggle('hidden', !user);
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
    signOut: () => client.auth.signOut(),
  };

  // Wire sign out button
  const _signOutBtn = document.getElementById('btnSystemSignOut');
  if (_signOutBtn) _signOutBtn.addEventListener('click', () => window.mgAuth.signOut());

  // Init: check session, wire widget, show guest notice if needed
  client.auth.getSession().then(({ data: { session } }) => {
    console.log('[auth] getSession:', session ? session.user.email : 'no session');
    updateAuthWidget(session?.user || null);
    if (!session) showGuestNotice();
  }).catch(e => console.warn('[auth] getSession error', e));

  client.auth.onAuthStateChange((_event, session) => {
    console.log('[auth] onAuthStateChange:', _event, session ? session.user.email : 'no session');
    // Safe to clean the token hash now — Supabase has already read and processed it
    try {
      if (window.location.hash && window.location.hash.includes('access_token')) {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      }
    } catch(e) {}
    updateAuthWidget(session?.user || null);
    if (!session) showGuestNotice();
    else {
      sessionStorage.setItem('mg_guest_dismissed', '1');
      const n = document.getElementById('guestNotice');
      if (n) n.classList.add('hidden');
    }
  });
})();
