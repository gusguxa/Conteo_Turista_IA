-- Crear tabla de notificaciones para alertas de aforo
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  punto_id uuid REFERENCES public.puntos_turisticos(id) ON DELETE CASCADE,
  mensaje text NOT NULL,
  tipo text DEFAULT 'ALERTA_CAPACIDAD', -- ALERTA_CAPACIDAD, SISTEMA, INFO
  leida boolean DEFAULT false,
  creado_at timestamptz DEFAULT now()
);

-- Habilitar Realtime para notificaciones
ALTER PUBLICATION supabase_realtime ADD TABLE notificaciones;

-- Comentario para el dashboard
COMMENT ON TABLE public.notificaciones IS 'Tabla para almacenar alertas automáticas de capacidad y avisos de IA.';
