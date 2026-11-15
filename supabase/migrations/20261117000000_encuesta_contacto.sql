-- =============================================================================
-- Encuesta: contacto opcional al final (aviso de lanzamiento y charla de 15 min)
-- Nada es obligatorio si no tilda ninguna casilla. Si tilda alguna, nombre y
-- contacto son obligatorios; si tilda la charla, también el horario.
-- Requiere 20261116000000_encuesta.sql.
-- =============================================================================

alter table public.encuesta_respuestas
  add column if not exists quiere_aviso boolean not null default false,
  add column if not exists quiere_charla boolean not null default false,
  add column if not exists nombre text check (char_length(nombre) <= 60),
  add column if not exists horario text check (horario in ('manana', 'tarde', 'noche'));

-- Formato de contacto: un email o un teléfono (8 a 15 dígitos).
create or replace function privado.contacto_valido(c text) returns boolean
language sql immutable set search_path = '' as $$
  select c ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
      or (c ~ '^\+?[0-9 ()-]+$' and char_length(regexp_replace(c, '[^0-9]', '', 'g')) between 8 and 15)
$$;
revoke all on function privado.contacto_valido(text) from public, anon, authenticated;

-- Reemplaza encuesta_completar (los parámetros nuevos tienen default, así que
-- la llamada vieja con token, contacto y trampa sigue funcionando).
drop function if exists public.encuesta_completar(text, text, text);
create function public.encuesta_completar(
  p_token text,
  p_contacto text default null,
  p_trampa text default null,
  p_quiere_aviso boolean default false,
  p_quiere_charla boolean default false,
  p_nombre text default null,
  p_horario text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.encuesta_respuestas;
  aviso boolean := coalesce(p_quiere_aviso, false);
  charla boolean := coalesce(p_quiere_charla, false);
  nom text := nullif(trim(coalesce(p_nombre, '')), '');
  con text := nullif(trim(coalesce(p_contacto, '')), '');
begin
  r := privado.respuesta_por_token(p_token);
  if r.id is null then raise exception 'not_found'; end if;

  if aviso or charla then
    if nom is null or char_length(nom) > 60 then raise exception 'invalid'; end if;
    if con is null or char_length(con) > 200 or not privado.contacto_valido(con) then raise exception 'invalid'; end if;
    if charla and (p_horario is null or p_horario not in ('manana', 'tarde', 'noche')) then raise exception 'invalid'; end if;
    update public.encuesta_respuestas
      set completa = true, quiere_aviso = aviso, quiere_charla = charla, nombre = nom, contacto = con,
          horario = case when charla then p_horario end,
          es_bot = es_bot or coalesce(p_trampa, '') <> '', actualizado_en = now()
      where id = r.id;
  else
    -- Sin casillas: solo se marca como completa; no se toca ningún dato de contacto.
    update public.encuesta_respuestas
      set completa = true, es_bot = es_bot or coalesce(p_trampa, '') <> '', actualizado_en = now()
      where id = r.id;
  end if;
end $$;

-- Resultados: suma los campos nuevos y el filtro "quiere charla".
drop function if exists public.admin_encuesta(text, date, date);
create function public.admin_encuesta(
  p_rol text default null, p_desde date default null, p_hasta date default null, p_charla boolean default null
)
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
        and (p_charla is null or quiere_charla = p_charla)
    )
    select json_build_object(
      'respuestas', coalesce((select json_agg(json_build_object(
          'id', r.id, 'rol', r.rol, 'completa', r.completa, 'contacto', r.contacto,
          'quiere_aviso', r.quiere_aviso, 'quiere_charla', r.quiere_charla, 'nombre', r.nombre, 'horario', r.horario,
          'user_agent', r.user_agent, 'con_cuenta', r.usuario_id is not null,
          'creado_en', r.creado_en, 'actualizado_en', r.actualizado_en) order by r.creado_en desc) from r), '[]'::json),
      'items', coalesce((select json_agg(json_build_object(
          'respuesta_id', i.respuesta_id, 'pregunta_id', i.pregunta_id, 'opciones', i.opciones,
          'no_aplica', i.no_aplica, 'texto', i.texto, 'audio_url', i.audio_url,
          'transcripcion', i.transcripcion, 'creado_en', i.creado_en))
        from public.encuesta_items i join r on r.id = i.respuesta_id), '[]'::json))
  );
end $$;

revoke execute on function public.encuesta_completar(text, text, text, boolean, boolean, text, text) from public;
revoke execute on function public.admin_encuesta(text, date, date, boolean) from public, anon;
grant execute on function public.encuesta_completar(text, text, text, boolean, boolean, text, text) to anon, authenticated;
grant execute on function public.admin_encuesta(text, date, date, boolean) to authenticated;
