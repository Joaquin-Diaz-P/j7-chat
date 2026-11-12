import { expect, it } from 'vitest';
import { allowPermission } from '../../src/main/ipc-trust.js';

it('allows only clipboard writes and the bar microphone', () => {
  expect(allowPermission('clipboard-sanitized-write', undefined, false)).toBe(true);
  expect(allowPermission('media', ['audio'], true)).toBe(true);
  expect(allowPermission('media', ['audio'], false)).toBe(false);
  expect(allowPermission('media', ['audio', 'video'], true)).toBe(false);
  expect(allowPermission('media', ['video'], true)).toBe(false);
  expect(allowPermission('media', [], true)).toBe(false);
  for (const other of ['notifications', 'geolocation', 'clipboard-read', 'openExternal', 'fullscreen']) expect(allowPermission(other, undefined, true)).toBe(false);
});
