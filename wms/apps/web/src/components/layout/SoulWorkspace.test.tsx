import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {SoulWorkspace,soulEnabled,soulGroups} from './SoulWorkspace';
const groups=[{id:'main',title:'Главное',items:[{id:'overview',title:'Обзор'}]},{id:'client',title:'Клиентский контур',items:[{id:'fbs',title:'FBS'}]},{id:'operations',title:'Склад и операции',items:[]}];
// TEST: Soul consumes permission-filtered groups; never invents hidden workspaces.
describe('Soul live navigation',()=>{
 it('keeps only accessible non-overview entries',()=>{expect(soulGroups(groups).map(g=>g.items.map(i=>i.id))).toEqual([['fbs']]);});
 it('is restricted to our environment and local preview',()=>{expect(soulEnabled('wms.logoff.pro')).toBe(true);expect(soulEnabled('127.0.0.1')).toBe(true);expect(soulEnabled('sold.logoff.pro')).toBe(false);expect(soulEnabled('wms.logoff.pro.evil.test')).toBe(false);});
 it('renders the existing page unchanged and marks its navigation',()=>{const html=renderToStaticMarkup(<SoulWorkspace groups={groups} activeId="fbs" onOpen={()=>{}}><div data-real-page>Real order page</div></SoulWorkspace>);expect(html).toContain('Real order page');expect(html).toContain('aria-current="page"');expect(html).not.toContain('data-soul-open="billing"');});
 it('shows the group grid on overview, without mounting its old dashboard',()=>{const html=renderToStaticMarkup(<SoulWorkspace groups={groups} activeId="overview" onOpen={()=>{}}><div>OLD DASHBOARD</div></SoulWorkspace>);expect(html).toContain('soul-home-grid');expect(html).not.toContain('OLD DASHBOARD');});
});
