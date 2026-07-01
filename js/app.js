/* ===== MAIN APP ===== */
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ──────────────────────────────────────────────────
let currentUser    = null;
let currentYear    = new Date().getFullYear();
let currentMonth   = new Date().getMonth() + 1;
let allCategories  = [];
let allTransactions = [];
let allBudgets     = [];   // presupuestos por categoría
let allRecurring   = [];   // transacciones recurrentes
let currentFiltered = [];  // último set filtrado (para exportar)
let annualYear     = new Date().getFullYear();
let editingTxId    = null;
let chartPie       = null;
let chartBar       = null;
let chartComparison = null;
let chartSparkline  = null;
let chartAnnual    = null;

// ── Boot ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initChartDefaults();
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color       = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.08)';
  }
  showLoading(true);

  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.replace('login.html'); return; }
  currentUser = session.user;

  document.getElementById('user-email').textContent = currentUser.email;
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  await Promise.all([loadCategories(), loadGoal(), loadBudgets(), loadRecurring()]);
  setupNavigation();
  setupMonthNav();
  setupTransactionForm();
  setupFilters();
  setupCategoryManagement();
  setupGoalForm();
  setupBudgets();
  setupRecurring();
  setupExport();
  setupAnnual();

  renderBudgetConfig();
  renderRecurringList();
  await refreshAll();
  await renderAnnual();
  showLoading(false);

  db.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') window.location.replace('login.html');
  });
});

async function handleLogout() { await db.auth.signOut(); }

function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('show', show);
}

// ── Navigation ─────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.dk-section').forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.section)?.classList.add('active');
    });
  });
}

// ── Month Navigation ───────────────────────────────────────
function setupMonthNav() {
  document.getElementById('prev-month').addEventListener('click', () => {
    const p = prevMonth(currentYear, currentMonth);
    currentYear = p.year; currentMonth = p.month;
    updateMonthLabels(); refreshAll();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    const n = nextMonth(currentYear, currentMonth);
    currentYear = n.year; currentMonth = n.month;
    updateMonthLabels(); refreshAll();
  });
  updateMonthLabels();
}

function updateMonthLabels() {
  document.querySelectorAll('.month-label').forEach(el => {
    el.textContent = monthLabel(currentYear, currentMonth);
  });
}

// ── Data Loading ───────────────────────────────────────────
async function loadCategories() {
  const { data, error } = await db.from('categorias').select('*').order('nombre');
  if (error) { showToast('Error cargando categorías', 'error'); return; }
  allCategories = data;
  populateCategorySelects();
  renderCategoryChips();
}

async function loadTransactions() {
  const { from, to } = monthRange(currentYear, currentMonth);
  const { data, error } = await db
    .from('transacciones')
    .select('*, categorias(nombre)')
    .gte('fecha', from)
    .lte('fecha', to)
    .order('fecha', { ascending: false });
  if (error) { showToast('Error cargando transacciones', 'error'); return; }
  allTransactions = data;
}

async function loadGoal() {
  const now = new Date();
  const { data } = await db
    .from('metas_ahorro').select('*')
    .eq('anio', now.getFullYear())
    .eq('mes', now.getMonth() + 1)
    .maybeSingle();
  if (data) document.getElementById('goal-amount').value = data.monto;
}

async function refreshAll() {
  await loadTransactions();
  applyFiltersAndRender();
  renderCharts();
  renderSummary();
  renderRecentTransactions();
  renderSparkline();
  renderBudgetProgress();
  await loadComparisonData();
}

// ── Summary ────────────────────────────────────────────────
function renderSummary() {
  const income  = allTransactions.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + Number(t.monto), 0);
  const expense = allTransactions.filter(t => t.tipo === 'gasto').reduce((s, t)  => s + Number(t.monto), 0);
  const balance = income - expense;

  document.getElementById('total-income').textContent  = formatCurrency(income);
  document.getElementById('total-expense').textContent = formatCurrency(expense);

  const balEl  = document.getElementById('total-balance');
  const balStr = formatCurrency(balance);
  balEl.dataset.real = balStr;
  if (document.getElementById('eye-icon-open')?.style.display !== 'none') {
    balEl.textContent = balStr;
  }

  const goalVal = Number(document.getElementById('goal-amount').value) || 0;
  const pct     = goalVal > 0 ? Math.min((balance / goalVal) * 100, 100) : 0;
  const pctEl   = document.getElementById('goal-pct');
  const bar     = document.getElementById('goal-bar');
  if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
  if (bar) {
    bar.style.width      = `${Math.max(0, pct)}%`;
    bar.style.background = pct >= 100 ? '#34d399' : pct >= 30 ? '#F07272' : '#f87171';
  }
  const gBalEl = document.getElementById('goal-balance-val');
  if (gBalEl) gBalEl.textContent = formatCurrency(balance);
}

