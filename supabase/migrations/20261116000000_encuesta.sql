-- =============================================================================
-- Che, ¿conocés? — Encuesta pública (/encuesta) y resultados para admins
-- Se puede responder sin cuenta. Cada respuesta se identifica con un token
-- aleatorio que el navegador guarda en localStorage; la base guarda solo su
-- hash. Escribir y retomar la propia respuesta va por RPCs que exigen ese
-- token; leer todo es solo para admins. Nada de lo existente cambia.
-- Requiere 20261115000000_ayuda_reclamos_feedback.sql (usa privado.clave()).
-- =============================================================================

create table public.encuesta_respuestas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.profiles (id) on delete set null,
  token_hash text not null unique,
  dispositivo_hash text,          -- hash de un id guardado en el dispositivo (límite diario)
  ip_hash text,                   -- hash de la IP con clave secreta (no se guarda la IP)
  rol text check (rol in ('contrato', 'trabajo', 'ambos')),
  completa boolean not null default false,
  contacto text check (char_length(contacto) <= 200),
  user_agent text check (char_length(user_agent) <= 300),
  es_bot boolean not null default false,  -- completó el campo trampa: se excluye de resultados
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index encuesta_respuestas_creado_idx on public.encuesta_respuestas (creado_en);
create index encuesta_respuestas_disp_idx on public.encuesta_respuestas (dispositivo_hash, creado_en);
create index encuesta_respuestas_ip_idx on public.encuesta_respuestas (ip_hash, creado_en);

create table public.encuesta_items (
  id uuid primary key default gen_random_uuid(),
  respuesta_id uuid not null references public.encuesta_respuestas (id) on delete cascade,
  pregunta_id text not null check (pregunta_id ~ '^p([1-9]|10)$'),
  opciones text[] not null default '{}',
  no_aplica boolean not null default false,
  texto text check (char_length(texto) <= 1000),
  audio_url text,                 -- ruta en el bucket privado "encuesta-audios"
  transcripcion text check (char_length(transcripcion) <= 4000),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (respuesta_id, pregunta_id),
  check (not (no_aplica and cardinality(opciones) > 0))
);

alter table public.encuesta_respuestas enable row level security;
alter table public.encuesta_items enable row level security;
revoke all on public.encuesta_respuestas, public.encuesta_items from anon, authenticated;

-- Leer: solo admins. Escribir: solo por las RPCs de abajo (validan token y límites).
grant select on public.encuesta_respuestas, public.encuesta_items to authenticated;
create policy encuesta_respuestas_admin on public.encuesta_respuestas for select to authenticated using (public.is_admin());
create policy encuesta_items_admin on public.encuesta_items for select to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function privado.hash_encuesta(v text) returns text
language sql stable security definer set search_path = '' as $$
  select case when v is null or v = '' then null
    else encode(extensions.hmac(v, privado.clave(), 'sha256'), 'hex') end
$$;

