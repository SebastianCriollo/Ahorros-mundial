/* ===== MAIN APP ===== */
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ──────────────────────────────────────────────────
let currentUser = null;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let allCategories = [];
let allTransactions = [];
let editingTxId = null;
let chartPie = null;
let chartBar = null;
let chartComparison = null;

// ── Boot ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initChartDefaults();
  showLoading(true);

  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    window.location.replace('login.html');
    return;
  }
  currentUser = session.user;

  document.getElementById('user-email').textContent = currentUser.email;
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  await Promise.all([loadCategories(), loadGoal()]);
  setupNavigation();
  setupMonthNav();
  setupTransactionForm();
  setupFilters();
  setupCategoryManagement();
  setupGoalForm();

  await refreshAll();
  showLoading(false);

  db.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') window.location.replace('login.html');
  });
});

async function handleLogout() {
  await db.auth.signOut();
}

function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('show', show);
}

// ── Navigation ─────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.section).classList.add('active');
    });
  });
}

// ── Month Navigation ───────────────────────────────────────
function setupMonthNav() {
  document.getElementById('prev-month').addEventListener('click', () => {
    const p = prevMonth(currentYear, currentMonth);
    currentYear = p.year; currentMonth = p.month;
    updateMonthLabels();
    refreshAll();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    const n = nextMonth(currentYear, currentMonth);
    currentYear = n.year; currentMonth = n.month;
    updateMonthLabels();
    refreshAll();
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
  const { data, error } = await db
    .from('categorias')
    .select('*')
    .order('nombre');
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
    .from('metas_ahorro')
    .select('*')
    .eq('anio', now.getFullYear())
    .eq('mes', now.getMonth() + 1)
    .maybeSingle();
  if (data) {
    document.getElementById('goal-amount').value = data.monto;
  }
}

async function refreshAll() {
  await loadTransactions();
  applyFiltersAndRender();
  renderCharts();
  renderSummary();
  await loadComparisonData();
}

// ── Summary ────────────────────────────────────────────────
function renderSummary() {
  const income  = allTransactions.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + Number(t.monto), 0);
  const expense = allTransactions.filter(t => t.tipo === 'gasto').reduce((s, t)  => s + Number(t.monto), 0);
  const balance = income - expense;

  document.getElementById('total-income').textContent  = formatCurrency(income);
  document.getElementById('total-expense').textContent = formatCurrency(expense);
  document.getElementById('total-balance').textContent = formatCurrency(balance);
  document.getElementById('total-balance').className   = 'stat-value ' + (balance >= 0 ? 'positive' : 'negative');

  // Goal progress
  const goalVal = Number(document.getElementById('goal-amount').value) || 0;
  const pct     = goalVal > 0 ? Math.min((balance / goalVal) * 100, 100) : 0;
  const pctEl   = document.getElementById('goal-pct');
  const bar     = document.getElementById('goal-bar');
  pctEl.textContent = `${Math.round(pct)}%`;
  bar.style.width   = `${Math.max(0, pct)}%`;
  bar.className     = 'progress-bar' + (pct >= 100 ? ' success' : pct >= 60 ? '' : pct >= 30 ? ' warning' : ' danger');
  document.getElementById('goal-balance-val').textContent = formatCurrency(balance);
}

// ── Filters ────────────────────────────────────────────────
function setupFilters() {
  document.getElementById('filter-type').addEventListener('change', applyFiltersAndRender);
  document.getElementById('filter-category').addEventListener('change', applyFiltersAndRender);
  document.getElementById('filter-date-from').addEventListener('change', applyFiltersAndRender);
  document.getElementById('filter-date-to').addEventListener('change', applyFiltersAndRender);
  document.getElementById('filter-clear').addEventListener('click', clearFilters);
}

function clearFilters() {
  document.getElementById('filter-type').value = '';
  document.getElementById('filter-category').value = '';
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
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

  renderTransactionTable(filtered);
}

// ── Transaction Table ──────────────────────────────────────
function renderTransactionTable(transactions) {
  const tbody = document.getElementById('tx-tbody');
  if (transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">
      <div class="empty-state">
        <div class="icon">💸</div>
        <p>No hay transacciones para este período</p>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = transactions.map(t => {
    const catName = t.categorias?.nombre || 'Sin categoría';
    const isIncome = t.tipo === 'ingreso';
    return `
      <tr>
        <td>${formatDate(t.fecha)}</td>
        <td><span class="badge badge-${t.tipo}">${isIncome ? 'Ingreso' : 'Gasto'}</span></td>
        <td>${escHtml(catName)}</td>
        <td class="amount-${t.tipo}">${isIncome ? '+' : '-'}${formatCurrency(t.monto)}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(t.descripcion || '')}</td>
        <td>
          <div class="tx-actions">
            <button class="btn btn-sm btn-ghost" onclick="openEditModal('${t.id}')">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="deleteTx('${t.id}')">🗑</button>
          </div>
        </td>
      </tr>`;
  }).join('');
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
  const tx = readTxForm('tx');
  if (!validateTx(tx, 'tx')) return;

  const btn = document.getElementById('tx-submit-btn');
  btn.disabled = true;
  try {
    const { error } = await db.from('transacciones').insert({
      ...tx,
      usuario_id: currentUser.id
    });
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
    const el = document.getElementById(id);
    el.classList.add('error');
    valid = false;
    showToast(msg, 'error');
  };
  if (!tx.fecha)           markErr(`${prefix}-date`,     'Selecciona una fecha');
  if (!tx.tipo)            markErr(`${prefix}-type`,     'Selecciona el tipo');
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
  const options = `<option value="">Sin categoría</option>` +
    allCategories.map(c => `<option value="${c.id}">${escHtml(c.nombre)}</option>`).join('');

  ['tx-category','modal-category','filter-category'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = (id === 'filter-category' ? '<option value="">Todas</option>' : '') +
      allCategories.map(c => `<option value="${c.id}">${escHtml(c.nombre)}</option>`).join('');
  });
}

// ── Category Management ────────────────────────────────────
function renderCategoryChips() {
  const list = document.getElementById('category-list');
  if (!list) return;
  if (allCategories.length === 0) {
    list.innerHTML = '<p style="color:var(--gray-400);font-size:.875rem">No hay categorías aún</p>';
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
    mes: now.getMonth() + 1,
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
  const expenses = allTransactions.filter(t => t.tipo === 'gasto');
  const catTotals = {};
  expenses.forEach(t => {
    const name = t.categorias?.nombre || 'Sin categoría';
    catTotals[name] = (catTotals[name] || 0) + Number(t.monto);
  });

  const labels = Object.keys(catTotals);
  const values = Object.values(catTotals);
  const colors = [
    '#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6',
    '#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'
  ];

  const ctx = document.getElementById('pie-chart').getContext('2d');
  if (chartPie) chartPie.destroy();

  if (labels.length === 0) {
    document.getElementById('pie-chart').parentElement.innerHTML =
      '<div class="empty-state"><div class="icon">📊</div><p>Sin gastos este mes</p></div>';
    return;
  }

  chartPie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 2 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.raw)}`
          }
        }
      }
    }
  });
}

function renderBarChart() {
  const income  = allTransactions.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + Number(t.monto), 0);
  const expense = allTransactions.filter(t => t.tipo === 'gasto').reduce((s, t)  => s + Number(t.monto), 0);

  const ctx = document.getElementById('bar-chart').getContext('2d');
  if (chartBar) chartBar.destroy();

  chartBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Ingresos', 'Gastos', 'Balance'],
      datasets: [{
        data: [income, expense, income - expense],
        backgroundColor: ['#10b981', '#ef4444', income - expense >= 0 ? '#4f46e5' : '#f59e0b'],
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
          ticks: {
            callback: v => formatCurrency(v)
          }
        }
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
    const p = prevMonth(y, m);
    y = p.year; m = p.month;
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
  tbody.innerHTML = rows.map(r => `
    <div class="comparison-row">
      <div class="month-col">${monthLabel(r.year, r.month)}</div>
      <div class="num-col" style="color:var(--success)">${formatCurrency(r.income)}</div>
      <div class="num-col" style="color:var(--danger)">${formatCurrency(r.expense)}</div>
      <div class="num-col ${r.balance >= 0 ? 'amount-income' : 'amount-expense'}">${formatCurrency(r.balance)}</div>
    </div>`).join('');
}

function renderComparisonChart(rows) {
  const ctx = document.getElementById('comparison-chart').getContext('2d');
  if (chartComparison) chartComparison.destroy();

  chartComparison = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r => monthLabel(r.year, r.month).split(' ')[0]),
      datasets: [
        { label: 'Ahorro', data: rows.map(r => r.balance), backgroundColor: '#4f46e5', borderRadius: 6 },
        { label: 'Ingresos', data: rows.map(r => r.income), backgroundColor: '#10b981', borderRadius: 6 },
        { label: 'Gastos', data: rows.map(r => r.expense), backgroundColor: '#ef4444', borderRadius: 6 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { ticks: { callback: v => formatCurrency(v) } }
      }
    }
  });
}
