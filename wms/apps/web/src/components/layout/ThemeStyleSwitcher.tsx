import * as React from 'react';
import {readThemeStyle,saveThemeStyle,type ThemeStyle} from './themeStyle';
// FIX: mounted only for la_panthera and keyed by user; switching theme/logging out clears the root attribute.
export function ThemeStyleSwitcher({userId}:{userId:string}) {
 const [style,setStyle]=React.useState<ThemeStyle>(()=>readThemeStyle(userId));
 React.useLayoutEffect(()=>{
  document.documentElement.dataset.uiStyle=style;
  return ()=>{delete document.documentElement.dataset.uiStyle;};
 },[style]);
 return <label className="ui-theme-switcher ui-style-switcher" title="Выбрать стиль оформления">
  <span>Стиль оформления</span>
  <select aria-label="Стиль оформления" value={style} onChange={event=>{
   const next=event.target.value==='light'?'light':'dark';setStyle(next);saveThemeStyle(userId,next);
  }}><option value="dark">Dark</option><option value="light">Light</option></select>
 </label>;
}
