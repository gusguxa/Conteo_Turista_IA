-- ============================================
-- SQL para ejecutar en Supabase SQL Editor
-- ============================================

-- 1. Agregar columnas de coordenadas a puntos_turisticos
ALTER TABLE puntos_turisticos 
  ADD COLUMN IF NOT EXISTS latitud DOUBLE PRECISION DEFAULT 21.8474,
  ADD COLUMN IF NOT EXISTS longitud DOUBLE PRECISION DEFAULT -102.7108;

-- 2. Crear tabla de calibración IA
CREATE TABLE IF NOT EXISTS calibracion_ia (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  punto_id UUID REFERENCES puntos_turisticos(id) ON DELETE CASCADE UNIQUE,
  umbral_confianza DOUBLE PRECISION DEFAULT 0.5,
  confianza_promedio DOUBLE PRECISION DEFAULT 0.0,
  total_detecciones INTEGER DEFAULT 0,
  correcciones_positivas INTEGER DEFAULT 0,
  correcciones_negativas INTEGER DEFAULT 0,
  actualizado_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Habilitar RLS (Row Level Security) en la nueva tabla
ALTER TABLE calibracion_ia ENABLE ROW LEVEL SECURITY;

-- 4. Política para que usuarios autenticados puedan leer y escribir
CREATE POLICY "Usuarios autenticados pueden leer calibracion" ON calibracion_ia
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar calibracion" ON calibracion_ia
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar calibracion" ON calibracion_ia
  FOR UPDATE TO authenticated USING (true);
