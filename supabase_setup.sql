-- ============================================================
--  SCRIPT DE CONFIGURACIÓN SUPABASE — Ahorros Mundial
--  Ejecuta esto en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. CATEGORÍAS
CREATE TABLE IF NOT EXISTS categorias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 50),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. TRANSACCIONES
CREATE TABLE IF NOT EXISTS transacciones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha        DATE NOT NULL,
  tipo         TEXT NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  monto        NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
  descripcion  TEXT CHECK (char_length(descripcion) <= 200),
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 3. METAS DE AHORRO
CREATE TABLE IF NOT EXISTS metas_ahorro (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anio        INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  mes         INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  monto       NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (usuario_id, anio, mes)
);

-- ============================================================
--  ÍNDICES para acelerar las consultas más frecuentes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transacciones_usuario_fecha
  ON transacciones (usuario_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_transacciones_categoria
  ON transacciones (categoria_id);

CREATE INDEX IF NOT EXISTS idx_categorias_usuario
  ON categorias (usuario_id);

-- ============================================================
--  ROW LEVEL SECURITY (RLS)
--  Cada usuario solo puede ver y modificar sus propios datos
-- ============================================================

-- Activar RLS en las tres tablas
ALTER TABLE categorias    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE metas_ahorro  ENABLE ROW LEVEL SECURITY;

-- ── POLÍTICAS: categorias ──────────────────────────────────
CREATE POLICY "categorias: ver las propias"
  ON categorias FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "categorias: crear las propias"
  ON categorias FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "categorias: actualizar las propias"
  ON categorias FOR UPDATE
  USING (auth.uid() = usuario_id);

CREATE POLICY "categorias: eliminar las propias"
  ON categorias FOR DELETE
  USING (auth.uid() = usuario_id);

-- ── POLÍTICAS: transacciones ───────────────────────────────
CREATE POLICY "transacciones: ver las propias"
  ON transacciones FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "transacciones: crear las propias"
  ON transacciones FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "transacciones: actualizar las propias"
  ON transacciones FOR UPDATE
  USING (auth.uid() = usuario_id);

CREATE POLICY "transacciones: eliminar las propias"
  ON transacciones FOR DELETE
  USING (auth.uid() = usuario_id);

-- ── POLÍTICAS: metas_ahorro ────────────────────────────────
CREATE POLICY "metas: ver las propias"
  ON metas_ahorro FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "metas: crear las propias"
  ON metas_ahorro FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "metas: actualizar las propias"
  ON metas_ahorro FOR UPDATE
  USING (auth.uid() = usuario_id);

CREATE POLICY "metas: eliminar las propias"
  ON metas_ahorro FOR DELETE
  USING (auth.uid() = usuario_id);

-- ============================================================
--  CATEGORÍAS POR DEFECTO
--  Se insertan solo cuando el usuario se registra (trigger)
-- ============================================================

-- Función que crea categorías iniciales para cada nuevo usuario
-- SET search_path fijo evita errores intermitentes al resolver el esquema
-- de "categorias" en el contexto de SECURITY DEFINER (causaba 500 en signup)
CREATE OR REPLACE FUNCTION crear_categorias_iniciales()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO categorias (usuario_id, nombre) VALUES
    (NEW.id, 'Comida'),
    (NEW.id, 'Transporte'),
    (NEW.id, 'Servicios'),
    (NEW.id, 'Ocio'),
    (NEW.id, 'Ahorro'),
    (NEW.id, 'Salud'),
    (NEW.id, 'Otros');
  RETURN NEW;
END;
$$;

-- Trigger que llama a la función cuando alguien se registra
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION crear_categorias_iniciales();
