import {menu,transition,pageType} from './model.js';
// FIX: all navigation and demo form state is ephemeral; no API/storage calls.
let state={group:null,selected:null};
const nav=document.querySelector('#navigation'),page=document.querySelector('#page');
const symbols={client:'◈',operations:'▦',management:'◇',control:'◎'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function groupCard(g){return `<section class="group ${g.id}" aria-label="${g.title}"><div class="group-head"><span class="group-icon" aria-hidden="true">${symbols[g.id]}</span><div><h2>${g.title}</h2><small>${String(g.items.length).padStart(2,'0')} разделов</small></div></div><p class="group-description">${g.description}</p><div class="items">${g.items.map((i,n)=>`<button class="item" data-open="${i.id}" ${state.selected===i.id?'aria-current="page"':''} title="${esc(i.description)}"><span class="item-index" aria-hidden="true">${String(n+1).padStart(2,'0')}</span><span>${esc(i.title)}</span><span class="arrow" aria-hidden="true">↗</span></button>`).join('')}</div><div class="group-footer"><span>${g.title}</span><span aria-hidden="true">↗</span></div></section>`;}
function renderNav(){
 document.querySelector('#home').hidden=!state.group;
 document.querySelector('.intro').hidden=Boolean(state.group);
 document.querySelector('#nav-caption').textContent=state.group?'Навигация по контурам':'04 контура · единое пространство';
 nav.className=state.group?'focused':'';
 nav.innerHTML=state.group?`<div class="group-tabs">${menu.map(g=>`<button class="group-tab ${g.id}" data-group="${g.id}" aria-expanded="${g.id===state.group}"><span aria-hidden="true">${symbols[g.id]}</span>${g.title}</button>`).join('')}</div>${groupCard(menu.find(g=>g.id===state.group))}`:menu.map(groupCard).join('');
}
const tableSets={
 billing:{columns:['Счёт','Клиент','Период','Сумма','Статус'],rows:[['ДЕМО-031','Клиент «Север»','01–15 сентября','18 420 ₽','Ожидает оплаты'],['ДЕМО-032','Клиент «Линия»','01–15 сентября','9 870 ₽','Оплачен'],['ДЕМО-033','Клиент «Форма»','16–28 сентября','12 650 ₽','Черновик']]},
 stock:{columns:['Штрихкод / товар','Размещение','Клиент','Количество','Статус'],rows:[['ДЕМО-1001 · Костюм графит','Короб ДЕМО-637','Клиент «Север»','24 шт.','На складе'],['ДЕМО-1002 · Худи молочный','Короб ДЕМО-638','Клиент «Линия»','18 шт.','На складе'],['ДЕМО-1003 · Брюки песочные','Короб ДЕМО-639','Клиент «Форма»','36 шт.','На проверке']]},
 orders:{columns:['Заявка / заказ','Клиент','Направление','Состав','Статус'],rows:[['ДЕМО-1513','Клиент «Север»','WB · Москва','12 ед.','Новая'],['ДЕМО-1512','Клиент «Линия»','Ozon · Москва','8 ед.','Собирается'],['ДЕМО-1511','Клиент «Форма»','WB · Краснодар','21 ед.','Готова']]},
 registry:{columns:['Запись','Наименование','Ответственный','Обновлено','Статус'],rows:[['ДЕМО-001','Основная запись','Демо-менеджер','29.09 · 09:20','Активна'],['ДЕМО-002','Дополнительная запись','Демо-оператор','29.09 · 09:15','На проверке'],['ДЕМО-003','Архивная запись','Демо-менеджер','28.09 · 18:40','Завершена']]}
};
function tableFor(id){return ['billing','expenses'].includes(id)?tableSets.billing:['warehouse','inventory','turnover','catalog','kiz','data','pallet-sorting'].includes(id)?tableSets.stock:['requests','fbs','dbs','fbo-ozon','fbs-packed','order-assembly'].includes(id)?tableSets.orders:tableSets.registry;}
function tableBody(set,query=''){const rows=set.rows.filter(r=>r.join(' ').toLowerCase().includes(query.toLowerCase()));return rows.length?rows.map(r=>`<tr>${r.map((v,i)=>`<td>${i===r.length-1?`<span class="status ${/Ожидает|проверке|Черновик/.test(v)?'wait':''}">${esc(v)}</span>`:esc(v)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="5">По этому запросу ничего не найдено</td></tr>`;}
function cardsFor(id){if(id==='branches')return [['Москва','4 218','Товаров в демо-филиале'],['Краснодар','736','Товаров в демо-филиале'],['Ногинск','1 804','Товаров в демо-филиале']];if(id==='monitoring')return [['Устройства в сети','8','Демонстрационные терминалы'],['В работе','6','Сборка и приёмка'],['Требуют внимания','2','Пример предупреждений']];if(['analytics','operations-statistics'].includes(id))return [['Обработано','247','Заказов за выбранный демо-период'],['До 14 часов','83,4%','Демонстрационный показатель'],['Среднее время','8 ч 24 м','Не реальные данные WMS']];return [['Активные записи','24','Демонстрационный обзор'],['В работе','12','Пример состояния'],['Завершено','37','Пример итогового показателя']];}
function renderPage(){
 if(!state.selected){page.hidden=true;page.innerHTML='';return;}
 const g=menu.find(g=>g.items.some(i=>i.id===state.selected)),item=g.items.find(i=>i.id===state.selected),type=pageType(item.id);
 page.hidden=false;page.className=g.id;page.dataset.selected=item.id;
 let body='';
 if(type==='table'){const set=tableFor(item.id);body=`<div class="toolbar"><label><span class="sr-only">Поиск в демонстрационной таблице</span><input id="search" placeholder="Поиск в этом разделе…"></label><span>3 демонстрационные записи</span></div><div class="table-scroll" tabindex="0" role="region" aria-label="Таблица ${esc(item.title)}"><table><thead><tr>${set.columns.map(c=>`<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${tableBody(set)}</tbody></table></div>`;}
 if(type==='cards')body=`<div class="summary">${cardsFor(item.id).map(r=>`<article><h3>${r[0]}</h3><strong>${r[1]}</strong><p>${r[2]}</p></article>`).join('')}</div>`;
 if(type==='form')body=`<form class="demo-form"><label>Клиент<select><option>Клиент «Север» · демо</option><option>Клиент «Линия» · демо</option></select></label><label>${item.id==='print'?'Шаблон печати':'Название'}<input required value="${esc(item.title)} — пример"></label><label class="wide">${item.id==='ai'?'Вопрос помощнику':'Описание / параметры'}<textarea placeholder="Можно попробовать ввод. Данные не отправляются."></textarea></label><button type="submit">Проверить макет</button><p class="form-result wide" role="status"></p></form>`;
 page.innerHTML=`<header class="page-head"><div><p class="eyebrow">${g.title} / ${item.title}</p><h2 tabindex="-1">${item.title}</h2><p>${esc(item.description)}</p></div><span class="demo-label">Демонстрационные данные</span></header>${body}<div class="page-foot">Предпросмотр раздела. Рабочая ВМС не подключена, изменения не сохраняются.</div>`;
 page.querySelector('#search')?.addEventListener('input',e=>{page.querySelector('tbody').innerHTML=tableBody(tableFor(item.id),e.target.value);});
 page.querySelector('form')?.addEventListener('submit',e=>{e.preventDefault();page.querySelector('.form-result').textContent='Макет проверен. Ничего не отправлено и не сохранено.';});
}
nav.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.open){state=transition(state,{type:'open',id:b.dataset.open});renderNav();renderPage();page.querySelector('h2').focus({preventScroll:true});document.querySelector('#announcement').textContent='Открыт раздел '+page.querySelector('h2').textContent;}else if(b.dataset.group){state=transition(state,{type:'group',id:b.dataset.group});renderNav();nav.querySelector(`[data-group="${state.group}"]`).focus({preventScroll:true});}});
document.querySelector('#home').addEventListener('click',()=>{state=transition(state,{type:'home'});renderNav();renderPage();nav.querySelector('button').focus({preventScroll:true});});
document.querySelector('#settings').onclick=()=>document.querySelector('dialog').showModal();document.querySelector('#close-settings').onclick=()=>document.querySelector('dialog').close();
renderNav();
