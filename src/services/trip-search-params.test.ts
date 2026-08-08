import { describe, expect, it } from 'vitest';
import type { TripRequest } from '../types/api.ts';
import { fromSearchParams, toSearchParams } from './trip-search-params.ts';
import { validateTripForm } from './trip-validation.ts';

function buildRequest(overrides: Partial<TripRequest> = {}): TripRequest {
  return {
    origin: 'Valencia',
    destination: 'Lisboa',
    departureDate: '2099-09-10',
    returnDate: '2099-09-17',
    travelers: { adults: 2, children: 1 },
    budget: 3000,
    currency: 'EUR',
    travelStyle: 'balanced',
    preferences: {
      beach: 1,
      culture: 3,
      gastronomy: 3,
      nightlife: 0,
      nature: 2,
      shopping: 0,
      family: 0,
      relax: 1,
    },
    ...overrides,
  };
}

describe('toSearchParams / fromSearchParams', () => {
  // Es lo que sostiene que refrescar `/results` funcione: la búsqueda entera
  // cabe en la URL y vuelve a salir idéntica.
  it('la búsqueda sobrevive al viaje de ida y vuelta por la URL', () => {
    const request = buildRequest();
    const recovered = validateTripForm(fromSearchParams(toSearchParams(request)));

    expect(recovered.valid).toBe(true);
    if (recovered.valid) expect(recovered.request).toEqual(request);
  });

  it('conserva las restricciones cuando las hay', () => {
    const request = buildRequest({ constraints: { checkedBaggageRequired: true } });
    const recovered = validateTripForm(fromSearchParams(toSearchParams(request)));

    expect(recovered.valid).toBe(true);
    if (recovered.valid) expect(recovered.request.constraints?.checkedBaggageRequired).toBe(true);
  });

  it('no arrastra restricciones que el usuario no pidió', () => {
    const params = toSearchParams(buildRequest());

    expect(params.get('checkedBaggage')).toBeNull();
  });

  it('escribe una preferencia por cada tipo de la sección 6', () => {
    const params = toSearchParams(buildRequest());

    expect(params.get('pref.culture')).toBe('3');
    expect(params.get('pref.shopping')).toBe('0');
  });

  // Un parámetro que falta no puede colarse como un 0 silencioso: tiene que
  // llegar a la validación como lo que es, un dato que no está.
  it('una URL incompleta no pasa la validación', () => {
    const params = toSearchParams(buildRequest());
    params.delete('budget');

    expect(validateTripForm(fromSearchParams(params)).valid).toBe(false);
  });

  it('una URL manipulada no pasa la validación', () => {
    const params = toSearchParams(buildRequest());
    params.set('adults', 'muchos');

    expect(validateTripForm(fromSearchParams(params)).valid).toBe(false);
  });

  it('una URL vacía no pasa la validación', () => {
    expect(validateTripForm(fromSearchParams(new URLSearchParams())).valid).toBe(false);
  });
});