// ── Filters ────────────────────────────────────────────────
function setupFilters() {
  ['filter-type','filter-category','filter-date-from','filter-date-to'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyFiltersAndRender);
  });
  document.getElementById('filter-clear').addEventListener('click', clearFilters);
}

function clearFilters() {
  document.getElementById('filter-type').value      = '';
  document.getElementById('filter-category').value  = '';
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value   = '';
  applyFiltersAndRender();
}

function applyFiltersAndRender() {
  const type     = document.getElementById('filter-type').value;
  const catId    = document.getElementById('filter-category').value;
  const dateFrom = document.getElementById('filter-date-from').value;
  const dateTo   = document.getElementById('filter-date-to').value;

  let filtered = allTransactions;
  if (type)     filtered = filtered.filter(t => t.tipo === type);
  if (catId)    filtered = filtered.filter(t => String(t.categoria_id) === catId);
  if (dateFrom) filtered = filtered.filter(t => t.fecha >= dateFrom);
  if (dateTo)   filtered = filtered.filter(t => t.fecha <= dateTo);

  currentFiltered = filtered;
  renderTransactionTable(filtered);
  renderTransactionList(filtered);
}

// ── Transaction Table (hidden, for JS compatibility) ───────
function renderTransactionTable(transactions) {
  const tbody = document.getElementById('tx-tbody');
  if (!tbody) return;
  tbody.innerHTML = transactions.map(t => {
    const catName  = t.categorias?.nombre || 'Sin categoría';
    const isIncome = t.tipo === 'ingreso';
    return `<tr>
      <td>${formatDate(t.fecha)}</td>
      <td>${isIncome ? 'Ingreso' : 'Gasto'}</td>
      <td>${escHtml(catName)}</td>
      <td>${isIncome ? '+' : '-'}${formatCurrency(t.monto)}</td>
      <td>${escHtml(t.descripcion || '')}</td>
      <td>
        <button onclick="openEditModal('${t.id}')">✏️</button>
        <button onclick="deleteTx('${t.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

// ── Category icon map ──────────────────────────────────────
const CAT_ICONS = {
  'Comida':'🍽️','Alimentación':'🍽️','Transporte':'🚗','Ocio':'🎬',
  'Entretenimiento':'🎬','Salud':'💊','Vivienda':'🏠','Ropa':'👕',
  'Educación':'📚','Servicios':'⚡','Trabajo':'💼','Ahorro':'🏦','Otros':'📦'
};

// ── Transaction List (modern cards) ───────────────────────
function renderTransactionList(transactions) {
  const container = document.getElementById('tx-list-main');
  if (!container) return;

  if (transactions.length === 0) {
    container.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--dk-text3,#64748b)">
      <div style="font-size:2rem;margin-bottom:.5rem">💸</div>
      <p style="font-size:.875rem">No hay transacciones para este período</p>
    </div>`;
    return;
  }

  container.innerHTML = transactions.map(t => {
    const catName  = t.categorias?.nombre || 'Sin categoría';
    const isIncome = t.tipo === 'ingreso';
    const icon     = CAT_ICONS[catName] || (isIncome ? '💵' : '💸');
    const desc     = t.descripcion || catName;
    return `
      <div class="dk-tx-item">
        <div class="dk-tx-icon ${isIncome ? 'income' : 'expense'}">${icon}</div>
        <div class="dk-tx-body">
          <div class="dk-tx-name">${escHtml(desc)}</div>
          <div class="dk-tx-meta">${escHtml(catName)} · ${formatDate(t.fecha)}</div>
        </div>
        <div class="dk-tx-right">
          <div class="dk-tx-amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '-'}${formatCurrency(t.monto)}</div>
        </div>
        <div class="dk-tx-actions">
          <button class="dk-btn dk-btn-ghost dk-btn-sm" onclick="openEditModal('${t.id}')" title="Editar">✏️</button>
          <button class="dk-btn dk-btn-danger dk-btn-sm" onclick="deleteTx('${t.id}')" title="Eliminar">🗑</button>
        </div>
      </div>`;
  }).join('');
}

// ── Recent Transactions (dashboard preview) ────────────────
function renderRecentTransactions() {
  const container = document.getElementById('recent-tx-list');
  if (!container) return;
  const recent = allTransactions.slice(0, 5);

  if (recent.length === 0) {
    container.innerHTML = `<div style="padding:1.25rem;text-align:center;color:var(--dk-text3,#64748b);font-size:.875rem">
      Aún no hay transacciones este mes
    </div>`;
    return;
  }

  container.innerHTML = recent.map(t => {
    const catName  = t.categorias?.nombre || 'Sin categoría';
    const isIncome = t.tipo === 'ingreso';
    const icon     = CAT_ICONS[catName] || (isIncome ? '💵' : '💸');
    const desc     = t.descripcion || catName;
    return `
      <div class="dk-tx-item">
        <div class="dk-tx-icon ${isIncome ? 'income' : 'expense'}">${icon}</div>
        <div class="dk-tx-body">
          <div class="dk-tx-name">${escHtml(desc)}</div>
          <div class="dk-tx-meta">${escHtml(catName)}</div>
        </div>
        <div class="dk-tx-right">
          <div class="dk-tx-amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '-'}${formatCurrency(t.monto)}</div>
          <div class="dk-tx-date">${formatDate(t.fecha)}</div>
        </div>
      </div>`;
  }).join('');
}

// ── Sparkline (balance trend line) ────────────────────────
function renderSparkline() {
  const canvas = document.getElementById('sparkline-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (chartSparkline) { chartSparkline.destroy(); chartSparkline = null; }

  const sorted = [...allTransactions].sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (sorted.length === 0) return;

  const days = {};
  sorted.forEach(t => {
    const v = Number(t.monto) * (t.tipo === 'ingreso' ? 1 : -1);
    days[t.fecha] = (days[t.fecha] || 0) + v;
  });

  let running = 0;
  const points = Object.values(days).map(v => { running += v; return running; });

  chartSparkline = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: Object.keys(days),
      datasets: [{
        data: points,
        borderColor: 'rgba(255,255,255,0.8)',
        borderWidth: 1.5,
        fill: true,
        backgroundColor: 'rgba(255,255,255,0.1)',
        tension: 0.4,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      animation: { duration: 300 }
    }
  });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Transaction Form ───────────────────────────────────────
function setupTransactionForm() {
  document.getElementById('tx-form').addEventListener('submit', handleTxSubmit);
  document.getElementById('tx-date').value = todayISO();
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', handleModalSave);
  document.getElementById('tx-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
}

async function handleTxSubmit(e) {
  e.preventDefault();
  const tx  = readTxForm('tx');
  if (!validateTx(tx, 'tx')) return;

  const btn = document.getElementById('tx-submit-btn');
  btn.disabled = true;
  try {
    const { error } = await db.from('transacciones').insert({ ...tx, usuario_id: currentUser.id });
    if (error) throw error;
    showToast('Transacción guardada ✓', 'success');
    e.target.reset();
    document.getElementById('tx-date').value = todayISO();
    await refreshAll();
  } catch (err) {
    showToast('Error al guardar: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function readTxForm(prefix) {
  return {
    fecha:        document.getElementById(`${prefix}-date`).value,
    tipo:         document.getElementById(`${prefix}-type`).value,
    categoria_id: document.getElementById(`${prefix}-category`).value || null,
    monto:        parseFloat(document.getElementById(`${prefix}-amount`).value),
    descripcion:  document.getElementById(`${prefix}-desc`).value.trim(),
  };
}

function validateTx(tx, prefix) {
  let valid = true;
  const markErr = (id, msg) => {
    document.getElementById(id)?.classList.add('error');
    showToast(msg, 'error');
    valid = false;
  };
  if (!tx.fecha)                   markErr(`${prefix}-date`,   'Selecciona una fecha');
  if (!tx.tipo)                    markErr(`${prefix}-type`,   'Selecciona el tipo');
  if (!tx.monto || tx.monto <= 0) markErr(`${prefix}-amount`, 'Ingresa un monto válido');
  return valid;
}

// ── Edit Modal ─────────────────────────────────────────────
function openEditModal(id) {
  const tx = allTransactions.find(t => t.id === id);
  if (!tx) return;
  editingTxId = id;

  document.getElementById('modal-date').value     = tx.fecha;
  document.getElementById('modal-type').value     = tx.tipo;
  document.getElementById('modal-category').value = tx.categoria_id || '';
  document.getElementById('modal-amount').value   = tx.monto;
  document.getElementById('modal-desc').value     = tx.descripcion || '';

  document.getElementById('tx-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('tx-modal').classList.remove('open');
  editingTxId = null;
}

async function handleModalSave() {
  const tx = readTxForm('modal');
  if (!validateTx(tx, 'modal')) return;

  const btn = document.getElementById('modal-save');
  btn.disabled = true;
  try {
    const { error } = await db.from('transacciones').update(tx).eq('id', editingTxId);
    if (error) throw error;
    showToast('Actualizado ✓', 'success');
    closeModal();
    await refreshAll();
  } catch (err) {
    showToast('Error al actualizar: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteTx(id) {
  if (!confirm('¿Eliminar esta transacción?')) return;
  const { error } = await db.from('transacciones').delete().eq('id', id);
  if (error) { showToast('Error al eliminar', 'error'); return; }
  showToast('Eliminado ✓', 'success');
  await refreshAll();
}

// ── Category Selects ───────────────────────────────────────
function populateCategorySelects() {
  ['tx-category','modal-category','filter-category','rec-category'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = (id === 'filter-category'
      ? '<option value="">Todas las categorías</option>'
      : '<option value="">Sin categoría</option>') +
      allCategories.map(c => `<option value="${c.id}">${escHtml(c.nombre)}</option>`).join('');
    if (prev) el.value = prev;
  });
}

// ── Category Management ────────────────────────────────────
function renderCategoryChips() {
  const list = document.getElementById('category-list');
  if (!list) return;
  if (allCategories.length === 0) {
    list.innerHTML = '<p style="color:var(--dk-text3,#64748b);font-size:.875rem">No hay categorías aún</p>';
    return;
  }
  list.innerHTML = allCategories.map(c => `
    <div class="category-chip">
      ${escHtml(c.nombre)}
      <button onclick="deleteCategory('${c.id}')" title="Eliminar">×</button>
    </div>`).join('');
}

function setupCategoryManagement() {
  document.getElementById('add-category-btn').addEventListener('click', addCategory);
  document.getElementById('new-category-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCategory(); }
  });
}

async function addCategory() {
  const input = document.getElementById('new-category-input');
  const name  = input.value.trim();
  if (!name) return showToast('Escribe el nombre de la categoría', 'error');
  if (allCategories.some(c => c.nombre.toLowerCase() === name.toLowerCase()))
    return showToast('Esa categoría ya existe', 'error');

  const { error } = await db.from('categorias').insert({ nombre: name, usuario_id: currentUser.id });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  input.value = '';
  showToast('Categoría agregada ✓', 'success');
  await loadCategories();
}

async function deleteCategory(id) {
  if (!confirm('¿Eliminar esta categoría? Las transacciones asociadas quedarán sin categoría.')) return;
  const { error } = await db.from('categorias').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Categoría eliminada', 'success');
  await loadCategories();
  await refreshAll();
}

// ── Goal ───────────────────────────────────────────────────
function setupGoalForm() {
  document.getElementById('goal-save-btn').addEventListener('click', saveGoal);
}

async function saveGoal() {
  const monto = parseFloat(document.getElementById('goal-amount').value);
  if (!monto || monto <= 0) return showToast('Ingresa un monto válido', 'error');

  const now = new Date();
  const { error } = await db.from('metas_ahorro').upsert({
    usuario_id: currentUser.id,
    anio: now.getFullYear(),
    mes:  now.getMonth() + 1,
    monto
  }, { onConflict: 'usuario_id,anio,mes' });

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Meta guardada ✓', 'success');
  renderSummary();
}

// ── Charts ─────────────────────────────────────────────────
function renderCharts() {
  renderPieChart();
  renderBarChart();
}

function renderPieChart() {
  const expenses  = allTransactions.filter(t => t.tipo === 'gasto');
  const catTotals = {};
  expenses.forEach(t => {
    const name = t.categorias?.nombre || 'Sin categoría';
    catTotals[name] = (catTotals[name] || 0) + Number(t.monto);
  });

  const labels = Object.keys(catTotals);
  const values = Object.values(catTotals);
  const colors = [
    '#F07272','#34d399','#f59e0b','#60a5fa','#c084fc',
    '#06b6d4','#fb923c','#a3e635','#f472b6','#818cf8'
  ];

  const canvas = document.getElementById('pie-chart');
  if (!canvas) return;
  if (chartPie) { chartPie.destroy(); chartPie = null; }

  if (labels.length === 0) {
    canvas.style.display = 'none';
    let empty = canvas.parentElement.querySelector('.chart-empty-msg');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'chart-empty-msg';
      empty.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:.5rem;color:var(--dk-text3,#64748b)';
      empty.innerHTML = '<span style="font-size:1.75rem">📊</span><span style="font-size:.875rem">Sin gastos este mes</span>';
      canvas.parentElement.appendChild(empty);
    } else {
      empty.style.display = 'flex';
    }
    return;
  }

  canvas.style.display = '';
  canvas.parentElement.querySelector('.chart-empty-msg')?.remove();

  chartPie = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: cTick(), padding: 12, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.raw)}` } }
      }
    }
  });
}

function renderBarChart() {
  const income  = allTransactions.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + Number(t.monto), 0);
  const expense = allTransactions.filter(t => t.tipo === 'gasto').reduce((s, t)  => s + Number(t.monto), 0);
  const balance = income - expense;

  const ctx = document.getElementById('bar-chart')?.getContext('2d');
  if (!ctx) return;
  if (chartBar) chartBar.destroy();

  chartBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Ingresos', 'Gastos', 'Balance'],
      datasets: [{
        data: [income, expense, balance],
        backgroundColor: ['#34d399', '#f87171', balance >= 0 ? '#F07272' : '#f59e0b'],
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          ticks: { callback: v => formatCurrency(v), color: cTick(), maxTicksLimit: 5 },
          grid:  { color: cGrid() }
        },
        x: { ticks: { color: cTick() }, grid: { display: false } }
      }
    }
  });
}

// ── Month Comparison ───────────────────────────────────────
async function loadComparisonData() {
  const months = [];
  let y = currentYear, m = currentMonth;
  for (let i = 0; i < 6; i++) {
    months.unshift({ year: y, month: m });
    const p = prevMonth(y, m); y = p.year; m = p.month;
  }

  const rows = await Promise.all(months.map(async ({ year, month }) => {
    const { from, to } = monthRange(year, month);
    const { data } = await db.from('transacciones').select('tipo,monto').gte('fecha', from).lte('fecha', to);
    const income  = (data || []).filter(t => t.tipo === 'ingreso').reduce((s, t) => s + Number(t.monto), 0);
    const expense = (data || []).filter(t => t.tipo === 'gasto').reduce((s, t)  => s + Number(t.monto), 0);
    return { year, month, income, expense, balance: income - expense };
  }));

  renderComparisonTable(rows);
  renderComparisonChart(rows);
}

function renderComparisonTable(rows) {
  const tbody = document.getElementById('comparison-tbody');
  if (!tbody) return;
  tbody.innerHTML = rows.map(r => `
    <div class="comparison-row">
      <div class="month-col">${monthLabel(r.year, r.month)}</div>
      <div class="num-col" style="color:#34d399">${formatCurrency(r.income)}</div>
      <div class="num-col" style="color:#f87171">${formatCurrency(r.expense)}</div>
      <div class="num-col" style="color:${r.balance >= 0 ? '#34d399' : '#f87171'}">${formatCurrency(r.balance)}</div>
    </div>`).join('');
}

function renderComparisonChart(rows) {
  const ctx = document.getElementById('comparison-chart')?.getContext('2d');
  if (!ctx) return;
  if (chartComparison) chartComparison.destroy();

  chartComparison = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r => monthLabel(r.year, r.month).split(' ')[0]),
      datasets: [
        { label: 'Ahorro',   data: rows.map(r => r.balance), backgroundColor: '#F07272', borderRadius: 5 },
        { label: 'Ingresos', data: rows.map(r => r.income),  backgroundColor: '#34d399', borderRadius: 5 },
        { label: 'Gastos',   data: rows.map(r => r.expense), backgroundColor: '#f87171', borderRadius: 5 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: cTick(), boxWidth: 12 } } },
      scales: {
        y: {
          ticks: { callback: v => formatCurrency(v), color: cTick(), maxTicksLimit: 5 },
          grid:  { color: cGrid() }
        },
        x: { ticks: { color: cTick() }, grid: { display: false } }
      }
    }
  });
}

// ════════════════════════════════════════════════════════════
//  TEMA (colores de gráficos según claro/oscuro)
// ════════════════════════════════════════════════════════════
function isLight() { return document.body.classList.contains('light'); }
function cTick()   { return isLight() ? '#475569' : '#94a3b8'; }
function cGrid()   { return isLight() ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'; }

function refreshChartsForTheme() {
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = cTick();
    Chart.defaults.borderColor = cGrid();
  }
  if (!currentUser) return;   // aún no hay datos cargados
  renderCharts();
  renderSparkline();
  loadComparisonData();
  renderAnnual();
}

// ════════════════════════════════════════════════════════════
//  PRESUPUESTOS POR CATEGORÍA
// ════════════════════════════════════════════════════════════
async function loadBudgets() {
  try {
    const { data, error } = await db.from('presupuestos').select('*');
    if (error) throw error;
    allBudgets = data || [];
  } catch (err) {
    allBudgets = [];   // la tabla aún no existe → se ignora sin romper la app
  }
}

function setupBudgets() {
  // los inputs se generan dinámicamente en renderBudgetConfig
}

function renderBudgetConfig() {
  const cont = document.getElementById('budget-config-list');
  if (!cont) return;
  if (allCategories.length === 0) {
    cont.innerHTML = '<p class="dk-text-muted" style="font-size:.85rem">Crea categorías primero.</p>';
    return;
  }
  cont.innerHTML = allCategories.map(c => {
    const b = allBudgets.find(x => x.categoria_id === c.id);
    const val = b ? b.monto : '';
    const icon = CAT_ICONS[c.nombre] || '📦';
    return `
      <div class="dk-budget-row">
        <span class="dk-budget-cat">${icon} ${escHtml(c.nombre)}</span>
        <input type="number" class="dk-input dk-input-sm dk-budget-input"
               data-cat="${c.id}" placeholder="Sin límite" min="0" step="any" value="${val}">
        <button class="dk-btn dk-btn-outline dk-btn-sm" onclick="saveBudget('${c.id}')">Guardar</button>
      </div>`;
  }).join('');
}

async function saveBudget(catId) {
  const input = document.querySelector(`.dk-budget-input[data-cat="${catId}"]`);
  const monto = parseFloat(input.value);

  if (!monto || monto <= 0) {
    // borrar presupuesto si lo dejan vacío o en cero
    const existing = allBudgets.find(b => b.categoria_id === catId);
    if (existing) {
      const { error } = await db.from('presupuestos').delete().eq('id', existing.id);
      if (error) return showToast('Error: ' + error.message, 'error');
      showToast('Presupuesto eliminado', 'success');
    }
  } else {
    const { error } = await db.from('presupuestos').upsert({
      usuario_id: currentUser.id, categoria_id: catId, monto
    }, { onConflict: 'usuario_id,categoria_id' });
    if (error) {
      if (String(error.message).includes('presupuestos'))
        return showToast('Falta crear la tabla. Ejecuta supabase_extras.sql', 'error');
      return showToast('Error: ' + error.message, 'error');
    }
    showToast('Presupuesto guardado ✓', 'success');
  }
  await loadBudgets();
  renderBudgetProgress();
}

function renderBudgetProgress() {
  const card = document.getElementById('budget-card');
  const cont = document.getElementById('budget-progress-list');
  if (!cont || !card) return;

  const active = allBudgets.filter(b => Number(b.monto) > 0);
  if (active.length === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  // gasto del mes por categoría
  const spent = {};
  allTransactions.filter(t => t.tipo === 'gasto').forEach(t => {
    if (t.categoria_id) spent[t.categoria_id] = (spent[t.categoria_id] || 0) + Number(t.monto);
  });

  cont.innerHTML = active.map(b => {
    const cat  = allCategories.find(c => c.id === b.categoria_id);
    const name = cat ? cat.nombre : 'Categoría';
    const icon = CAT_ICONS[name] || '📦';
    const used = spent[b.categoria_id] || 0;
    const pct  = Math.min((used / Number(b.monto)) * 100, 100);
    const over = used > Number(b.monto);
    const color = over ? '#f87171' : pct >= 80 ? '#f59e0b' : '#34d399';
    return `
      <div class="dk-budget-prog">
        <div class="dk-budget-prog-top">
          <span class="dk-budget-prog-name">${icon} ${escHtml(name)}</span>
          <span class="dk-budget-prog-num" style="color:${over ? '#f87171' : 'inherit'}">
            ${formatCurrency(used)} / ${formatCurrency(b.monto)}
          </span>
        </div>
        <div class="dk-progress-wrap">
          <div class="dk-progress-bar" style="width:${pct}%;background:${color}"></div>
        </div>
        ${over ? '<span class="dk-budget-over">⚠ Superaste el presupuesto</span>' : ''}
      </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════
//  TRANSACCIONES RECURRENTES
// ════════════════════════════════════════════════════════════
async function loadRecurring() {
  try {
    const { data, error } = await db
      .from('transacciones_recurrentes')
      .select('*, categorias(nombre)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    allRecurring = data || [];
  } catch (err) {
    allRecurring = [];
  }
}

function setupRecurring() {
  const form = document.getElementById('recurring-form');
  if (form) form.addEventListener('submit', addRecurring);
}

function renderRecurringList() {
  const cont = document.getElementById('recurring-list');
  if (!cont) return;
  if (allRecurring.length === 0) {
    cont.innerHTML = '<p class="dk-text-muted" style="font-size:.85rem">Aún no tienes plantillas recurrentes.</p>';
    return;
  }
  cont.innerHTML = allRecurring.map(r => {
    const catName = r.categorias?.nombre || 'Sin categoría';
    const isIncome = r.tipo === 'ingreso';
    const icon = CAT_ICONS[catName] || (isIncome ? '💵' : '💸');
    const desc = r.descripcion || catName;
    return `
      <div class="dk-rec-item">
        <div class="dk-tx-icon ${isIncome ? 'income' : 'expense'}">${icon}</div>
        <div class="dk-tx-body">
          <div class="dk-tx-name">${escHtml(desc)}</div>
          <div class="dk-tx-meta">${escHtml(catName)} · día ${r.dia_del_mes} · ${isIncome ? 'Ingreso' : 'Gasto'}</div>
        </div>
        <div class="dk-tx-amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '-'}${formatCurrency(r.monto)}</div>
        <div class="dk-tx-actions">
          <button class="dk-btn dk-btn-primary dk-btn-sm" onclick="applyRecurring('${r.id}')" title="Agregar al mes actual">Aplicar</button>
          <button class="dk-btn dk-btn-danger dk-btn-sm" onclick="deleteRecurring('${r.id}')" title="Eliminar">🗑</button>
        </div>
      </div>`;
  }).join('');
}

async function addRecurring(e) {
  e.preventDefault();
  const rec = {
    usuario_id:   currentUser.id,
    tipo:         document.getElementById('rec-type').value,
    categoria_id: document.getElementById('rec-category').value || null,
    monto:        parseFloat(document.getElementById('rec-amount').value),
    descripcion:  document.getElementById('rec-desc').value.trim(),
    dia_del_mes:  parseInt(document.getElementById('rec-day').value) || 1,
  };
  if (!rec.monto || rec.monto <= 0) return showToast('Ingresa un monto válido', 'error');

  const { error } = await db.from('transacciones_recurrentes').insert(rec);
  if (error) {
    if (String(error.message).includes('transacciones_recurrentes'))
      return showToast('Falta crear la tabla. Ejecuta supabase_extras.sql', 'error');
    return showToast('Error: ' + error.message, 'error');
  }
  showToast('Recurrente agregada ✓', 'success');
  e.target.reset();
  document.getElementById('rec-day').value = '1';
  await loadRecurring();
  renderRecurringList();
}

async function deleteRecurring(id) {
  if (!confirm('¿Eliminar esta plantilla recurrente?')) return;
  const { error } = await db.from('transacciones_recurrentes').delete().eq('id', id);
  if (error) return showToast('Error: ' + error.message, 'error');
  showToast('Eliminada', 'success');
  await loadRecurring();
  renderRecurringList();
}

async function applyRecurring(id) {
  const r = allRecurring.find(x => x.id === id);
  if (!r) return;

  // fecha dentro del mes que se está viendo (ajustando día si el mes es más corto)
  const lastDay = new Date(currentYear, currentMonth, 0).getDate();
  const day     = Math.min(r.dia_del_mes, lastDay);
  const fecha   = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

  // evitar duplicados: misma descripción, monto, tipo y mes
  const dup = allTransactions.find(t =>
    t.tipo === r.tipo &&
    Number(t.monto) === Number(r.monto) &&
    (t.descripcion || '') === (r.descripcion || '') &&
    String(t.categoria_id) === String(r.categoria_id)
  );
  if (dup && !confirm('Parece que ya existe una transacción igual este mes. ¿Agregar de todas formas?')) return;

  const { error } = await db.from('transacciones').insert({
    usuario_id:   currentUser.id,
    fecha,
    tipo:         r.tipo,
    categoria_id: r.categoria_id,
    monto:        r.monto,
    descripcion:  r.descripcion,
  });
  if (error) return showToast('Error: ' + error.message, 'error');
  showToast(`"${r.descripcion || 'Recurrente'}" agregada a ${monthLabel(currentYear, currentMonth)} ✓`, 'success');
  await refreshAll();
}

// ════════════════════════════════════════════════════════════
//  EXPORTAR CSV
// ════════════════════════════════════════════════════════════
function setupExport() {
  const btn = document.getElementById('export-csv-btn');
  if (btn) btn.addEventListener('click', exportCSV);
}

function exportCSV() {
  const rows = currentFiltered.length ? currentFiltered : allTransactions;
  if (rows.length === 0) return showToast('No hay transacciones para exportar', 'error');

  const header = ['Fecha', 'Tipo', 'Categoría', 'Monto', 'Descripción'];
  const csvRows = rows.map(t => {
    const cat = t.categorias?.nombre || 'Sin categoría';
    return [
      t.fecha,
      t.tipo,
      cat,
      t.monto,
      (t.descripcion || '').replace(/"/g, '""')
    ].map(v => `"${v}"`).join(',');
  });

  const csv = '﻿' + [header.join(','), ...csvRows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ahorros_${currentYear}-${String(currentMonth).padStart(2,'0')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV descargado ✓', 'success');
}

// ════════════════════════════════════════════════════════════
//  RESUMEN ANUAL
// ════════════════════════════════════════════════════════════
function setupAnnual() {
  document.getElementById('prev-year')?.addEventListener('click', () => {
    annualYear--; renderAnnual();
  });
  document.getElementById('next-year')?.addEventListener('click', () => {
    annualYear++; renderAnnual();
  });
}

async function renderAnnual() {
  const lbl = document.getElementById('year-label');
  if (lbl) lbl.textContent = annualYear;

  const from = `${annualYear}-01-01`;
  const to   = `${annualYear}-12-31`;
  const { data } = await db.from('transacciones').select('fecha,tipo,monto').gte('fecha', from).lte('fecha', to);
  const txs = data || [];

  const incomeByMonth  = new Array(12).fill(0);
  const expenseByMonth = new Array(12).fill(0);
  txs.forEach(t => {
    const m = parseInt(t.fecha.split('-')[1]) - 1;
    if (t.tipo === 'ingreso') incomeByMonth[m]  += Number(t.monto);
    else                      expenseByMonth[m] += Number(t.monto);
  });

  const totalIncome  = incomeByMonth.reduce((a, b) => a + b, 0);
  const totalExpense = expenseByMonth.reduce((a, b) => a + b, 0);

  document.getElementById('annual-income').textContent  = formatCurrency(totalIncome);
  document.getElementById('annual-expense').textContent = formatCurrency(totalExpense);
  document.getElementById('annual-savings').textContent = formatCurrency(totalIncome - totalExpense);

  const ctx = document.getElementById('annual-chart')?.getContext('2d');
  if (!ctx) return;
  if (chartAnnual) chartAnnual.destroy();

  chartAnnual = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
      datasets: [
        { label: 'Ingresos', data: incomeByMonth,  backgroundColor: '#34d399', borderRadius: 4 },
        { label: 'Gastos',   data: expenseByMonth, backgroundColor: '#f87171', borderRadius: 4 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: cTick(), boxWidth: 12 } } },
      scales: {
        y: { ticks: { callback: v => formatCurrency(v), color: cTick(), maxTicksLimit: 5 }, grid: { color: cGrid() } },
        x: { ticks: { color: cTick() }, grid: { display: false } }
      }
    }
  });
}
