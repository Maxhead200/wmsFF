import {jsx} from 'react/jsx-runtime';

// FIX: surgical adapter for the verified production table until source/runtime parity is restored.
// Retain its existing event handlers, permission gates, extra SKU actions and status controls.
export function groupRuntimeRequestActions(tree:any, administrator:boolean):any {
  const list=(value:any):any[]=>Array.isArray(value)?value.flatMap(list):value===null||value===undefined||value===false?[]:
    value?.type===Symbol.for('react.fragment')?list(value.props.children):[value];
  const has=(node:any,cls:string)=>node?.props?.className?.split(' ').includes(cls);
  const walk=(node:any,visit:(node:any)=>any):any=>{
    if(Array.isArray(node))return node.map(n=>walk(n,visit));
    if(!node?.props)return node;
    const next=visit(node);if(next!==node)return next;
    if(node.props.children===undefined)return node;
    return jsx(node.type,{...node.props,children:walk(node.props.children,visit)},node.key??undefined);
  };
  const find=(tree:any,predicate:(node:any)=>boolean):any=>{
    for(const n of list(tree)){if(predicate(n))return n;if(n?.props){const child=find(n.props.children,predicate);if(child)return child;}}
  };
  const rename=(node:any,label:string,cls?:string)=>node&&jsx(node.type,{...node.props,...(cls?{className:cls}:{}),children:list(node.props.children).map(c=>c?.type==='span'?jsx('span',{...c.props,children:label},c.key??undefined):c)},node.key??undefined);
  const group=(title:string,children:any[],recovery=false)=>jsx('details',{className:'request-action-menu__group'+(recovery?' request-action-menu__recovery':''),children:[jsx('summary',{children:title}),jsx('div',{className:'request-action-menu__items',children:children.filter(Boolean)})]});
  return walk(tree,row=>{
    if(row?.type!=='tr')return row;
    const cells=list(row.props.children),warehouse=cells.find(c=>has(c,'client-request-table__warehouse-cell'));
    const online=find(row,n=>has(n,'document-open-button--online'));
    if(!warehouse||!online)return row;
    const route=find(row,n=>has(n,'client-request-row-fbs-link--route'));
    const holder=find(warehouse,n=>has(n,'client-request-actions'));
    if(!holder)return row;
    const actions=list(holder.props.children),action=(suffix:string)=>actions.find(n=>has(n,'client-request-action-button--'+suffix));
    const refresh=action('refresh-instruction'),fbs=!!route||!!action('fbs-box-search');
    const main=cells.find(c=>has(c,'client-request-table__actions-cell'));
    const edit=find(main,n=>has(n,'client-request-action-button--edit')),cancel=find(main,n=>has(n,'client-request-action-button--cancel'));
    const menu=jsx('div',{className:'request-action-menu',children:[
      rename(online,'Открыть сборку','client-request-action-button request-action-menu__open'),
      route&&jsx(route.type,{...route.props,className:'client-request-action-button request-action-menu__route'},route.key??undefined),
      rename(action('fbs-box-search'),'Остатки и короба'),
      !fbs&&refresh&&rename(refresh,refresh.props.disabled?'Пересчитываю заявку':'Обновить план'),
      group('Документы',[action('instruction'),...actions.filter(n=>has(n,'client-request-action-button--xlsx'))]),
      group('Ещё',[
        rename(action('box-selection'),'Источники товара'),action('supply-check'),
        action('sync-tsd')&&rename(action('sync-tsd'),action('sync-tsd').props.disabled?'Синхронизирую':fbs?'Синхронизировать задания':'Обновить очередь ТСД'),
        fbs&&refresh&&rename(refresh,refresh.props.disabled?'Проверяю паллет-сорты':'Проверить задания и маршруты'),
        rename(edit,'Редактировать заявку'),rename(cancel,'Отменить заявку'),
      ]),
    ]});
    return jsx(row.type,{...row.props,children:cells.map(cell=>{
      if(cell===warehouse)return jsx(cell.type,{...cell.props,children:jsx('div',{className:'client-request-actions',children:menu})},cell.key??undefined);
      return walk(cell,n=>n===route||n===online||n===edit||n===cancel?null:n);
    })},row.key??undefined);
  });
}
