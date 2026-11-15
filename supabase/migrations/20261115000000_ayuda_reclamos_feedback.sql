-- =============================================================================
-- Che, ¿conocés? — Ayuda: reclamos entre personas, reportes técnicos y feedback
--   1. Cifrado de datos sensibles (clave en Supabase Vault)
--   2. reclamos + historial + mensajes + adjuntos (bucket privado)
--   3. feedback (sugerencias, caritas y reportes técnicos)
--   4. valoraciones_favor (después de un intercambio)
--   5. votos de la hoja de ruta
--   6. RPCs de usuario y de admin
-- Nada de lo existente se borra ni cambia de comportamiento.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Cifrado
-- El texto libre de los reclamos (descripción y mensajes) puede incluir datos
-- de salud, seguridad o de terceros. Se guarda cifrado con pgp_sym_encrypt
-- (AES-256). La clave vive en Supabase Vault, que a su vez la guarda cifrada
-- con una clave raíz que no está en la base. Así, un volcado o backup de la base,
-- el editor de tablas, Realtime y los logs nunca muestran el texto en claro.
-- Solo las funciones SECURITY DEFINER de este archivo descifran, y solo para
-- quien tiene permiso de verlo.
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'che_datos_sensibles') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'che_datos_sensibles',
      'Clave AES para texto de reclamos (pgp_sym_encrypt). No rotar sin re-cifrar.'
    );
  end if;
end $$;

-- Esquema no expuesto por la API (PostgREST solo publica "public").
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create or replace function privado.clave() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'che_datos_sensibles' limit 1
$$;

create or replace function privado.cifrar(t text) returns bytea
language plpgsql volatile security definer set search_path = '' as $$
begin
  if t is null then return null; end if;
  return extensions.pgp_sym_encrypt(t, privado.clave(), 'cipher-algo=aes256');
end $$;

create or replace function privado.descifrar(b bytea) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if b is null then return null; end if;
  return extensions.pgp_sym_decrypt(b, privado.clave());
end $$;

revoke all on all functions in schema privado from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Reclamos
-- -----------------------------------------------------------------------------
create type public.reclamo_estado as enum ('recibido', 'en_revision', 'esperando_respuesta', 'resuelto', 'cerrado');
create type public.reclamo_rol as enum ('pedi', 'hice');
create type public.reclamo_motivo as enum (
  'no_se_presento', 'no_pago', 'trabajo_mal', 'cambio_acuerdo', 'trato_irrespetuoso', 'inseguro', 'otro');
create type public.reclamo_resultado as enum ('hablarlo', 'corregir', 'pago', 'registro', 'bloquear');

-- Números de reclamo por año: CHE-2026-0001, CHE-2026-0002…
create table privado.reclamo_contadores (
  anio int primary key,
  ultimo int not null default 0
);

create table public.reclamos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  autor_id uuid not null references public.profiles (id) on delete cascade,
  contra_id uuid not null references public.profiles (id) on delete cascade,
  rol_autor public.reclamo_rol not null,
  motivo public.reclamo_motivo not null,
  descripcion bytea not null,                                  -- cifrada
  descripcion_privada boolean not null default false,          -- true: la otra parte no la ve
  fecha_hecho date not null,
  resultado_deseado public.reclamo_resultado not null,
  chat_id uuid references public.messages (id) on delete set null, -- último mensaje del chat al iniciar
  favor_id uuid references public.exchanges (id) on delete set null,
  estado public.reclamo_estado not null default 'recibido',
  respuesta_limite timestamptz,                                -- 72 h para la otra parte
  confirmado boolean not null default false,                   -- un admin lo confirmó como fundado
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (autor_id <> contra_id)
);
create index reclamos_autor_idx on public.reclamos (autor_id, creado_en desc);
create index reclamos_contra_idx on public.reclamos (contra_id, creado_en desc);
create index reclamos_estado_idx on public.reclamos (estado, creado_en desc);

create table public.reclamo_historial (
  id uuid primary key default gen_random_uuid(),
  reclamo_id uuid not null references public.reclamos (id) on delete cascade,
  estado public.reclamo_estado not null,
  cambiado_por uuid references public.profiles (id) on delete set null,
  creado_en timestamptz not null default now()
);
create index reclamo_historial_idx on public.reclamo_historial (reclamo_id, creado_en);

-- visible_para: quién (además de los admins) ve el mensaje.
--   'ambos'  → autor y otra parte   'autor' → solo autor   'contra' → solo otra parte
-- es_interno = nota del equipo: solo admins.
create table public.reclamo_mensajes (
  id uuid primary key default gen_random_uuid(),
  reclamo_id uuid not null references public.reclamos (id) on delete cascade,
  autor_id uuid references public.profiles (id) on delete set null,
  texto bytea not null,                                        -- cifrado
  es_interno boolean not null default false,
  visible_para text not null default 'ambos' check (visible_para in ('ambos', 'autor', 'contra')),
  creado_en timestamptz not null default now()
);
create index reclamo_mensajes_idx on public.reclamo_mensajes (reclamo_id, creado_en);

