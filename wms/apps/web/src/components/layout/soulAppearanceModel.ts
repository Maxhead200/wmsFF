// FIX: user-local settings; no URLs, arbitrary CSS or server persistence.
export type SoulAppearanceValue={mode:'light'|'dark'|'custom'|'winx';kind:'color'|'gradient'|'image';first:string;second:string;image:string};
export const appearanceKey=(userId:string)=>`wms.soul.appearance.v1:${userId}`;
// FIX: verified Elkapone account; preserve Elya and everyone else's preferences.
export const isSoulWinxUser=(userId:string)=>userId==='8e175b30-8535-4881-9324-a875c9fd8c1d';
export const userAppearanceKey=(userId:string)=>appearanceKey(userId)+(isSoulWinxUser(userId)?':winx-v1':'');
export function resolveUserAppearance(userId:string,value:unknown){
 const result=normaliseAppearance(value??(isSoulWinxUser(userId)?{mode:'winx'}:null));
 if(result.mode==='winx'&&!isSoulWinxUser(userId))result.mode='light';
 return result;
}
export function normaliseAppearance(value:unknown):SoulAppearanceValue {
 const v=(value&&typeof value==='object'?value:{}) as Partial<SoulAppearanceValue>;
 const color=(c:unknown,fallback:string)=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)?c:fallback;
 return {mode:v.mode==='dark'||v.mode==='custom'||v.mode==='winx'?v.mode:'light',kind:v.kind==='gradient'||v.kind==='image'?v.kind:'color',first:color(v.first,'#e5efe9'),second:color(v.second,'#e8eff8'),image:typeof v.image==='string'&&v.image.length<2800000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v.image)?v.image:''};
}
export function appearanceBackground(v:SoulAppearanceValue){
 if(v.mode==='winx')return 'url("/assets/soul-winx-20260929.png")';
 if(v.mode==='light')return '#f3f1eb';
 if(v.mode==='dark')return 'linear-gradient(135deg, #171b20, #303841)';
 if(v.kind==='image'&&v.image)return `url("${v.image}")`;
 return v.kind==='gradient'?`linear-gradient(135deg, ${v.first}, ${v.second})`:v.first;
}
export function wallpaperError(file:{type:string;size:number}){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))return 'Выберите изображение PNG, JPG или WebP.';
 if(file.size>2*1024*1024)return 'Размер обоев — не более 2 МБ.';
 return '';
}
