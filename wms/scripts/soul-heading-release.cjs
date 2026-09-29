// FIX: change exactly one heading in the verified published entry.
const {createHash}=require('node:crypto'),{build}=require('./soul-release.cjs');
const PIN='f1ff8a4791971c90637ad12d85c665e996611bd5e9befadc710b8f5d29bc4724';
const before=String.raw`__SoulReact.createElement("h1",null,"\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0421\u043A\u043B\u0430\u0434\u043E\u043C")`;
const after='__SoulReact.createElement("h1",null,"WMS LOGOff")';
function patch(source){if(createHash('sha256').update(source).digest('hex')!==PIN)throw Error('Entry drift');if(source.split(before).length!==2)throw Error('Heading marker mismatch');return source.replace(before,after);}
module.exports={patch,before,after};
if(require.main===module)build(process.argv[2],patch,'soul-heading-20260929').catch(e=>{console.error(e);process.exitCode=1;});
