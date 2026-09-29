import React,{useEffect,useRef,useState} from 'react';
import {appearanceBackground,userAppearanceKey,resolveUserAppearance,isSoulWinxUser,normaliseAppearance,wallpaperError,type SoulAppearanceValue} from './soulAppearanceModel';

// FIX: scoped to the mounted Soul theme and current user; never uploads files.
export function SoulAppearance({userId}:{userId:string}){
 const [value,setValue]=useState(()=>{try{return resolveUserAppearance(userId,JSON.parse(localStorage.getItem(userAppearanceKey(userId))||'null'));}catch{return resolveUserAppearance(userId,null);}});
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),request=useRef(0),panel=useRef<HTMLDetailsElement>(null);
 useEffect(()=>()=>{request.current++;},[]);
 useEffect(()=>{
  const root=document.documentElement;
  root.dataset.soulMode=value.mode;root.style.setProperty('--soul-background',appearanceBackground(value));
  return ()=>{delete root.dataset.soulMode;root.style.removeProperty('--soul-background');};
 },[value]);
 function save(next:SoulAppearanceValue){setValue(next);try{localStorage.setItem(userAppearanceKey(userId),JSON.stringify(next));setError('');}catch{setError('Оформление применено, но браузер не смог сохранить его. Попробуйте обои меньшего размера.');}}
 function update(patch:Partial<SoulAppearanceValue>){request.current++;setBusy(false);save(normaliseAppearance({...value,...patch}));}
 async function upload(file?:File){
  if(!file)return;const problem=wallpaperError(file);if(problem){setError(problem);return;}
  const id=++request.current;setBusy(true);setError('');
  try{
   const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error());reader.readAsDataURL(file);});
   await new Promise<void>((resolve,reject)=>{const img=new Image();img.onload=()=>img.naturalWidth&&img.naturalHeight?resolve():reject(new Error());img.onerror=()=>reject(new Error());img.src=data;});
   if(id!==request.current)return;
   save(normaliseAppearance({...value,mode:'custom',kind:'image',image:data}));
  }catch{if(id===request.current)setError('Не удалось прочитать изображение. Выберите другой файл.');}
  finally{if(id===request.current)setBusy(false);}
 }
 return <details className="soul-appearance" ref={panel} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();if(panel.current){panel.current.open=false;panel.current.querySelector('summary')?.focus();}}}}>
  <summary>Оформление · {value.mode==='winx'?'Winx':value.mode==='dark'?'Тёмное':value.mode==='custom'?'Своё':'Светлое'}</summary>
  <div className="soul-appearance-panel">
   <label>Цвет темы<select aria-label="Цвет темы" value={value.mode} onChange={e=>update({mode:e.target.value as SoulAppearanceValue['mode']})}>{isSoulWinxUser(userId)&&<option value="winx">Winx · Элькапоне</option>}<option value="light">Светлый</option><option value="dark">Тёмный</option><option value="custom">Настраиваемый</option></select></label>
   {value.mode==='custom'&&<>
    <label>Фон<select aria-label="Тип фона" value={value.kind} onChange={e=>update({kind:e.target.value as SoulAppearanceValue['kind']})}><option value="color">Цвет</option><option value="gradient">Градиент</option><option value="image">Обои</option></select></label>
    {value.kind!=='image'?<div className="soul-colors"><label>Первый цвет<input aria-label="Первый цвет" type="color" value={value.first} onChange={e=>update({first:e.target.value})}/></label>{value.kind==='gradient'&&<label>Второй цвет<input aria-label="Второй цвет" type="color" value={value.second} onChange={e=>update({second:e.target.value})}/></label>}</div>:<>
     <label>Загрузить обои<input aria-label="Загрузить обои" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label>
     <small>PNG, JPG, WebP · до 2 МБ. Только в этом браузере.</small>
     {value.image&&<><img className="soul-wallpaper-preview" src={value.image} alt="Выбранные обои"/><button type="button" onClick={()=>update({image:'',kind:'color'})}>Удалить обои</button></>}
    </>}
   </>}
   {busy&&<p role="status">Проверяю изображение…</p>}{error&&<p role="alert">{error}</p>}
   <button type="button" onClick={()=>update(resolveUserAppearance(userId,null))}>Сбросить оформление</button>
  </div>
 </details>;
}
