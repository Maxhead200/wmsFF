import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {ClientRequestsTable} from './ClientRequestsTable';
const noop=()=>{};
function render(fbs=false, overrides:Record<string,unknown>={}) {
 const request={id:'r',number:1550,type:'OUTBOUND',status:'SUBMITTED',priority:'NORMAL',title:fbs?'FBS — 3 заказа':'ФБО Никольское',client:{id:'c',code:'CL-000001',name:'Тест'},clientId:'c',createdAt:'2026-09-29T09:00:00Z',items:[{id:'i',quantity:2}],packages:[],files:[]};
 const props:any={items:[request],modernActions:true,canManageRequestRecovery:true,canChangeStatus:true,canPickOutbound:true,canCancelRequests:true,canEditAnyRequest:true,canRefreshPickInstruction:true};
 for(const key of ['onStatusChange','onCancelRequest','onEditRequest','onOpenOnlineExecution','onOpenFbsOrders','onOpenFbsRoute','onSelectManualBoxes','onOpenFbsBoxSearch','onOpenPickInstruction','onRefreshPickInstruction','onSyncTsd','onCheckSupplyConsistency','onDownloadPickInstruction','onUploadManualInstruction','onEmergencyPackedXlsx','onPickOutbound','onPackageOutbound','onShipOutbound'])props[key]=noop;
 return renderToStaticMarkup(<ClientRequestsTable {...props} {...overrides}/>);
}
// TEST: obsolete standalone actions collapse into explicit documents/recovery groups.
it('groups FBO actions without duplicate online and legacy primary controls',()=>{
 const html=render();expect(html).toContain('Открыть сборку');expect(html).toContain('Обновить план');expect(html).toContain('<summary>Документы</summary>');expect(html).toContain('<summary>Ещё</summary>');expect(html).toContain('<summary>Администрирование</summary>');expect(html).toContain('Аварийная упаковка из Excel');expect(html).not.toContain('>В ТСД<');expect(html).not.toContain('>Онлайн<');expect(html).not.toContain('>Короба XLSX<');
 expect(html.match(/title="Редактировать заявку"/g)).toHaveLength(1);expect(html).toContain('>Редактировать заявку<');expect(html).toContain('>Отменить заявку<');
});
// TEST: navigation has one route and preserves the distinct orders link.
it('keeps FBS navigation distinct and route unique',()=>{const html=render(true);expect(html.match(/>Маршрут</g)).toHaveLength(1);expect(html).toContain('К заказам FBS');expect(html).toContain('Остатки и короба');expect(html).toContain('Проверить задания и маршруты');expect(html).toContain('Синхронизировать задания');});
// TEST: permission and sold/legacy opt-out boundaries.
it('does not expose recovery to nonadministrators',()=>{const html=render(false,{canManageRequestRecovery:false});expect(html).not.toContain('Аварийная упаковка из Excel');expect(html).not.toContain('Своя инструкция');});
it('preserves legacy controls when modern workflow is disabled',()=>{const html=render(false,{modernActions:false});expect(html).toContain('>В ТСД<');expect(html).toContain('>Собрать<');expect(html).not.toContain('<summary>Ещё</summary>');});
