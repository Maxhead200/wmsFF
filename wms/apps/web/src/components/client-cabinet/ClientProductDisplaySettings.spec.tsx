import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClientProductDisplaySettings } from './ClientProductDisplaySettings';
const hooks = vi.hoisted(() => ({ index: 0, values: [] as unknown[] }));
vi.mock('react', async () => ({ ...await vi.importActual<typeof import('react')>('react'),
  useEffect: () => {}, useState: (initial: unknown) => [hooks.values[hooks.index++] ?? initial, vi.fn()],
}));
function render(values: unknown[]) {
  hooks.index = 0; hooks.values = values;
  return renderToStaticMarkup(<ClientProductDisplaySettings accessToken="test" clientId="client-a" />);
}
describe('visible client display setting', () => {
  // TEST: opening the cabinet must reveal the setting even before its request completes.
  it('shows a labelled loading panel instead of disappearing', () => {
    const html = render([null, false, false, '', '']);
    expect(html).toContain('Отображение товара при сборке и упаковке');
    expect(html).toContain('Загружаю настройку');
  });
  it('shows five choices without opening collapsed details', () => {
    const html = render([null, true, false, '', '']);
    for (const field of ['Наименование', 'Артикул', 'Штрихкод', 'Размер', 'Цвет']) expect(html).toContain(field);
    expect(html).not.toContain('<details');
  });
  it('reports a failed request and preserves the disabled-deployment fallback', () => {
    expect(render([null, false, false, '', 'Нет доступа'])).toContain('role="alert"');
    expect(render([null, false, false, '', 'Настройка отображения товаров не включена.'])).toBe('');
  });
});
