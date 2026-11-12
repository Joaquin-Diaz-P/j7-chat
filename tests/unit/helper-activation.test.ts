import { describe, expect, it, vi } from 'vitest';
import { NativeHelper } from '../../src/main/native/helper.js';

describe('previous application activation protocol', () => {
  it.each([
    { reply: { ok: true, activated: true }, expected: true },
    { reply: { ok: true, activated: false }, expected: false },
    { reply: { ok: false, activated: true }, expected: false },
    { reply: { ok: true }, expected: false },
  ])('maps $reply to $expected without starting another helper', async ({ reply, expected }) => {
    const helper = new NativeHelper('/unused');
    const request = vi.spyOn(helper, 'request').mockResolvedValue(reply);
    expect(await helper.activatePreviousApp()).toBe(expected);
    expect(request).toHaveBeenCalledExactlyOnceWith('activatePreviousApp');
  });
});
