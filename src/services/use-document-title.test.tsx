// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDocumentTitle, HOME_TITLE, useDocumentTitle } from './use-document-title.ts';

afterEach(cleanup);

function Pantalla({ title }: { title?: string }) {
  useDocumentTitle(title);
  return null;
}

describe('buildDocumentTitle', () => {
  it('pone el nombre del sitio detrás del de la pantalla', () => {
    expect(buildDocumentTitle('Mis viajes guardados')).toBe('Mis viajes guardados — Trip Planner');
  });

  // La portada no se llama "Trip Planner — Trip Planner".
  it('deja el título de la portada tal cual', () => {
    expect(buildDocumentTitle()).toBe(HOME_TITLE);
  });
});

describe('useDocumentTitle', () => {
  it('escribe el título de la pestaña', () => {
    render(<Pantalla title="Tu cuenta" />);

    expect(document.title).toBe('Tu cuenta — Trip Planner');
  });

  // Es lo que hace que cambiar de pantalla se note: en una aplicación de una
  // sola página el título no cambia solo, y sin esto quien navega con lector de
  // pantalla no recibe ninguna señal de que la navegación ha ocurrido.
  it('lo actualiza al cambiar de pantalla', () => {
    const { rerender } = render(<Pantalla title="Tu cuenta" />);
    rerender(<Pantalla title="Mis viajes guardados" />);

    expect(document.title).toBe('Mis viajes guardados — Trip Planner');
  });

  it('vuelve al de la portada cuando no hay título de pantalla', () => {
    const { rerender } = render(<Pantalla title="Tu cuenta" />);
    rerender(<Pantalla />);

    expect(document.title).toBe(HOME_TITLE);
  });
});
