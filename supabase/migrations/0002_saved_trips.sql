-- Fase 8: cuentas y viajes guardados.
--
-- Cómo se aplica:
--   supabase db push
-- o pegando este fichero en el editor SQL del proyecto.
--
-- Regla 9 de CLAUDE.md: los viajes guardados viven aquí, ligados a un usuario
-- autenticado y con Row Level Security por auth.uid(). `localStorage` es caché
-- del navegador y nada más; un viaje que desaparece al cambiar de móvil no es un
-- viaje guardado.
--
-- Sección 13.2: "Aplicar Row Level Security antes de habilitar cuentas de
-- usuario". La migración 0001 ya dejó las políticas puestas; esta añade la tabla
-- que faltaba y la suya, en el mismo commit que las cuentas.

-- ---------------------------------------------------------------------------
-- saved_trips
-- ---------------------------------------------------------------------------

-- Guarda una referencia, no una copia. La propuesta ya está en `trip_proposals`
-- tal como la calculó el servidor, así que aquí solo se apunta a ella.
--
-- Sección 8.2, "No confiar en cálculos enviados por el frontend": si esta tabla
-- guardara el viaje que manda el navegador, cualquiera podría guardarse un viaje
-- a Tokio por doce euros. El navegador solo dice *cuál* de las propuestas que
-- generó el servidor quiere conservar.
create table if not exists public.saved_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_request_id uuid not null references public.trip_requests (id) on delete cascade,
  trip_proposal_id uuid not null references public.trip_proposals (id) on delete cascade,
  -- Lo único que escribe el usuario. La regla 14 dice que lo que escribe el
  -- usuario se guarda contra el servidor: por eso el título está en esta tabla y
  -- no en el navegador.
  title text not null,
  created_at timestamptz default now(),

  -- Regla 5 de CLAUDE.md: el mismo tope que aplica Zod en el servidor. La base
  -- de datos es la última barrera y la que sigue en pie si algún día se escribe
  -- desde otro sitio.
  constraint saved_trips_title_length check (char_length(title) between 1 and 120),

  -- Guardar dos veces la misma propuesta es la misma fila, no dos. Sin esto, un
  -- doble clic deja duplicados en la lista del usuario.
  constraint saved_trips_unique_proposal unique (user_id, trip_proposal_id)
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

-- Una clave foránea no crea índice por sí sola en Postgres, y sin él cada
-- borrado en cascada recorre la tabla entera.
--
-- `user_id` no lleva índice propio: la restricción única (user_id,
-- trip_proposal_id) ya crea uno que empieza por esa columna, y es el que usa la
-- consulta de "mis viajes guardados". Un segundo índice sobre lo mismo solo
-- añadiría trabajo en cada escritura.
create index if not exists saved_trips_trip_request_id_idx
  on public.saved_trips (trip_request_id);

create index if not exists saved_trips_trip_proposal_id_idx
  on public.saved_trips (trip_proposal_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Doble barrera, a propósito. El servidor escribe con la clave de servicio, que
-- salta RLS, así que es él quien comprueba que la solicitud sea del usuario
-- antes de guardar. Estas políticas protegen al navegador, que habla con
-- Supabase usando la clave anónima y solo debe alcanzar lo suyo.
--
-- Sección 8.2: "Añadir autenticación antes de permitir acceso a viajes privados".

alter table public.saved_trips enable row level security;

drop policy if exists "Cada usuario ve sus viajes guardados" on public.saved_trips;
create policy "Cada usuario ve sus viajes guardados"
  on public.saved_trips
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Cada usuario guarda viajes a su nombre" on public.saved_trips;
create policy "Cada usuario guarda viajes a su nombre"
  on public.saved_trips
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Cada usuario borra sus viajes guardados" on public.saved_trips;
create policy "Cada usuario borra sus viajes guardados"
  on public.saved_trips
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Propuestas: lectura del propietario
-- ---------------------------------------------------------------------------

-- La política de select de `trip_proposals` de la migración 0001 ya deja al
-- usuario leer las propuestas de sus propias solicitudes, que es justo lo que
-- necesita la lista de viajes guardados. No hace falta ninguna política nueva:
-- un viaje guardado siempre cuelga de una solicitud del propio usuario, y el
-- servidor lo comprueba antes de crear la fila.
