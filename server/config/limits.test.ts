import { describe, expect, it } from 'vitest';
import { isWithinBodySizeLimit, MAX_REQUEST_BODY_BYTES } from './limits.js';

describe('isWithinBodySizeLimit', () => {
  it('acepta un body dentro del límite', () => {
    expect(isWithinBodySizeLimit('a'.repeat(100))).toBe(true);
  });

  it('rechaza un body que supera el límite', () => {
    expect(isWithinBodySizeLimit('a'.repeat(MAX_REQUEST_BODY_BYTES + 1))).toBe(false);
  });
});
