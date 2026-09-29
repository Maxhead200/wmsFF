import {jsx} from 'react/jsx-runtime';

// FIX: use the original download, refresh and close callbacks inside compact disclosures.
export function onlineRequestToolbar(children:any, onEdit?:()=>void, onCancel?:()=>void):any {
  const flatten=(n:any):any[]=>Array.isArray(n)?n.flatMap(flatten):n?.type===Symbol.for('react.fragment')?flatten(n.props.children):n?[n]:[];
  const nodes=flatten(children);
  const rename=(node:any,label:string)=>jsx(node.type,{...node.props,children:[...flatten(node.props.children).filter(n=>typeof n!=='string'),label]},node.key??undefined);
  const group=(label:string,items:any[])=>jsx('details',{className:'request-online-menu',children:[jsx('summary',{children:label}),jsx('div',{className:'request-online-menu__items',children:items})]});
  const docs=nodes.filter(n=>n?.props?.className?.includes('client-request-action-button')).map(n=>flatten(n.props.children).includes('Короба Excel')?rename(n,'Короба на отправку XLSX'):flatten(n.props.children).includes('Состав Excel')?rename(n,'Содержимое коробов XLSX'):n);
  const actions=[onEdit&&jsx('button',{type:'button',className:'client-request-action-button',onClick:onEdit,children:'Редактировать заявку'}),onCancel&&jsx('button',{type:'button',className:'client-request-action-button client-request-action-button--cancel',onClick:onCancel,children:'Отменить заявку'})].filter(Boolean);
  return jsx('div',{className:'online-execution-modal__actions request-online-toolbar',children:[group('Документы',docs),actions.length?group('Действия с заявкой',actions):null,...nodes.filter(n=>!docs.includes(n)&&!n?.props?.className?.includes('client-request-action-button'))]});
}

// FIX: adapt only the existing online header, retaining all runtime-only assembly functionality.
export function groupRuntimeOnlineMenu(tree:any,onEdit?:()=>void,onCancel?:()=>void):any {
  const walk=(n:any):any=>Array.isArray(n)?n.map(walk):!n?.props?n:n.props.className==='online-execution-modal__actions'?onlineRequestToolbar(n.props.children,onEdit,onCancel):jsx(n.type,{...n.props,...(n.props.children!==undefined?{children:walk(n.props.children)}:{})},n.key??undefined);
  return walk(tree);
}