-- IP del pedido (PostgREST expone los headers). Puede venir vacía.
create or replace function privado.ip_pedido() returns text
language sql stable set search_path = '' as $$
  select nullif(trim(split_part(coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip',
    nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), '')
$$;

create or replace function privado.respuesta_por_token(p_token text) returns public.encuesta_respuestas
language plpgsql stable security definer set search_path = public as $$
declare r public.encuesta_respuestas;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid'; end if;
  select * into r from public.encuesta_respuestas
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  return r;
end $$;

revoke all on all functions in schema privado from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- RPCs públicas (anon y authenticated)
-- -----------------------------------------------------------------------------

-- Guarda (o reemplaza) la respuesta a una pregunta. La primera vez crea la
-- respuesta, aplicando el límite diario: 3 por dispositivo y 20 por IP
-- (muchos celulares comparten IP en las redes móviles, por eso es más alto).
-- Devuelve el id de la respuesta (para la carpeta de audios).
create or replace function public.encuesta_guardar(
  p_token text,
  p_dispositivo text,
  p_pregunta text,
  p_opciones text[],
  p_no_aplica boolean,
  p_texto text,
  p_audio text,
  p_transcripcion text,
  p_user_agent text default null,
  p_trampa text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r public.encuesta_respuestas;
  ops text[] := coalesce(p_opciones, '{}');
  max_sel int;
  disp text := privado.hash_encuesta(left(p_dispositivo, 100));
  ip text := privado.hash_encuesta(privado.ip_pedido());
begin
  if p_pregunta is null or p_pregunta !~ '^p([1-9]|10)$' then raise exception 'invalid'; end if;
  max_sel := case when p_pregunta in ('p1', 'p6', 'p9', 'p10') then 1 when p_pregunta in ('p4', 'p8') then 3 else 6 end;
  if cardinality(ops) > max_sel
     or exists (select 1 from unnest(ops) o where o !~ '^[a-z_]{1,30}$')
     or cardinality(ops) <> (select count(distinct o) from unnest(ops) o) then
    raise exception 'invalid';
  end if;
  if coalesce(p_no_aplica, false) and cardinality(ops) > 0 then raise exception 'invalid'; end if;
  if char_length(p_texto) > 1000 or char_length(p_transcripcion) > 4000 then raise exception 'invalid'; end if;

  r := privado.respuesta_por_token(p_token);
  if r.id is null then
    if (disp is not null and (select count(*) from public.encuesta_respuestas
          where dispositivo_hash = disp and creado_en > now() - interval '24 hours') >= 3)
       or (ip is not null and (select count(*) from public.encuesta_respuestas
          where ip_hash = ip and creado_en > now() - interval '24 hours') >= 20) then
      raise exception 'encuesta_limit';
    end if;
    insert into public.encuesta_respuestas (usuario_id, token_hash, dispositivo_hash, ip_hash, user_agent, es_bot)
    values (auth.uid(), encode(extensions.digest(p_token, 'sha256'), 'hex'), disp, ip,
            left(p_user_agent, 300), coalesce(p_trampa, '') <> '')
    returning * into r;
  end if;
  if r.completa then raise exception 'encuesta_completa'; end if;

  if p_audio is not null and p_audio !~ ('^' || r.id::text || '/[0-9a-f-]{36}\.(webm|m4a|mp4|ogg)$') then
    raise exception 'invalid';
  end if;

  insert into public.encuesta_items (respuesta_id, pregunta_id, opciones, no_aplica, texto, audio_url, transcripcion)
  values (r.id, p_pregunta, ops, coalesce(p_no_aplica, false),
          nullif(trim(coalesce(p_texto, '')), ''), p_audio, nullif(trim(coalesce(p_transcripcion, '')), ''))
  on conflict (respuesta_id, pregunta_id) do update
    set opciones = excluded.opciones, no_aplica = excluded.no_aplica, texto = excluded.texto,
        audio_url = excluded.audio_url, transcripcion = excluded.transcripcion, actualizado_en = now();

  update public.encuesta_respuestas
    set actualizado_en = now(),
        rol = case when p_pregunta = 'p1' then (case when ops[1] in ('contrato', 'trabajo', 'ambos') then ops[1] end) else rol end,
        es_bot = es_bot or coalesce(p_trampa, '') <> '',
        usuario_id = coalesce(usuario_id, auth.uid())
    where id = r.id;
  return r.id;
end $$;

-- Para retomar una encuesta a medias en el mismo dispositivo.
create or replace function public.encuesta_estado(p_token text)
returns json
language plpgsql stable security definer set search_path = public as $$
declare r public.encuesta_respuestas;
begin
  r := privado.respuesta_por_token(p_token);
  if r.id is null then return null; end if;
  return json_build_object(
    'respuesta_id', r.id,
    'completa', r.completa,
    'items', coalesce((select json_agg(json_build_object(
        'pregunta_id', i.pregunta_id, 'opciones', i.opciones, 'no_aplica', i.no_aplica,
        'texto', i.texto, 'audio_url', i.audio_url, 'transcripcion', i.transcripcion))
      from public.encuesta_items i where i.respuesta_id = r.id), '[]'::json));
end $$;

-- Marca la respuesta como completa y guarda el contacto opcional.
-- Se puede volver a llamar para agregar el contacto después de terminar.
create or replace function public.encuesta_completar(p_token text, p_contacto text default null, p_trampa text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.encuesta_respuestas;
begin
  r := privado.respuesta_por_token(p_token);
  if r.id is null then raise exception 'not_found'; end if;
  if char_length(trim(coalesce(p_contacto, ''))) > 200 then raise exception 'invalid'; end if;
  update public.encuesta_respuestas
    set completa = true,
        contacto = coalesce(nullif(trim(coalesce(p_contacto, '')), ''), contacto),
        es_bot = es_bot or coalesce(p_trampa, '') <> '',
        actualizado_en = now()
    where id = r.id;
end $$;

-- -----------------------------------------------------------------------------
-- Resultados (solo admin). Devuelve respuestas e ítems filtrados; los
-- conteos y gráficos se calculan en el cliente.
-- -----------------------------------------------------------------------------
create or replace function public.admin_encuesta(p_rol text default null, p_desde date default null, p_hasta date default null)
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return (
    with r as (
      select * from public.encuesta_respuestas
      where not es_bot
        and (p_rol is null or rol = p_rol)
        and (p_desde is null or creado_en >= p_desde)
        and (p_hasta is null or creado_en < p_hasta + 1)
    )
    select json_build_object(
      'respuestas', coalesce((select json_agg(json_build_object(
          'id', r.id, 'rol', r.rol, 'completa', r.completa, 'contacto', r.contacto,
          'user_agent', r.user_agent, 'con_cuenta', r.usuario_id is not null,
          'creado_en', r.creado_en, 'actualizado_en', r.actualizado_en) order by r.creado_en desc) from r), '[]'::json),
      'items', coalesce((select json_agg(json_build_object(
          'respuesta_id', i.respuesta_id, 'pregunta_id', i.pregunta_id, 'opciones', i.opciones,
          'no_aplica', i.no_aplica, 'texto', i.texto, 'audio_url', i.audio_url,
          'transcripcion', i.transcripcion, 'creado_en', i.creado_en))
        from public.encuesta_items i join r on r.id = i.respuesta_id), '[]'::json))
  );
end $$;

-- -----------------------------------------------------------------------------
-- Storage: audios. Bucket privado; subir puede cualquiera, pero solo dentro de
-- la carpeta de una respuesta activa (id que solo conoce quien tiene el token),
-- con máximo 12 audios por respuesta. Leer: solo admins (con URL firmada).
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('encuesta-audios', 'encuesta-audios', false, 5242880,
        array['audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/mpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.puede_subir_audio_encuesta(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webm|m4a|mp4|ogg)$'
    and exists (
      select 1 from public.encuesta_respuestas r
      where r.id::text = split_part(p_name, '/', 1)
        and not r.completa and r.actualizado_en > now() - interval '6 hours')
    and (select count(*) from storage.objects o
         where o.bucket_id = 'encuesta-audios' and split_part(o.name, '/', 1) = split_part(p_name, '/', 1)) < 12
$$;

create policy "encuesta_audios_insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'encuesta-audios' and public.puede_subir_audio_encuesta(name));
create policy "encuesta_audios_admin_read" on storage.objects for select to authenticated
  using (bucket_id = 'encuesta-audios' and public.is_admin());

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.encuesta_guardar(text, text, text, text[], boolean, text, text, text, text, text),
  public.encuesta_estado(text),
  public.encuesta_completar(text, text, text),
  public.puede_subir_audio_encuesta(text)
to anon, authenticated;
grant execute on function public.admin_encuesta(text, date, date) to authenticated;
-- is_admin() la usan las políticas de lectura del bucket.
grant execute on function public.is_admin() to authenticated;
