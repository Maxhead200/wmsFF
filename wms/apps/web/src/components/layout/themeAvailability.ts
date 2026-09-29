// FIX: keep legacy styles available to sold WMS; retire choices only on our host.
const retiredThemes = new Set(['spirit', 'classic', 'space', 'future3100', 'obsidian', 'aerospace']);

export function isThemeAvailable(theme: string, ourWms: boolean): boolean {
  return !ourWms || !retiredThemes.has(theme);
}

export function resolveRetiredTheme<T extends string>(theme: T, ourWms: boolean): T | 'modern' {
  return isThemeAvailable(theme, ourWms) ? theme : 'modern';
}