create table public.reclamo_adjuntos (
  id uuid primary key default gen_random_uuid(),
  reclamo_id uuid not null references public.reclamos (id) on delete cascade,
  url text not null unique,                                    -- ruta en el bucket privado "reclamos"
  subido_por uuid references public.profiles (id) on delete set null,
  es_privado boolean not null default false,
  creado_en timestamptz not null default now()
);
create index reclamo_adjuntos_idx on public.reclamo_adjuntos (reclamo_id);

-- Historial automático de cada cambio de estado + fecha de actualización.
create or replace function public.on_reclamo_estado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.reclamo_historial (reclamo_id, estado, cambiado_por) values (new.id, new.estado, auth.uid());
  elsif new.estado is distinct from old.estado then
    insert into public.reclamo_historial (reclamo_id, estado, cambiado_por) values (new.id, new.estado, auth.uid());
  end if;
  return new;
end $$;
create trigger reclamos_historial after insert or update of estado on public.reclamos
  for each row execute function public.on_reclamo_estado();

create or replace function public.touch_reclamo() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;
create trigger reclamos_touch before update on public.reclamos
  for each row execute function public.touch_reclamo();

-- Helpers
-- Quién puede ver un reclamo: quien lo hizo, los admins y la otra parte SOLO
-- cuando tiene plazo para responder (respuesta_limite). Los reclamos de
-- seguridad nacen sin plazo: la otra parte no sabe que existen hasta que el
-- equipo decide pedirle su versión.
create or replace function public.puede_ver_reclamo(p_reclamo uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.reclamos
    where id = p_reclamo
      and (autor_id = auth.uid() or (contra_id = auth.uid() and respuesta_limite is not null)))
$$;

