import { describe, expect, it } from 'vitest';
import { defaultSavedTripTitle, toSavedTrip, toSavedTripRow } from './saved-trip-rows.ts';

const PROPOSAL = { id: 'recommended-1', type: 'recommended', estimatedTotal: 2386.06 };

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'guardado-1',
    title: 'Puente de mayo',
    created_at: '2026-08-08T10:00:00.000Z',
    trip_request_id: 'solicitud-1',
    trip_proposals: { data: PROPOSAL },
    trip_requests: {
      origin: 'Valencia',
      destination: 'Lisboa',
      departure_date: '2026-09-10',
      return_date: '2026-09-17',
    },
    ...overrides,
  };
}

describe('toSavedTripRow', () => {
  it('traduce el registro a los nombres de columna de la migración', () => {
    expect(
      toSavedTripRow({
        userId: 'usuario-1',
        tripRequestId: 'solicitud-1',
        tripProposalId: 'propuesta-1',
        title: 'Puente de mayo',
      }),
    ).toEqual({
      user_id: 'usuario-1',
      trip_request_id: 'solicitud-1',
      trip_proposal_id: 'propuesta-1',
      title: 'Puente de mayo',
    });
  });
});

describe('defaultSavedTripTitle', () => {
  it('compone el título con el origen y el destino', () => {
    expect(defaultSavedTripTitle('Valencia', 'Lisboa')).toBe('Valencia → Lisboa');
  });
});

describe('toSavedTrip', () => {
  it('traduce una fila completa al tipo del dominio', () => {
    expect(toSavedTrip(validRow())).toEqual({
      id: 'guardado-1',
      title: 'Puente de mayo',
      savedAt: '2026-08-08T10:00:00.000Z',
      tripRequestId: 'solicitud-1',
      origin: 'Valencia',
      destination: 'Lisboa',
      departureDate: '2026-09-10',
      returnDate: '2026-09-17',
      proposal: PROPOSAL,
      edits: [],
    });
  });

  // PostgREST devuelve las relaciones incrustadas como objeto o como array según
  // pueda deducir la cardinalidad. Aceptar las dos formas evita que un cambio de
  // versión deje la lista vacía sin decir por qué.
  it('acepta las relaciones incrustadas como array', () => {
    const row = validRow({
      trip_proposals: [{ data: PROPOSAL }],
      trip_requests: [
        {
          origin: 'Valencia',
          destination: 'Lisboa',
          departure_date: '2026-09-10',
          return_date: '2026-09-17',
        },
      ],
    });

    expect(toSavedTrip(row)?.origin).toBe('Valencia');
  });

  // Una fila rota no puede tumbar la lista entera: se descarta y el resto se
  // enseña.
  it('devuelve null en vez de lanzar cuando falta la propuesta', () => {
    expect(toSavedTrip(validRow({ trip_proposals: null }))).toBeNull();
  });

  it('devuelve null cuando falta la solicitud', () => {
    expect(toSavedTrip(validRow({ trip_requests: null }))).toBeNull();
  });

  it('devuelve null cuando la propuesta guardada no es un objeto', () => {
    expect(toSavedTrip(validRow({ trip_proposals: { data: 'una propuesta' } }))).toBeNull();
    expect(toSavedTrip(validRow({ trip_proposals: { data: [] } }))).toBeNull();
  });

  it('devuelve null ante campos obligatorios ausentes', () => {
    expect(toSavedTrip(validRow({ id: null }))).toBeNull();
    expect(toSavedTrip(validRow({ title: '' }))).toBeNull();
    expect(toSavedTrip(validRow({ created_at: undefined }))).toBeNull();
  });

  it('devuelve null cuando lo que llega no es una fila', () => {
    expect(toSavedTrip(null)).toBeNull();
    expect(toSavedTrip('fila')).toBeNull();
    expect(toSavedTrip([])).toBeNull();
  });
});
