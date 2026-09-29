// FIX: patch only the verified archive predicate; preserve all other production logic.
const fs=require('node:fs'),crypto=require('node:crypto');
const file=process.argv[2],expected=process.argv[3];
const source=fs.readFileSync(file,'utf8');
if(crypto.createHash('sha256').update(source).digest('hex')!==expected)throw Error('Runtime drift');
const from='[client_1.ClientRequestStatus.DONE, client_1.ClientRequestStatus.CANCELLED]';
if(source.split(from).length!==3)throw Error('Archive markers changed');
fs.writeFileSync(file,source.replaceAll(from,from.slice(0,-1)+', client_1.ClientRequestStatus.REJECTED]'));
