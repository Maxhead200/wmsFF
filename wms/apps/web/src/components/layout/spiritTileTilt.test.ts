import { describe, it, expect } from 'vitest';
import { tileTilt, installSpiritTileTilt } from './spiritTileTilt';

// TEST: the corner beneath the pointer rises, with bounded readable rotation.
describe('Spirit cursor tilt', () => {
  it('raises all corners in the centre, then only the pointed corner', () => {
    const rect = { left: 10, top: 20, width: 200, height: 100 };
    const centre = tileTilt(rect, 110, 70);
    expect(centre).toEqual({ x: 0, y: 0, z: 6 });
    const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
    for (const [selected, [px,py]] of corners.entries()) {
      const tilt = tileTilt(rect, 110 + px*100, 70 + py*50);
      // TEST: exact CSS translateZ -> rotateX -> rotateY corner heights.
      const rx=tilt.x*Math.PI/180, ry=tilt.y*Math.PI/180;
      const heights=corners.map(([x,y])=>tilt.z-x*100*Math.sin(ry)*Math.cos(rx)+y*50*Math.sin(rx));
      expect(heights[selected]).toBeGreaterThan(centre.z);
      heights.forEach((height,i)=>{if(i!==selected)expect(height).toBeLessThan(0);});
      expect(Math.abs(tilt.x)).toBeLessThan(12);
      expect(Math.abs(tilt.y)).toBeLessThan(12);
    }
    expect(tileTilt(rect, 900, -900)).toEqual(tileTilt(rect, 210, 20));
    expect(tileTilt({ ...rect, width: 0 }, 20, 30)).toEqual({ x: 0, y: 0, z: 0 });
  });
  it('does not install pointer listeners when motion or hover is unavailable', () => {
    let listeners = 0;
    const media = { matches: false, addEventListener() {}, removeEventListener() {} };
    const win = { matchMedia: () => media, addEventListener: () => listeners++, removeEventListener() {} };
    const doc = { addEventListener: () => listeners++, removeEventListener() {} };
    const dispose = installSpiritTileTilt(doc as unknown as Document, win as unknown as Window);
    expect(listeners).toBe(0);
    dispose();
  });
  it('batches mouse movement in every theme and cleans up outside the workspace', () => {
    const handlers = new Map<string, (event?: unknown) => void>();
    const props = new Map<string, string>();
    let callback: (() => void) | null = null;
    let frames = 0;
    let inWorkspace = true;
    // TEST: non-Spirit themes must pass the workspace guard as well.
    const tile = { isConnected: true, closest: (selector: string) => inWorkspace && selector === '.app-layout', matches: () => false,
      contains: (node: unknown) => node === tile,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
      style: { setProperty: (key: string, value: string) => props.set(key, value), removeProperty: (key: string) => props.delete(key) } };
    const media = { matches: true, addEventListener: (key: string, fn: () => void) => handlers.set('media', fn), removeEventListener: () => handlers.delete('media') };
    const events = { addEventListener: (key: string, fn: (e?: unknown) => void) => handlers.set(key, fn), removeEventListener: (key: string) => handlers.delete(key) };
    const win = { ...events, matchMedia: () => media, requestAnimationFrame: (fn: () => void) => { callback = fn; return ++frames; }, cancelAnimationFrame: () => { callback = null; } };
    const dispose = installSpiritTileTilt(events as unknown as Document, win as unknown as Window);
    const event = { target: { closest: () => tile }, pointerType: 'mouse', buttons: 0, clientX: 200, clientY: 0 };
    handlers.get('pointermove')!(event); handlers.get('pointermove')!(event);
    expect(frames).toBe(1);
    (callback as unknown as () => void)();
    expect(Number.parseFloat(props.get('--spirit-tilt-x')!)).toBeLessThan(-4);
    expect(Number.parseFloat(props.get('--spirit-tilt-y')!)).toBeLessThan(-4);
    expect(props.get('--spirit-tilt-z')).toBe('-2.50px');
    handlers.get('pointerout')!({ relatedTarget: tile });
    expect(props.size).toBe(3);
    handlers.get('pointerout')!({ relatedTarget: null });
    expect(props.size).toBe(0);
    inWorkspace = false; handlers.get('pointermove')!(event); expect(frames).toBe(1);
    inWorkspace = true; handlers.get('pointermove')!({ ...event, pointerType: 'touch' }); expect(frames).toBe(1);
    handlers.get('pointermove')!(event);
    media.matches = false; handlers.get('media')!();
    expect(callback).toBeNull(); expect(props.size).toBe(0);
    expect(handlers.has('pointermove')).toBe(false);
    dispose(); expect(handlers.size).toBe(0);
  });
});
