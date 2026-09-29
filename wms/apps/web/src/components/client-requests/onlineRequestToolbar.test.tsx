import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {onlineRequestToolbar,groupRuntimeOnlineMenu} from './onlineRequestToolbar';
import {canEditRequest,canCancelRequest} from './ClientRequestsTable';
const children=['Короба WMS','Короба Excel','Состав Excel'].map(label=><button className="client-request-action-button" onClick={()=>{}}>{label}</button>);
// TEST: all original callbacks are retained, documents are collapsed, permissions remain optional.
it('groups three original actions and keeps downloads distinct',()=>{
 const html=renderToStaticMarkup(onlineRequestToolbar(children));expect(html).toContain('<summary>Документы</summary>');expect(html).toContain('Короба WMS');expect(html).toContain('Короба на отправку XLSX');expect(html).toContain('Содержимое коробов XLSX');expect(html).not.toContain('Действия с заявкой');expect(html).not.toContain(' open');
});
it('retains exact document and request callbacks',()=>{const edit=vi.fn(),cancel=vi.fn();const tree=onlineRequestToolbar(children,edit,cancel);const nodes=tree.props.children;expect(nodes[0].props.children[1].props.children[0]).toBe(children[0]);const actions=nodes[1].props.children[1].props.children;actions[0].props.onClick();actions[1].props.onClick();expect(edit).toHaveBeenCalledOnce();expect(cancel).toHaveBeenCalledOnce();});
it('limits cancellation to existing statuses and editing to its original role rule',()=>{for(const status of ['IN_WORK','PACKED','DONE','CANCELLED','REJECTED']){expect(canCancelRequest({type:'OUTBOUND',status} as any)).toBe(false);expect(canEditRequest({status} as any,false)).toBe(false);}expect(canCancelRequest({type:'OUTBOUND',status:'SUBMITTED'} as any)).toBe(true);expect(canEditRequest({status:'IN_WORK'} as any,true)).toBe(true);});
it('changes only online toolbar and preserves assembly body',()=>{const body=<p>Original assembly</p>;const original=<section><div className="online-execution-modal__actions">{children}</div>{body}</section>;const html=renderToStaticMarkup(groupRuntimeOnlineMenu(original));expect(html).toContain('Original assembly');expect(html).toContain('Документы');});
