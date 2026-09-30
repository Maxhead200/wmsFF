import json,difflib,re,sys
from pathlib import Path
r=Path(sys.argv[1]);rows=json.loads((r/'method-deltas.json').read_text(encoding='utf-8')); changes=[]
for f in rows:
 p=r/'candidate-final'/(f['name']+'.js');text=p.read_text(encoding='utf-8');original=text
 for m in f['methods']:
  if not m['before']:
   anchor='    async autoSyncFbsStocksForClient('
   assert text.count(anchor)==1
   text=text.replace(anchor,'    '+m['after']+'\n'+anchor);continue
  match=re.search(r'^    (?:async )?'+re.escape(m['name'])+r'\(',text,re.M)
  if not match: match=re.search(r'^(?:async )?function '+re.escape(m['name'])+r'\(',text,re.M)
  assert match, m['name']
  start_method=match.start();nxt=re.search(r'\n(?:    (?:async )?[A-Za-z_$][\w$]*\(|(?:async )?function )',text[match.end():]);end_method=match.end()+nxt.start() if nxt else len(text)
  method=text[start_method:end_method]
  before=m['before'].splitlines(True);after=m['after'].splitlines(True)
  for group in reversed(list(difflib.SequenceMatcher(None,before,after,autojunk=False).get_grouped_opcodes(1))):
   start=group[0][1];end=group[-1][2];newstart=group[0][3];newend=group[-1][4]
   a=''.join(before[start:end]);b=''.join(after[newstart:newend]);
   if method.count(a)!=1:
    print('ANCHOR FAILURE',f['name'],m['name'],method.count(a),repr(a[:350]));sys.exit(1)
   method=method.replace(a,b)
  text=text[:start_method]+method+text[end_method:]
 text='const receipt_channel_policy_1 = require("../warehouse/receipt-channel-policy");\n'+text
 p.write_text(text,encoding='utf-8');changes.append(f['name']+'.js')
p=r/'candidate-final/modules/warehouse/warehouse.module.js';s=p.read_text(encoding='utf-8');anchor='controllers: [warehouse_controller_1.WarehouseController, storage_locations_controller_1.StorageLocationsController]';assert s.count(anchor)==1;s=s.replace(anchor,anchor[:-1]+', receipt_channels_controller_1.ReceiptChannelsController]');s='const receipt_channels_controller_1 = require("./receipt-channels.controller");\n'+s;p.write_text(s,encoding='utf-8')
print('Patched scoped API methods',changes)


# FIX: only prepend the new catalog entry; retain the deployed registry verbatim.
p=r/'candidate-final/modules/administration/administration-internal-api.service.js'
s=p.read_text(encoding='utf-8');anchor='Object.freeze([';assert s.count(anchor)==1
s=s.replace(anchor,anchor+"\n{ id: 'receipt-channels', name: 'Направления приёмок', prefixes: ['/warehouse/receipt-channels'], routeCount: 4, description: 'Направления ФБС/ФБО по серии коробов.', logic: ['Только ADMIN/OWNER своего филиала.', 'Предпросмотр, версия и аудит.'], dependencies: ['Основная БД', 'Права warehouse:write'] },")
p.write_text(s,encoding='utf-8')
