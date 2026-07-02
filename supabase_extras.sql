-- ============================================================
--  MIGRACIÓN — Funciones nuevas (Gestor de Ahorros y Gastos)
--  Ejecuta esto en: Supabase Dashboard → SQL Editor → New query
--  Es seguro ejecutarlo aunque ya tengas las tablas base.
-- ============================================================

-- ── 4. PRESUPUESTOS POR CATEGORÍA ──────────────────────────
-- Un límite de gasto mensual por cada categoría.
CREATE TABLE IF NOT EXISTS presupuestos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  monto        NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (usuario_id, categoria_id)
);

-- ── 5. TRANSACCIONES RECURRENTES ───────────────────────────
-- Plantillas de gastos/ingresos que se repiten cada mes
-- (arriendo, sueldo, suscripciones, etc.)
CREATE TABLE IF NOT EXISTS transacciones_recurrentes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  monto        NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
  descripcion  TEXT CHECK (char_length(descripcion) <= 200),
  dia_del_mes  INTEGER NOT NULL DEFAULT 1 CHECK (dia_del_mes BETWEEN 1 AND 31),
  activo       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── ÍNDICES ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_presupuestos_usuario
  ON presupuestos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_recurrentes_usuario
  ON transacciones_recurrentes (usuario_id);

-- ── ROW LEVEL SECURITY ─────────────────────────────────────
ALTER TABLE presupuestos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacciones_recurrentes ENABLE ROW LEVEL SECURITY;

-- presupuestos
DROP POLICY IF EXISTS "presupuestos: ver los propios" ON presupuestos;
CREATE POLICY "presupuestos: ver los propios"
  ON presupuestos FOR SELECT USING (auth.uid() = usuario_id);
DROP POLICY IF EXISTS "presupuestos: crear los propios" ON presupuestos;
CREATE POLICY "presupuestos: crear los propios"
  ON presupuestos FOR INSERT WITH CHECK (auth.uid() = usuario_id);
DROP POLICY IF EXISTS "presupuestos: actualizar los propios" ON presupuestos;
CREATE POLICY "presupuestos: actualizar los propios"
  ON presupuestos FOR UPDATE USING (auth.uid() = usuario_id);
DROP POLICY IF EXISTS "presupuestos: eliminar los propios" ON presupuestos;
CREATE POLICY "presupuestos: eliminar los propios"
  ON presupuestos FOR DELETE USING (auth.uid() = usuario_id);

-- transacciones_recurrentes
DROP POLICY IF EXISTS "recurrentes: ver las propias" ON transacciones_recurrentes;
CREATE POLICY "recurrentes: ver las propias"
  ON transacciones_recurrentes FOR SELECT USING (auth.uid() = usuario_id);
DROP POLICY IF EXISTS "recurrentes: crear las propias" ON transacciones_recurrentes;
CREATE POLICY "recurrentes: crear las propias"
  ON transacciones_recurrentes FOR INSERT WITH CHECK (auth.uid() = usuario_id);
DROP POLICY IF EXISTS "recurrentes: actualizar las propias" ON transacciones_recurrentes;
CREATE POLICY "recurrentes: actualizar las propias"
  ON transacciones_recurrentes FOR UPDATE USING (auth.uid() = usuario_id);
DROP POLICY IF EXISTS "recurrentes: eliminar las propias" ON transacciones_recurrentes;
CREATE POLICY "recurrentes: eliminar las propias"
  ON transacciones_recurrentes FOR DELETE USING (auth.uid() = usuario_id);
