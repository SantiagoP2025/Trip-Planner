-- Fase 11: ediciones del itinerario.
--
-- Cómo se aplica:
--   supabase db push
-- o pegando este fichero en el editor SQL del proyecto.
--
-- Regla 14 de PLAN-2.md: "Todo lo que el usuario escriba se guarda contra el
-- servidor". Estos textos no son datos generados que se puedan volver a
-- calcular: son del usuario. En la versión anterior vivían solo en
-- `localStorage`, se perdían al cambiar de dispositivo y desaparecían sin aviso
-- cuando el almacenamiento se llenaba (fallos A.10 y B.5 de la auditoría).
--
-- La tabla llega después de las cuentas a propósito (fase 8 antes que la 11): no
-- se permite editar nada hasta que hay dónde guardarlo de verdad.

-- ---------------------------------------------------------------------------
-- saved_trip_edits
-- ---------------------------------------------------------------------------

-- Una fila por elemento del itinerario que el usuario haya reescrito. Guarda
-- **solo lo editado**, no una copia del itinerario: el original sigue en el
-- JSONB de `trip_proposals` tal como lo calculó el servidor, y eso es lo que
-- permite distinguir lo editado de lo original y volver atrás.
create table if not exists public.saved_trip_edits (
  id uuid primary key default gen_random_uuid(),
  saved_trip_id uuid not null references public.saved_trips (id) on delete cascade,
  -- El identificador del elemento tal como lo generó el motor (sección 12.2).
  -- Es texto y no uuid: lo compone el planificador, no la base de datos.
  item_id text not null,
  title text,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Regla 5 de CLAUDE.md: los mismos topes que aplica Zod en el servidor. La
  -- base de datos es la última barrera.
  constraint saved_trip_edits_title_length
    check (title is null or char_length(title) between 1 and 120),
  constraint saved_trip_edits_description_length
    check (description is null or char_length(description) between 1 and 500),

  -- Una fila sin nada editado no es una edición: es ruido que después habría
  -- que distinguir de una edición de verdad al pintar. Volver al original se
  -- hace borrando la fila, no dejándola vacía.
  constraint saved_trip_edits_not_empty
    check (title is not null or description is not null),

  -- Editar dos veces el mismo bloque es la misma fila, no dos.
  constraint saved_trip_edits_unique_item unique (saved_trip_id, item_id)
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

-- `saved_trip_id` no lleva índice propio: la restricción única (saved_trip_id,
-- item_id) ya crea uno que empieza por esa columna, y es el que usan tanto el
-- borrado en cascada como la consulta de las ediciones de un viaje.

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Las ediciones heredan el permiso de su viaje guardado. La subconsulta usa el
-- índice de la clave primaria de `saved_trips`, así que no recorre nada.
--
-- Doble barrera, igual que en la migración 0002: el servidor escribe con la
-- clave de servicio, que salta RLS, así que comprueba la propiedad él mismo.
-- Estas políticas protegen al navegador.

alter table public.saved_trip_edits enable row level security;

drop policy if exists "Cada usuario ve sus ediciones" on public.saved_trip_edits;
create policy "Cada usuario ve sus ediciones"
  on public.saved_trip_edits
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.saved_trips s
      where s.id = saved_trip_edits.saved_trip_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists "Cada usuario escribe sus ediciones" on public.saved_trip_edits;
create policy "Cada usuario escribe sus ediciones"
  on public.saved_trip_edits
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.saved_trips s
      where s.id = saved_trip_edits.saved_trip_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists "Cada usuario corrige sus ediciones" on public.saved_trip_edits;
create policy "Cada usuario corrige sus ediciones"
  on public.saved_trip_edits
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.saved_trips s
      where s.id = saved_trip_edits.saved_trip_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists "Cada usuario borra sus ediciones" on public.saved_trip_edits;
create policy "Cada usuario borra sus ediciones"
  on public.saved_trip_edits
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.saved_trips s
      where s.id = saved_trip_edits.saved_trip_id
        and s.user_id = auth.uid()
    )
  );
