-- TABLA PARA COORDINAR TRANSMISIONES EN VIVO (WebRTC)
CREATE TABLE IF NOT EXISTS public.transmisiones_vivas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID REFERENCES auth.users(id),
    punto_id UUID REFERENCES public.puntos_turisticos(id),
    peer_id TEXT NOT NULL, -- ID único de PeerJS para la conexión P2P
    activa BOOLEAN DEFAULT true,
    creado_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- HABILITAR REALTIME PARA ESTA TABLA
ALTER PUBLICATION supabase_realtime ADD TABLE transmisiones_vivas;

-- RLS (POLITICAS DE SEGURIDAD)
ALTER TABLE public.transmisiones_vivas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cualquiera puede ver transmisiones activas" 
ON public.transmisiones_vivas FOR SELECT USING (true);

CREATE POLICY "Usuarios autenticados pueden crear sus transmisiones" 
ON public.transmisiones_vivas FOR INSERT WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Dueño puede finalizar su transmisión" 
ON public.transmisiones_vivas FOR UPDATE USING (auth.uid() = usuario_id);
