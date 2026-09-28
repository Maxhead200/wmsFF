// FIX: user-local settings; no URLs, arbitrary CSS or server persistence.
export type SoulAppearanceValue={mode:'light'|'dark'|'custom';kind:'color'|'gradient'|'image';first:string;second:string;image:string};
export const appearanceKey=(userId:string)=>`wms.soul.appearance.v1:${userId}`;
export function normaliseAppearance(value:unknown):SoulAppearanceValue {
 const v=(value&&typeof value==='object'?value:{}) as Partial<SoulAppearanceValue>;
 const color=(c:unknown,fallback:string)=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)?c:fallback;
 return {mode:v.mode==='dark'||v.mode==='custom'?v.mode:'light',kind:v.kind==='gradient'||v.kind==='image'?v.kind:'color',first:color(v.first,'#e5efe9'),second:color(v.second,'#e8eff8'),image:typeof v.image==='string'&&v.image.length<2800000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v.image)?v.image:''};
}
export function appearanceBackground(v:SoulAppearanceValue){
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
