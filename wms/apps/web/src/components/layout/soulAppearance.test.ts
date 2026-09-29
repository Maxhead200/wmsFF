import {describe,it,expect} from 'vitest';
import {normaliseAppearance,appearanceBackground,wallpaperError,appearanceKey,resolveUserAppearance,isSoulWinxUser,userAppearanceKey} from './soulAppearanceModel';
// TEST: validate persisted/untrusted appearance settings before using them in CSS.
describe('Soul appearance',()=>{
 // TEST: Elkapone is not the separate existing user named Elya.
 it('assigns Winx only to the verified Elkapone account',()=>{const id='8e175b30-8535-4881-9324-a875c9fd8c1d';expect(isSoulWinxUser(id)).toBe(true);expect(isSoulWinxUser('d65d6258-d4e8-4bc1-b1cf-583d1a1e4c82')).toBe(false);expect(resolveUserAppearance(id,null).mode).toBe('winx');expect(resolveUserAppearance('other',{mode:'winx'}).mode).toBe('light');expect(resolveUserAppearance(id,{mode:'dark'}).mode).toBe('dark');expect(userAppearanceKey(id)).not.toBe(appearanceKey(id));});
 it('defaults safely and rejects CSS or remote URLs',()=>{const p=normaliseAppearance({mode:'custom',kind:'image',first:'red;display:none',image:'https://example.com/a.png'});expect(p.first).toBe('#e5efe9');expect(p.image).toBe('');expect(appearanceBackground(p)).toBe('#e5efe9');});
 it('supports all modes and gradient colours',()=>{expect(appearanceBackground(normaliseAppearance({mode:'dark'}))).toContain('#171b20');expect(appearanceBackground(normaliseAppearance({mode:'light'}))).toBe('#f3f1eb');expect(appearanceBackground(normaliseAppearance({mode:'custom',kind:'gradient',first:'#123456',second:'#abcdef'}))).toBe('linear-gradient(135deg, #123456, #abcdef)');});
 it('allows only bounded raster wallpaper files',()=>{expect(wallpaperError({type:'image/svg+xml',size:20})).toBeTruthy();expect(wallpaperError({type:'image/png',size:3*1024*1024})).toBeTruthy();expect(wallpaperError({type:'image/webp',size:1000})).toBe('');});
 it('isolates users and validates stored image data',()=>{expect(appearanceKey('a')).not.toBe(appearanceKey('b'));expect(normaliseAppearance({image:'data:image/png;base64,YQ=='}).image).toContain('data:image/png');expect(normaliseAppearance({image:'data:image/svg+xml;base64,YQ=='}).image).toBe('');});
});