-- "Alguien de tu red": amigos, amigos de amigos, o alguien con quien hubo
-- chat, un intercambio, una presentación o un ofrecimiento. Incluye a quienes
-- yo bloqueé (tienen que poder ser reclamados).
create or replace function public.tiene_relacion(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a <> b and (
    public.are_friends(a, b)
    or exists (select 1 from public.friend_ids(a) f(id) where public.are_friends(f.id, b))
    or exists (select 1 from public.messages m
               where (m.sender_id = a and m.recipient_id = b) or (m.sender_id = b and m.recipient_id = a))
    or exists (select 1 from public.exchanges e
               where (e.requester_id = a and e.helper_id = b) or (e.requester_id = b and e.helper_id = a))
    or exists (select 1 from public.intro_requests i
               where (i.requester_id = a and i.target_id = b) or (i.requester_id = b and i.target_id = a))
    or exists (select 1 from public.offers o join public.requests r on r.id = o.request_id
               where (o.helper_id = a and r.author_id = b) or (o.helper_id = b and r.author_id = a))
  )
$$;

-- Personas en 3 o más reclamos confirmados en los últimos 90 días.
create or replace function public.reclamos_confirmados_90d(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.reclamos
  where contra_id = p_user and confirmado and creado_en > now() - interval '90 days'
$$;

-- -----------------------------------------------------------------------------
-- 3. Feedback (sugerencias, caritas, reportes técnicos)
-- -----------------------------------------------------------------------------
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.profiles (id) on delete set null,
  tipo text not null check (tipo in ('idea', 'confuso', 'gusto', 'carita', 'tecnico')),
  puntaje smallint check (puntaje between 1 and 5),
  texto text check (char_length(texto) <= 2000),
  intentaba text check (char_length(intentaba) <= 500),         -- solo reportes técnicos
  url_pagina text check (char_length(url_pagina) <= 500),
  navegador text check (char_length(navegador) <= 300),
  captura_path text,
  permite_contacto boolean not null default false,
  estado text not null default 'nuevo' check (estado in ('nuevo', 'visto', 'resuelto')),
  creado_en timestamptz not null default now(),
  check (tipo <> 'carita' or puntaje is not null),
  check (tipo = 'carita' or char_length(trim(coalesce(texto, ''))) >= 5)
);
create index feedback_tipo_idx on public.feedback (tipo, creado_en desc);

-- -----------------------------------------------------------------------------
-- 4. Valoraciones después de un favor hecho (exchanges)
-- -----------------------------------------------------------------------------
create table public.valoraciones_favor (
  id uuid primary key default gen_random_uuid(),
  favor_id uuid not null references public.exchanges (id) on delete cascade,
  de_id uuid not null references public.profiles (id) on delete cascade,
  para_id uuid not null references public.profiles (id) on delete cascade,
  cumplio text not null check (cumplio in ('si', 'en_parte', 'no')),
  recomendaria boolean,
  comentario text check (char_length(comentario) <= 500),
  creado_en timestamptz not null default now(),
  unique (favor_id, de_id),
  check (de_id <> para_id)
);

-- Al marcar un favor como hecho: pedir la valoración a las dos partes.
create or replace function public.on_exchange_valorar() returns trigger
language plpgsql security definer set search_path = public as $$
declare txt text;
begin
  select left(text, 80) into txt from public.requests where id = new.request_id;
  perform public.notify(new.requester_id, 'valorar_favor', jsonb_build_object(
    'favor_id', new.id, 'other_id', new.helper_id, 'request_text', txt,
    'other_name', (select display_name from public.profiles where id = new.helper_id)));
  perform public.notify(new.helper_id, 'valorar_favor', jsonb_build_object(
    'favor_id', new.id, 'other_id', new.requester_id, 'request_text', txt,
    'other_name', (select display_name from public.profiles where id = new.requester_id)));
  return new;
end $$;
create trigger exchanges_valorar after insert on public.exchanges
  for each row execute function public.on_exchange_valorar();

-- -----------------------------------------------------------------------------
-- 5. Votos de la hoja de ruta (un voto por persona por función)
-- -----------------------------------------------------------------------------
create table public.roadmap_votos (
  funcion text not null check (funcion ~ '^[a-z_]{2,40}$'),
  usuario_id uuid not null references public.profiles (id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (funcion, usuario_id)
);

-- =============================================================================
-- Row Level Security
-- Las tablas con texto cifrado no dan permiso de lectura sobre esas columnas:
-- el contenido se lee siempre por las RPCs de abajo, que aplican las mismas
-- reglas y descifran. Las políticas son una segunda barrera.
-- =============================================================================
alter table public.reclamos enable row level security;
alter table public.reclamo_historial enable row level security;
alter table public.reclamo_mensajes enable row level security;
alter table public.reclamo_adjuntos enable row level security;
alter table public.feedback enable row level security;
alter table public.valoraciones_favor enable row level security;
alter table public.roadmap_votos enable row level security;
alter table privado.reclamo_contadores enable row level security;

revoke all on public.reclamos, public.reclamo_historial, public.reclamo_mensajes, public.reclamo_adjuntos,
  public.feedback, public.valoraciones_favor, public.roadmap_votos from anon, authenticated;

-- reclamos: cada persona ve los reclamos en los que participa; admins ven todo.
-- (Sin descripcion ni confirmado: van por RPC.) Escrituras: solo por RPC.
grant select (id, codigo, autor_id, contra_id, rol_autor, motivo, fecha_hecho, resultado_deseado,
              estado, respuesta_limite, creado_en, actualizado_en)
  on public.reclamos to authenticated;
create policy reclamos_participantes on public.reclamos for select to authenticated
  using (autor_id = auth.uid() or (contra_id = auth.uid() and respuesta_limite is not null) or public.is_admin());

grant select on public.reclamo_historial to authenticated;
create policy reclamo_historial_participantes on public.reclamo_historial for select to authenticated
  using (public.puede_ver_reclamo(reclamo_id));

-- mensajes: las notas internas solo las ven admins; los privados, solo su destinatario.
create or replace function public.puede_ver_mensaje_reclamo(p_mensaje uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.reclamo_mensajes m join public.reclamos r on r.id = m.reclamo_id
    where m.id = p_mensaje and not m.es_interno and (
      m.autor_id = auth.uid()
      or (auth.uid() = r.autor_id and m.visible_para in ('ambos', 'autor'))
      or (auth.uid() = r.contra_id and r.respuesta_limite is not null and m.visible_para in ('ambos', 'contra'))))
$$;

grant select (id, reclamo_id, autor_id, es_interno, visible_para, creado_en) on public.reclamo_mensajes to authenticated;
create policy reclamo_mensajes_lectura on public.reclamo_mensajes for select to authenticated
  using (public.puede_ver_mensaje_reclamo(id));

grant select on public.reclamo_adjuntos to authenticated;
create policy reclamo_adjuntos_lectura on public.reclamo_adjuntos for select to authenticated
  using (
    public.is_admin()
    or subido_por = auth.uid()
    or (not es_privado and public.puede_ver_reclamo(reclamo_id))
  );

-- feedback: cada persona ve lo suyo; admins todo. Altas por RPC (límite diario).
grant select on public.feedback to authenticated;
create policy feedback_lectura on public.feedback for select to authenticated
  using (usuario_id = auth.uid() or public.is_admin());

-- valoraciones: quien la hizo y admins. (No se muestran públicamente.)
grant select on public.valoraciones_favor to authenticated;
create policy valoraciones_lectura on public.valoraciones_favor for select to authenticated
  using (de_id = auth.uid() or public.is_admin());

-- votos: cada persona ve y borra los suyos; los conteos van por RPC.
grant select, insert, delete on public.roadmap_votos to authenticated;
create policy roadmap_votos_propios on public.roadmap_votos for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- =============================================================================
-- Storage: bucket privado para adjuntos de reclamos y capturas de reportes.
-- 5 MB por archivo y solo imágenes, aplicado por Storage (no solo en el cliente).
-- Ruta: <mi uid>/<uuid>.<ext>
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reclamos', 'reclamos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.puede_ver_archivo_reclamo(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or split_part(p_path, '/', 1) = auth.uid()::text
    or exists (
      select 1 from public.reclamo_adjuntos a join public.reclamos r on r.id = a.reclamo_id
      where a.url = p_path and not a.es_privado
        and (r.autor_id = auth.uid() or (r.contra_id = auth.uid() and r.respuesta_limite is not null)))
$$;

create policy "reclamos_own_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'reclamos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "reclamos_read" on storage.objects for select to authenticated
  using (bucket_id = 'reclamos' and public.puede_ver_archivo_reclamo(name));
create policy "reclamos_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'reclamos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- =============================================================================
-- RPCs de usuario
-- =============================================================================

-- Personas que puedo elegir en "¿Con quién?".
create or replace function public.reclamo_candidatos()
returns table (id uuid, display_name text, avatar_url text, neighbourhood text)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  ids as (
    select public.friend_ids((select id from me)) as id
    union select x.fid from public.friend_ids((select id from me)) f(id), lateral public.friend_ids(f.id) x(fid)
    union select case when sender_id = (select id from me) then recipient_id else sender_id end
          from public.messages where (select id from me) in (sender_id, recipient_id)
    union select case when requester_id = (select id from me) then helper_id else requester_id end
          from public.exchanges where (select id from me) in (requester_id, helper_id)
    union select case when requester_id = (select id from me) then target_id else requester_id end
          from public.intro_requests where (select id from me) in (requester_id, target_id)
    union select case when o.helper_id = (select id from me) then r.author_id else o.helper_id end
          from public.offers o join public.requests r on r.id = o.request_id
          where (select id from me) in (o.helper_id, r.author_id)
    union select blocked_id from public.blocks where blocker_id = (select id from me)
  )
  select p.id, p.display_name, p.avatar_url, p.neighbourhood
  from ids join public.profiles p on p.id = ids.id
  where p.id <> (select id from me) and p.onboarded
  order by p.display_name
$$;

-- Crear un reclamo. Valida todo en el servidor y limita a 5 por día.
create or replace function public.crear_reclamo(
  p_contra uuid,
  p_rol public.reclamo_rol,
  p_motivo public.reclamo_motivo,
  p_descripcion text,
  p_fecha date,
  p_resultado public.reclamo_resultado,
  p_privada boolean default false,
  p_adjuntos text[] default '{}',
  p_desde_chat boolean default false,
  p_favor uuid default null
) returns table (id uuid, codigo text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  v_anio int := extract(year from now())::int;
  n int;
  cod text;
  rid uuid;
  chat uuid;
  desc_limpia text := trim(coalesce(p_descripcion, ''));
  v_path text;
  seguridad boolean := p_motivo = 'inseguro';
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_contra is null or p_contra = me then raise exception 'invalid_target'; end if;
  if not exists (select 1 from public.profiles where id = p_contra) then raise exception 'invalid_target'; end if;
  if not public.tiene_relacion(me, p_contra)
     and not exists (select 1 from public.blocks where blocker_id = me and blocked_id = p_contra) then
    raise exception 'not_in_network';
  end if;
  if char_length(desc_limpia) < 20 or char_length(desc_limpia) > 4000 then raise exception 'invalid'; end if;
  if p_fecha is null or p_fecha > current_date + 1 or p_fecha < current_date - 365 then raise exception 'invalid'; end if;
  if coalesce(array_length(p_adjuntos, 1), 0) > 3 then raise exception 'invalid'; end if;
  if (select count(*) from public.reclamos r where r.autor_id = me and r.creado_en > now() - interval '24 hours') >= 5 then
    raise exception 'reclamo_limit';
  end if;
  if p_favor is not null and not exists (
    select 1 from public.exchanges e where e.id = p_favor
      and ((e.requester_id = me and e.helper_id = p_contra) or (e.helper_id = me and e.requester_id = p_contra))) then
    raise exception 'invalid';
  end if;

  insert into privado.reclamo_contadores (anio, ultimo) values (v_anio, 1)
  on conflict (anio) do update set ultimo = privado.reclamo_contadores.ultimo + 1
  returning ultimo into n;
  cod := 'CHE-' || v_anio || '-' || lpad(n::text, 4, '0');

  if p_desde_chat then
    select m.id into chat from public.messages m
    where (m.sender_id = me and m.recipient_id = p_contra) or (m.sender_id = p_contra and m.recipient_id = me)
    order by m.created_at desc limit 1;
  end if;

  insert into public.reclamos (codigo, autor_id, contra_id, rol_autor, motivo, descripcion, descripcion_privada,
                               fecha_hecho, resultado_deseado, chat_id, favor_id, respuesta_limite)
  values (cod, me, p_contra, p_rol, p_motivo, privado.cifrar(desc_limpia),
          -- Por seguridad, si alguien se sintió inseguro/a la descripción es privada siempre.
          coalesce(p_privada, false) or seguridad,
          p_fecha, p_resultado, chat, p_favor,
          case when seguridad then null else now() + interval '72 hours' end)
  returning reclamos.id into rid;

  if p_adjuntos is not null then
    foreach v_path in array p_adjuntos loop
      -- Solo archivos de mi propia carpeta del bucket privado.
      if split_part(v_path, '/', 1) <> me::text or v_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' then
        raise exception 'invalid';
      end if;
      insert into public.reclamo_adjuntos (reclamo_id, url, subido_por, es_privado)
      values (rid, v_path, me, coalesce(p_privada, false) or seguridad);
    end loop;
  end if;

  -- La otra parte recibe un aviso neutral y 72 h para contar su versión.
  -- Si alguien se sintió inseguro/a, NO se avisa automáticamente: decide el equipo.
  if not seguridad then
    perform public.notify(p_contra, 'reclamo_nuevo', jsonb_build_object('reclamo_id', rid, 'codigo', cod));
  end if;

  if p_resultado = 'bloquear' then
    perform public.block_user(p_contra);
  end if;

  return query select rid, cod;
end $$;

-- Detalle de un reclamo para quien participa (o admin), con lo que puede ver.
create or replace function public.ver_reclamo(p_reclamo uuid)
returns table (
  id uuid, codigo text, soy text, autor_id uuid, autor_nombre text, contra_id uuid, contra_nombre text,
  rol_autor public.reclamo_rol, motivo public.reclamo_motivo, descripcion text, descripcion_privada boolean,
  fecha_hecho date, resultado_deseado public.reclamo_resultado, estado public.reclamo_estado,
  respuesta_limite timestamptz, puede_responder boolean, desde_chat boolean, confirmado boolean,
  creado_en timestamptz, actualizado_en timestamptz
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := auth.uid(); r public.reclamos; adm boolean := public.is_admin(); rol text;
begin
  select * into r from public.reclamos where id = p_reclamo;
  if not found then raise exception 'not_found'; end if;
  rol := case when me = r.autor_id then 'autor'
              when me = r.contra_id and r.respuesta_limite is not null then 'contra'
              when adm then 'admin' end;
  if rol is null then raise exception 'not_found'; end if;

  return query select
    r.id, r.codigo, rol, r.autor_id,
    (select display_name from public.profiles where id = r.autor_id),
    r.contra_id,
    (select display_name from public.profiles where id = r.contra_id),
    r.rol_autor, r.motivo,
    case when rol = 'contra' and r.descripcion_privada then null else privado.descifrar(r.descripcion) end,
    r.descripcion_privada, r.fecha_hecho, r.resultado_deseado, r.estado, r.respuesta_limite,
    (rol = 'contra' and r.estado not in ('resuelto', 'cerrado')
       and r.respuesta_limite is not null and r.respuesta_limite > now()),
    r.chat_id is not null,
    case when adm then r.confirmado else null end,
    r.creado_en, r.actualizado_en;
end $$;

create or replace function public.ver_reclamo_mensajes(p_reclamo uuid)
returns table (id uuid, autor_id uuid, autor_nombre text, texto text, es_interno boolean,
               visible_para text, creado_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := auth.uid(); r public.reclamos; adm boolean := public.is_admin();
begin
  select * into r from public.reclamos where id = p_reclamo;
  if not found or not public.puede_ver_reclamo(p_reclamo) then raise exception 'not_found'; end if;
  return query
  select m.id, m.autor_id, p.display_name, privado.descifrar(m.texto), m.es_interno, m.visible_para, m.creado_en
  from public.reclamo_mensajes m left join public.profiles p on p.id = m.autor_id
  where m.reclamo_id = r.id
    and (adm or (not m.es_interno and (
      m.autor_id = me
      or (me = r.autor_id and m.visible_para in ('ambos', 'autor'))
      or (me = r.contra_id and r.respuesta_limite is not null and m.visible_para in ('ambos', 'contra')))))
  order by m.creado_en;
end $$;

-- Responder: el autor puede sumar información mientras siga abierto; la otra
-- parte, dentro de las 72 h. "p_privado" = solo lo ve el equipo de Che.
create or replace function public.responder_reclamo(p_reclamo uuid, p_texto text, p_privado boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.reclamos; t text := trim(coalesce(p_texto, '')); vis text;
begin
  select * into r from public.reclamos where id = p_reclamo for update;
  if not found or not public.puede_ver_reclamo(p_reclamo) or me not in (r.autor_id, r.contra_id) then
    raise exception 'not_found';
  end if;
  if r.estado in ('resuelto', 'cerrado') then raise exception 'reclamo_cerrado'; end if;
  if me = r.contra_id and (r.respuesta_limite is null or r.respuesta_limite < now()) then
    raise exception 'plazo_vencido';
  end if;
  if char_length(t) < 2 or char_length(t) > 4000 then raise exception 'invalid'; end if;
  if (select count(*) from public.reclamo_mensajes where autor_id = me and creado_en > now() - interval '24 hours') >= 30 then
    raise exception 'reclamo_limit';
  end if;

  vis := case when coalesce(p_privado, false) then (case when me = r.autor_id then 'autor' else 'contra' end) else 'ambos' end;
  insert into public.reclamo_mensajes (reclamo_id, autor_id, texto, visible_para)
  values (r.id, me, privado.cifrar(t), vis);

  -- Si responde la otra parte, vuelve a revisión para el equipo.
  if me = r.contra_id and r.estado = 'esperando_respuesta' then
    update public.reclamos set estado = 'en_revision' where id = r.id;
  else
    update public.reclamos set actualizado_en = now() where id = r.id;
  end if;

  -- Avisar a la otra parte solo si el mensaje es visible para ella.
  if vis = 'ambos' and (me = r.contra_id or r.respuesta_limite is not null) then
    perform public.notify(case when me = r.autor_id then r.contra_id else r.autor_id end,
      'reclamo_mensaje', jsonb_build_object('reclamo_id', r.id, 'codigo', r.codigo));
  end if;
end $$;

-- Adjuntos del reclamo con lo que puedo ver (las URLs firmadas las pide el cliente).
create or replace function public.ver_reclamo_adjuntos(p_reclamo uuid)
returns table (id uuid, url text, subido_por uuid, es_privado boolean, creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.url, a.subido_por, a.es_privado, a.creado_en
  from public.reclamo_adjuntos a
  where a.reclamo_id = p_reclamo and public.puede_ver_archivo_reclamo(a.url)
  order by a.creado_en
$$;

-- "Mis reclamos": los que hice y los que me hicieron.
create or replace function public.mis_reclamos()
returns table (id uuid, codigo text, soy text, otra_id uuid, otra_nombre text, otra_avatar text,
               motivo public.reclamo_motivo, estado public.reclamo_estado, respuesta_limite timestamptz,
               creado_en timestamptz, actualizado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.codigo,
    case when r.autor_id = auth.uid() then 'autor' else 'contra' end,
    p.id, p.display_name, p.avatar_url,
    r.motivo, r.estado, r.respuesta_limite, r.creado_en, r.actualizado_en
  from public.reclamos r
  join public.profiles p on p.id = case when r.autor_id = auth.uid() then r.contra_id else r.autor_id end
  where auth.uid() in (r.autor_id, r.contra_id)
    -- A la otra parte no se le muestran los reclamos de seguridad hasta que el equipo lo decida.
    and (r.autor_id = auth.uid() or r.respuesta_limite is not null)
  order by r.actualizado_en desc
$$;

-- Feedback, sugerencias y reportes técnicos (máx. 20 por día por persona).
create or replace function public.enviar_feedback(
  p_tipo text, p_texto text, p_puntaje int default null, p_permite_contacto boolean default false,
  p_url text default null, p_navegador text default null, p_intentaba text default null, p_captura text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); fid uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if (select count(*) from public.feedback where usuario_id = me and creado_en > now() - interval '24 hours') >= 20 then
    raise exception 'feedback_limit';
  end if;
  if p_captura is not null and (split_part(p_captura, '/', 1) <> me::text
     or p_captura !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'invalid';
  end if;
  insert into public.feedback (usuario_id, tipo, puntaje, texto, intentaba, url_pagina, navegador, captura_path, permite_contacto)
  values (me, p_tipo, p_puntaje, nullif(left(trim(coalesce(p_texto, '')), 2000), ''),
          nullif(left(trim(coalesce(p_intentaba, '')), 500), ''),
          -- Solo la ruta: sin parámetros de búsqueda ni fragmentos (pueden traer datos).
          nullif(left(split_part(split_part(coalesce(p_url, ''), '?', 1), '#', 1), 500), ''),
          nullif(left(coalesce(p_navegador, ''), 300), ''), p_captura, coalesce(p_permite_contacto, false))
  returning id into fid;
  return fid;
end $$;

-- Valorar un favor hecho. Devuelve el id; si "cumplio = no" el cliente ofrece reclamar.
create or replace function public.valorar_favor(p_favor uuid, p_cumplio text, p_recomendaria boolean, p_comentario text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e public.exchanges; otro uuid; vid uuid;
begin
  select * into e from public.exchanges where id = p_favor;
  if not found or me not in (e.requester_id, e.helper_id) then raise exception 'not_found'; end if;
  if p_cumplio not in ('si', 'en_parte', 'no') then raise exception 'invalid'; end if;
  otro := case when me = e.requester_id then e.helper_id else e.requester_id end;
  insert into public.valoraciones_favor (favor_id, de_id, para_id, cumplio, recomendaria, comentario)
  values (e.id, me, otro, p_cumplio, p_recomendaria, nullif(left(trim(coalesce(p_comentario, '')), 500), ''))
  on conflict (favor_id, de_id) do update
    set cumplio = excluded.cumplio, recomendaria = excluded.recomendaria, comentario = excluded.comentario
  returning id into vid;
  return vid;
end $$;

-- Favores hechos en los últimos 30 días que todavía no valoré.
create or replace function public.valoraciones_pendientes()
returns table (favor_id uuid, other_id uuid, other_name text, other_avatar text, request_text text,
               completed_at timestamptz, soy text)
language sql stable security definer set search_path = public as $$
  select e.id, p.id, p.display_name, p.avatar_url, left(r.text, 120), e.completed_at,
    case when e.requester_id = auth.uid() then 'pedi' else 'hice' end
  from public.exchanges e
  join public.requests r on r.id = e.request_id
  join public.profiles p on p.id = case when e.requester_id = auth.uid() then e.helper_id else e.requester_id end
  where auth.uid() in (e.requester_id, e.helper_id)
    and not r.is_example
    and e.completed_at > now() - interval '30 days'
    and not exists (select 1 from public.valoraciones_favor v where v.favor_id = e.id and v.de_id = auth.uid())
    and not public.is_blocked_between(auth.uid(), p.id)
  order by e.completed_at desc
$$;

-- Hoja de ruta: conteo de votos por función y si yo voté.
create or replace function public.roadmap_conteo()
returns table (funcion text, votos int, yo boolean)
language sql stable security definer set search_path = public as $$
  select funcion, count(*)::int, bool_or(usuario_id = auth.uid())
  from public.roadmap_votos group by funcion
$$;

-- =============================================================================
-- RPCs de admin
-- =============================================================================
create or replace function public.admin_ayuda_lista(
  p_tipo text default null,        -- 'reclamo' | 'tecnico' | 'sugerencia' | null (todo)
  p_estado text default null,
  p_desde date default null,
  p_hasta date default null
)
returns table (tipo text, id uuid, codigo text, subtipo text, estado text, resumen text,
               autor_id uuid, autor_nombre text, contra_id uuid, contra_nombre text,
               contra_confirmados_90d int, creado_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select * from (
    select 'reclamo'::text, r.id, r.codigo, r.motivo::text, r.estado::text,
      left(privado.descifrar(r.descripcion), 140),
      r.autor_id, pa.display_name, r.contra_id, pc.display_name,
      public.reclamos_confirmados_90d(r.contra_id), r.creado_en
    from public.reclamos r
    left join public.profiles pa on pa.id = r.autor_id
    left join public.profiles pc on pc.id = r.contra_id
    where coalesce(p_tipo, 'reclamo') = 'reclamo'
    union all
    select case when f.tipo = 'tecnico' then 'tecnico' else 'sugerencia' end, f.id, null, f.tipo, f.estado,
      left(coalesce(f.texto, '') || case when f.puntaje is not null then ' (' || f.puntaje || '/5)' else '' end, 140),
      f.usuario_id, pu.display_name, null, null, null, f.creado_en
    from public.feedback f left join public.profiles pu on pu.id = f.usuario_id
    where p_tipo is null or (p_tipo = 'tecnico' and f.tipo = 'tecnico') or (p_tipo = 'sugerencia' and f.tipo <> 'tecnico')
  ) x(tipo, id, codigo, subtipo, estado, resumen, autor_id, autor_nombre, contra_id, contra_nombre, contra_confirmados_90d, creado_en)
  where (p_estado is null or x.estado = p_estado)
    and (p_desde is null or x.creado_en >= p_desde)
    and (p_hasta is null or x.creado_en < p_hasta + 1)
  order by x.creado_en desc
  limit 300;
end $$;

create or replace function public.admin_ver_feedback(p_id uuid)
returns setof public.feedback
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query select * from public.feedback where id = p_id;
end $$;

create or replace function public.admin_feedback_estado(p_id uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.feedback set estado = p_estado where id = p_id;
end $$;

-- Cambiar estado. Pasar a "esperando respuesta" reabre el plazo de 72 h y avisa.
create or replace function public.admin_reclamo_estado(p_reclamo uuid, p_estado public.reclamo_estado, p_confirmado boolean default null)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.reclamos;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into r from public.reclamos where id = p_reclamo for update;
  if not found then raise exception 'not_found'; end if;

  update public.reclamos
    set estado = p_estado,
        confirmado = coalesce(p_confirmado, confirmado),
        respuesta_limite = case when p_estado = 'esperando_respuesta' then now() + interval '72 hours' else respuesta_limite end
    where id = r.id;

  if p_estado is distinct from r.estado then
    perform public.notify(r.autor_id, 'reclamo_estado', jsonb_build_object(
      'reclamo_id', r.id, 'codigo', r.codigo, 'estado', p_estado));
    if p_estado = 'esperando_respuesta' then
      perform public.notify(r.contra_id, 'reclamo_nuevo', jsonb_build_object('reclamo_id', r.id, 'codigo', r.codigo));
    end if;
  end if;
end $$;

-- Nota interna (solo admins) o respuesta del equipo a una o ambas partes.
create or replace function public.admin_reclamo_mensaje(p_reclamo uuid, p_texto text, p_para text)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.reclamos; t text := trim(coalesce(p_texto, ''));
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_para not in ('interno', 'autor', 'contra', 'ambos') then raise exception 'invalid'; end if;
  if char_length(t) < 2 or char_length(t) > 4000 then raise exception 'invalid'; end if;
  select * into r from public.reclamos where id = p_reclamo;
  if not found then raise exception 'not_found'; end if;
  -- A la otra parte de un reclamo de seguridad solo se le escribe después de pedirle su versión.
  if p_para in ('contra', 'ambos') and r.respuesta_limite is null then raise exception 'contra_sin_aviso'; end if;

  insert into public.reclamo_mensajes (reclamo_id, autor_id, texto, es_interno, visible_para)
  values (r.id, auth.uid(), privado.cifrar(t), p_para = 'interno', case when p_para = 'interno' then 'ambos' else p_para end);

  if p_para in ('autor', 'ambos') then
    perform public.notify(r.autor_id, 'reclamo_mensaje', jsonb_build_object('reclamo_id', r.id, 'codigo', r.codigo, 'equipo', true));
  end if;
  if p_para in ('contra', 'ambos') and r.respuesta_limite is not null then
    perform public.notify(r.contra_id, 'reclamo_mensaje', jsonb_build_object('reclamo_id', r.id, 'codigo', r.codigo, 'equipo', true));
  end if;
end $$;

-- Al borrar una cuenta, sus reclamos se borran por cascada (ya existe delete_my_account).

-- =============================================================================
-- Permisos de funciones
-- =============================================================================
revoke execute on all functions in schema public from public, anon;
-- tiene_relacion y reclamos_confirmados_90d NO se exponen: permitirían averiguar
-- con quién habla alguien o cuántos reclamos tiene. Solo las usan otras funciones.
grant execute on function
  public.puede_ver_reclamo(uuid),
  public.puede_ver_mensaje_reclamo(uuid),
  public.puede_ver_archivo_reclamo(text),
  public.reclamo_candidatos(),
  public.crear_reclamo(uuid, public.reclamo_rol, public.reclamo_motivo, text, date, public.reclamo_resultado, boolean, text[], boolean, uuid),
  public.ver_reclamo(uuid),
  public.ver_reclamo_mensajes(uuid),
  public.ver_reclamo_adjuntos(uuid),
  public.responder_reclamo(uuid, text, boolean),
  public.mis_reclamos(),
  public.enviar_feedback(text, text, int, boolean, text, text, text, text),
  public.valorar_favor(uuid, text, boolean, text),
  public.valoraciones_pendientes(),
  public.roadmap_conteo(),
  public.admin_ayuda_lista(text, text, date, date),
  public.admin_ver_feedback(uuid),
  public.admin_feedback_estado(uuid, text),
  public.admin_reclamo_estado(uuid, public.reclamo_estado, boolean),
  public.admin_reclamo_mensaje(uuid, text, text)
to authenticated;
-- Los triggers no necesitan permisos de ejecución para el usuario.
revoke execute on function public.on_reclamo_estado(), public.touch_reclamo(), public.on_exchange_valorar()
  from authenticated;
