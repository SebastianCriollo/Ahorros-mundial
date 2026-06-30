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
      toast(friendlyError(err.message), 'error');
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
        toast('¡Cuenta creada! Revisa tu email para confirmar.', 'success');
      }
    } catch (err) {
      toast(friendlyError(err.message), 'error');
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
  const errEl = el.nextElementSibling;
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
  if (msg.includes('Invalid login')) return 'Email o contraseña incorrectos';
  if (msg.includes('already registered')) return 'Este email ya está registrado';
  if (msg.includes('Email not confirmed')) return 'Confirma tu email primero';
  if (msg.includes('Password should')) return 'La contraseña debe tener al menos 6 caracteres';
  return msg;
}
