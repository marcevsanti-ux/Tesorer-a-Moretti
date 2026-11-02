-- Mesa de Ayuda: CASOS y EVIDENCIA. Ejecutar en Supabase SQL Editor.
BEGIN;
ALTER TABLE public.mesa_reclamos ADD COLUMN IF NOT EXISTS drive_id bigint;
ALTER TABLE public.mesa_reclamos ADD COLUMN IF NOT EXISTS caso_tipo text NOT NULL DEFAULT 'Sin clasificar';
CREATE UNIQUE INDEX IF NOT EXISTS mesa_reclamos_drive_id_unique ON public.mesa_reclamos(drive_id) WHERE drive_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.mesa_reclamos_evidencias (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reclamo_id uuid NOT NULL REFERENCES public.mesa_reclamos(id) ON DELETE CASCADE,
 nombre text NOT NULL, path text NOT NULL UNIQUE,
 mime_type text NOT NULL, tamano bigint NOT NULL CHECK(tamano>=0 AND tamano<=52428800),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mesa_reclamos_evidencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mesa_evidencias_lectura" ON public.mesa_reclamos_evidencias FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.mesa_usuarios u WHERE u.user_id=auth.uid() AND u.activo=true));
CREATE POLICY "mesa_evidencias_escritura" ON public.mesa_reclamos_evidencias FOR INSERT TO authenticated
 WITH CHECK (EXISTS(SELECT 1 FROM public.mesa_usuarios u WHERE u.user_id=auth.uid() AND u.activo=true));
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('mesa-evidencias','mesa-evidencias',false,52428800,ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "mesa_storage_lectura" ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id='mesa-evidencias' AND EXISTS(SELECT 1 FROM public.mesa_usuarios u WHERE u.user_id=auth.uid() AND u.activo=true));
CREATE POLICY "mesa_storage_subida" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id='mesa-evidencias' AND EXISTS(SELECT 1 FROM public.mesa_usuarios u WHERE u.user_id=auth.uid() AND u.activo=true));
CREATE POLICY "mesa_storage_borrado" ON storage.objects FOR DELETE TO authenticated
 USING (bucket_id='mesa-evidencias' AND EXISTS(SELECT 1 FROM public.mesa_usuarios u WHERE u.user_id=auth.uid() AND u.activo=true));
COMMIT;
-- Nota: drive_id es el ID numérico de la planilla; no se infiere de un reclamo existente.
