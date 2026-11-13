import { isSessionActive } from './session-lifetime';

const now = new Date('2026-11-12T14:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

describe('vida de una sesión', () => {
  it('una sesión usada hace 6 días sigue activa; sin uso por más de 7 días, vence', () => {
    expect(isSessionActive({ createdAt: daysAgo(10), lastSeenAt: daysAgo(6), now })).toBe(true);
    expect(isSessionActive({ createdAt: daysAgo(10), lastSeenAt: daysAgo(7.01), now })).toBe(false);
  });
});
