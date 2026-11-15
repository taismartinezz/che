-- =============================================================================
-- Encuesta: país y zona (se piden en la misma pantalla que P1).
-- Requiere 20261117000000_encuesta_contacto.sql.
-- =============================================================================

alter table public.encuesta_respuestas
  add column if not exists pais text check (pais in ('uy', 'ar', 'otro')),
  add column if not exists zona text check (char_length(zona) <= 60);

-- encuesta_guardar suma p_pais y p_zona (con default: la llamada anterior sigue andando).
drop function if exists public.encuesta_guardar(text, text, text, text[], boolean, text, text, text, text, text);
create function public.encuesta_guardar(
  p_token text,
  p_dispositivo text,
  p_pregunta text,
  p_opciones text[],
  p_no_aplica boolean,
  p_texto text,
  p_audio text,
  p_transcripcion text,
  p_user_agent text default null,
  p_trampa text default null,
  p_pais text default null,
  p_zona text default null
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
  if p_pais is not null and p_pais not in ('uy', 'ar', 'otro') then raise exception 'invalid'; end if;
  if char_length(trim(coalesce(p_zona, ''))) > 60 then raise exception 'invalid'; end if;

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
        pais = coalesce(p_pais, pais),
        zona = case when p_pais is not null then nullif(trim(coalesce(p_zona, '')), '') else zona end,
        es_bot = es_bot or coalesce(p_trampa, '') <> '',
        usuario_id = coalesce(usuario_id, auth.uid())
    where id = r.id;
  return r.id;
end $$;

-- Retomar: devuelve también país y zona.
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
    'pais', r.pais,
    'zona', r.zona,
    'items', coalesce((select json_agg(json_build_object(
        'pregunta_id', i.pregunta_id, 'opciones', i.opciones, 'no_aplica', i.no_aplica,
        'texto', i.texto, 'audio_url', i.audio_url, 'transcripcion', i.transcripcion))
      from public.encuesta_items i where i.respuesta_id = r.id), '[]'::json));
end $$;

-- Resultados: filtro por país y columnas pais/zona.
drop function if exists public.admin_encuesta(text, date, date, boolean);
create function public.admin_encuesta(
  p_rol text default null, p_desde date default null, p_hasta date default null,
  p_charla boolean default null, p_pais text default null
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
        and (p_pais is null or pais = p_pais)
    )
    select json_build_object(
      'respuestas', coalesce((select json_agg(json_build_object(
          'id', r.id, 'rol', r.rol, 'pais', r.pais, 'zona', r.zona, 'completa', r.completa, 'contacto', r.contacto,
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

revoke execute on function public.encuesta_guardar(text, text, text, text[], boolean, text, text, text, text, text, text, text) from public;
revoke execute on function public.admin_encuesta(text, date, date, boolean, text) from public, anon;
grant execute on function public.encuesta_guardar(text, text, text, text[], boolean, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_encuesta(text, date, date, boolean, text) to authenticated;
