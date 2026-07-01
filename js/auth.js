/* ===== AUTH MODULE ===== */
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Redirect to app if already logged in
async function checkAuthAndRedirect() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    window.location.replace('index.html');
  }
}

async function handleLogin(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function handleSignup(email, password) {
  const { data, error } = await db.auth.signUp({ email, password });
  if (error) throw error;
  // Supabase a veces retorna sin sesión ni error cuando el email requiere confirmación
  if (!data.session && !data.user) throw { message: 'signup_no_session' };
  return data;
}

// ===== DOM LOGIC (login.html only) =====
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthAndRedirect();

  const tabs     = document.querySelectorAll('.tab-btn');
  const panels   = document.querySelectorAll('.tab-panel');
  const toast    = (msg, type) => showToast(msg, type);

  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // --- Login form ---
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = e.target.querySelector('[type=submit]');
    const spinner  = btn.querySelector('.spinner');

    if (!validateEmail(email)) return markError('login-email', 'Ingresa un email válido');
    if (password.length < 6)   return markError('login-password', 'Mínimo 6 caracteres');

    btn.disabled = true;
    spinner.classList.add('show');
    try {
      await handleLogin(email, password);
      window.location.replace('index.html');
    } catch (err) {
      const msg = err?.message || err?.error_description || JSON.stringify(err) || '';
      toast(friendlyError(msg), 'error');
    } finally {
      btn.disabled = false;
      spinner.classList.remove('show');
    }
  });

  // --- Signup form ---
  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirm  = document.getElementById('signup-confirm').value;
    const btn      = e.target.querySelector('[type=submit]');
    const spinner  = btn.querySelector('.spinner');

    clearErrors();
    if (!validateEmail(email))       return markError('signup-email', 'Email inválido');
    if (password.length < 6)         return markError('signup-password', 'Mínimo 6 caracteres');
    if (password !== confirm)        return markError('signup-confirm', 'Las contraseñas no coinciden');

    btn.disabled = true;
    spinner.classList.add('show');
    try {
      const { data } = await handleSignup(email, password);
      if (data.session) {
        window.location.replace('index.html');
      } else {
        toast('Cuenta creada. Revisa tu email para confirmar.', 'success');
      }
    } catch (err) {
      const msg = err?.message || err?.error_description || JSON.stringify(err) || '';
      toast(friendlyError(msg), 'error');
    } finally {
      btn.disabled = false;
      spinner.classList.remove('show');
    }
  });
});

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function markError(id, msg) {
  const el = document.getElementById(id);
  el.classList.add('error');
  // Support both flat layout and wrapped layout (input inside auth-input-row)
  let errEl = el.nextElementSibling;
  if (!errEl || !errEl.classList.contains('error-msg')) {
    errEl = el.closest('.auth-field')?.querySelector('.error-msg')
          || el.parentElement?.nextElementSibling;
  }
  if (errEl && errEl.classList.contains('error-msg')) {
    errEl.textContent = msg;
    errEl.classList.add('show');
  }
}

function clearErrors() {
  document.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));
  document.querySelectorAll('.error-msg.show').forEach(el => el.classList.remove('show'));
}

function friendlyError(msg) {
  if (!msg || typeof msg !== 'string' || msg === '{}' || msg.trim() === '')
    return 'Supabase tiene un problema técnico ahora mismo. Espera unos minutos e intenta de nuevo.';
  if (msg.includes('Invalid login') || msg.includes('invalid_credentials')) return 'Email o contraseña incorrectos';
  if (msg.includes('already registered') || msg.includes('User already registered')) return 'Este email ya está registrado. Inicia sesión.';
  if (msg.includes('Email not confirmed') || msg.includes('email_not_confirmed')) return 'Debes confirmar tu email antes de entrar';
  if (msg.includes('Password should') || msg.includes('weak')) return 'La contraseña debe tener al menos 6 caracteres';
  if (msg.includes('signups are disabled') || msg.includes('Signups not allowed')) return 'El registro está desactivado. Revisa la configuración de Supabase.';
  if (msg.includes('signup_no_session')) return 'Revisa tu email y confirma tu cuenta para continuar';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Demasiados intentos. Espera un momento.';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('Failed')) return 'Error de conexión. Revisa tu internet.';
  return msg;
}
