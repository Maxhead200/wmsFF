import { describe, expect, it } from 'vitest';
import { isThemeAvailable, resolveRetiredTheme } from './themeAvailability';

// TEST: retire only the requested themes in our WMS, including saved preferences.
describe('theme availability', () => {
  const retired = ['spirit', 'classic', 'space', 'future3100', 'obsidian', 'aerospace'];
  it.each(retired)('removes %s and migrates its saved choice', (theme) => {
    expect(isThemeAvailable(theme, true)).toBe(false);
    expect(resolveRetiredTheme(theme, true)).toBe('modern');
  });
  it.each(['modern', 'polar', 'soul', 'winx', 'la_panthera'])('preserves %s', (theme) => {
    expect(isThemeAvailable(theme, true)).toBe(true);
    expect(resolveRetiredTheme(theme, true)).toBe(theme);
  });
  it('does not change sold WMS preferences or choices', () => {
    for (const theme of retired) {
      expect(isThemeAvailable(theme, false)).toBe(true);
      expect(resolveRetiredTheme(theme, false)).toBe(theme);
    }
  });
});
