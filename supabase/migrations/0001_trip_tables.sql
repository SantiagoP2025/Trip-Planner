-- Sección 13.1 de la especificación: tablas mínimas.
--
-- Cómo se aplica:
--   supabase db push
-- o pegando este fichero en el editor SQL del proyecto.
--
-- Regla 9 de CLAUDE.md: los viajes viven aquí, no en localStorage, ligados a un
-- usuario autenticado y con Row Level Security por auth.uid(). Las políticas se
-- crean en esta misma fase aunque las cuentas lleguen en la fase 8, porque la
-- sección 13.2 lo dice al revés de como suele hacerse: "Aplicar Row Level
-- Security antes de habilitar cuentas de usuario".

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- trip_requests
-- ---------------------------------------------------------------------------

create table if not exists public.trip_requests (
  id uuid primary key default gen_random_uuid(),
  -- La especificación deja `user_id uuid` suelto. Aquí es clave foránea real:
  -- sin ella, borrar una cuenta dejaría sus viajes huérfanos en la base de
  -- datos. Es nulo mientras la generación sea anónima (hasta la fase 8).
  user_id uuid references auth.users (id) on delete cascade,
  origin text not null,
  destination text not null,
  departure_date date not null,
  return_date date not null,
  adults integer not null,
  children integer default 0,
  budget numeric(12, 2) not null,
  currency text default 'EUR',
  travel_style text not null,
  preferences jsonb not null,
  constraints jsonb,
  status text default 'pending',
  created_at timestamptz default now(),

  -- Regla 5 de CLAUDE.md: los mismos topes que aplica Zod en el servidor,
  -- repetidos aquí. No es duplicación por gusto: la base de datos es la última
  -- barrera, y la que sigue en pie si alguna vez se escribe desde otro sitio.
  constraint trip_requests_adults_range check (adults between 1 and 9),
  constraint trip_requests_children_range check (children between 0 and 9),
  constraint trip_requests_budget_range check (budget > 0 and budget <= 100000),
  constraint trip_requests_dates_order check (return_date > departure_date),
  constraint trip_requests_max_nights check (return_date - departure_date <= 30),
  constraint trip_requests_currency_allowed check (currency in ('EUR', 'USD', 'GBP')),
  constraint trip_requests_travel_style_allowed
    check (travel_style in ('economical', 'balanced', 'comfort')),
  constraint trip_requests_status_allowed
    check (status in ('pending', 'completed', 'empty', 'failed'))
);

-- ---------------------------------------------------------------------------
-- trip_proposals
-- ---------------------------------------------------------------------------

create table if not exists public.trip_proposals (
  id uuid primary key default gen_random_uuid(),
  trip_request_id uuid references public.trip_requests (id) on delete cascade,
  proposal_type text not null,
  total_cost numeric(12, 2),
  score numeric(5, 2),
  data jsonb not null,
  created_at timestamptz default now(),

  constraint trip_proposals_type_allowed
    check (proposal_type in ('economical', 'recommended', 'comfort'))
);

-- ---------------------------------------------------------------------------
-- provider_searches
-- ---------------------------------------------------------------------------

create table if not exists public.provider_searches (
  id uuid primary key default gen_random_uuid(),
  trip_request_id uuid references public.trip_requests (id) on delete cascade,
  provider text not null,
  status text not null,
  -- Sección 13.2: "No guardar respuestas brutas de proveedores indefinidamente
  -- si contienen datos innecesarios". Las columnas existen porque las pide la
  -- sección 13.1, pero el servidor solo escribe el recuento y el error, nunca
  -- el volcado de la respuesta del proveedor.
  request_data jsonb,
  response_data jsonb,
  offers_found integer,
  error_message text,
  searched_at timestamptz default now(),

  constraint provider_searches_status_allowed check (status in ('ok', 'failed'))
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

-- Una clave foránea no crea índice por sí sola en Postgres. Sin estos, cada
-- borrado en cascada y cada política que mira la solicitud padre hacen un
-- recorrido completo de la tabla.
create index if not exists trip_requests_user_id_idx
  on public.trip_requests (user_id);

create index if not exists trip_proposals_trip_request_id_idx
  on public.trip_proposals (trip_request_id);

create index if not exists provider_searches_trip_request_id_idx
  on public.provider_searches (trip_request_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- El servidor escribe con la clave de servicio, que salta RLS por diseño. Estas
-- políticas son la barrera para el navegador, que en la fase 8 hablará con
-- Supabase usando la clave anónima y solo debe alcanzar lo suyo.

alter table public.trip_requests enable row level security;
alter table public.trip_proposals enable row level security;
alter table public.provider_searches enable row level security;

drop policy if exists "Cada usuario ve sus propias solicitudes" on public.trip_requests;
create policy "Cada usuario ve sus propias solicitudes"
  on public.trip_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Cada usuario crea solicitudes a su nombre" on public.trip_requests;
create policy "Cada usuario crea solicitudes a su nombre"
  on public.trip_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Cada usuario borra sus propias solicitudes" on public.trip_requests;
create policy "Cada usuario borra sus propias solicitudes"
  on public.trip_requests
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Las propuestas heredan el permiso de su solicitud. Esta subconsulta es la
-- razón concreta por la que trip_proposals.trip_request_id lleva índice.
drop policy if exists "Cada usuario ve las propuestas de sus solicitudes" on public.trip_proposals;
create policy "Cada usuario ve las propuestas de sus solicitudes"
  on public.trip_proposals
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.trip_requests r
      where r.id = trip_proposals.trip_request_id
        and r.user_id = auth.uid()
    )
  );

-- provider_searches se queda con RLS activado y sin ninguna política, a
-- propósito: es material de auditoría del servidor. Sin política, nadie que
-- llegue con la clave anónima lee ni escribe una sola fila; la clave de
-- servicio sigue entrando porque salta RLS.
