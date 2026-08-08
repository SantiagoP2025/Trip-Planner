import { describe, expect, it, vi } from 'vitest';
import { NoopTripRepository } from '../repositories/noop-trip.repository.js';
import type {
  NewTripRequest,
  TripGenerationOutcome,
  TripRepository,
} from '../repositories/trip.repository.js';
import type { PreferenceProfile } from '../types/common.js';
import { BestEffortTripPersistence } from './trip-persistence.service.js';

const PREFERENCES: PreferenceProfile = {
  beach: 1,
  culture: 3,
  gastronomy: 3,
  nightlife: 0,
  nature: 2,
  shopping: 0,
  family: 0,
  relax: 1,
};

const RECORD: NewTripRequest = {
  request: {
    origin: 'Valencia',
    destination: 'Lisboa',
    departureDate: '2026-09-10',
    returnDate: '2026-09-17',
    travelers: { adults: 2, children: 0 },
    budget: 3000,
    currency: 'EUR',
    travelStyle: 'balanced',
    preferences: PREFERENCES,
  },
  userId: null,
};

const OUTCOME: TripGenerationOutcome = {
  status: 'completed',
  proposals: [],
  diagnostics: null,
  failure: null,
};

function repositoryThatFails(error: Error): TripRepository {
  return {
    createTripRequest: () => Promise.reject(error),
    saveGenerationOutcome: () => Promise.reject(error),
  };
}

describe('BestEffortTripPersistence', () => {
  it('devuelve el identificador cuando la escritura va bien', async () => {
    const repository: TripRepository = {
      createTripRequest: async () => 'solicitud-1',
      saveGenerationOutcome: async () => {},
    };
    const persistence = new BestEffortTripPersistence(repository);

    await expect(persistence.begin('req-1', RECORD)).resolves.toBe('solicitud-1');
  });

  // El criterio de la fase 6: si la base de datos falla, el viaje se genera igual.
  it('no propaga el fallo al crear la solicitud', async () => {
    const onError = vi.fn();
    const persistence = new BestEffortTripPersistence(repositoryThatFails(new Error('caída')), {
      onError,
    });

    await expect(persistence.begin('req-1', RECORD)).resolves.toBeNull();
    expect(onError).toHaveBeenCalledWith('req-1', 'trip.persistence_begin_failed', expect.any(Error));
  });

  it('no propaga el fallo al cerrar la generación', async () => {
    const onError = vi.fn();
    const persistence = new BestEffortTripPersistence(repositoryThatFails(new Error('caída')), {
      onError,
    });

    await expect(persistence.complete('req-1', 'solicitud-1', OUTCOME)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(
      'req-1',
      'trip.persistence_complete_failed',
      expect.any(Error),
    );
  });

  it('no intenta cerrar nada si la solicitud no llegó a crearse', async () => {
    const saveGenerationOutcome = vi.fn();
    const persistence = new BestEffortTripPersistence({
      createTripRequest: async () => null,
      saveGenerationOutcome,
    });

    await persistence.complete('req-1', null, OUTCOME);

    expect(saveGenerationOutcome).not.toHaveBeenCalled();
  });

  // Una base de datos que no responde es tan dañina como una que falla: sin
  // tope, el usuario espera por una escritura que no necesita para ver su viaje.
  it('se rinde cuando la base de datos no responde a tiempo', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const persistence = new BestEffortTripPersistence(
      {
        createTripRequest: () => new Promise(() => {}),
        saveGenerationOutcome: () => new Promise(() => {}),
      },
      { timeoutMs: 3_000, onError },
    );

    const pending = persistence.begin('req-1', RECORD);
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(pending).resolves.toBeNull();
    expect(onError).toHaveBeenCalledWith(
      'req-1',
      'trip.persistence_begin_failed',
      expect.any(Error),
    );
    vi.useRealTimers();
  });

  it('registra el fallo pero no lo enseña: nunca lanza', async () => {
    const persistence = new BestEffortTripPersistence(
      repositoryThatFails(new Error('la contraseña de la base de datos es incorrecta')),
    );

    await expect(persistence.begin('req-1', RECORD)).resolves.toBeNull();
    await expect(persistence.complete('req-1', 'solicitud-1', OUTCOME)).resolves.toBeUndefined();
  });
});

describe('NoopTripRepository', () => {
  it('no guarda nada y lo dice devolviendo null', async () => {
    const repository = new NoopTripRepository();

    await expect(repository.createTripRequest()).resolves.toBeNull();
    await expect(repository.saveGenerationOutcome()).resolves.toBeUndefined();
  });
});
