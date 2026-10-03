// FIX: a cancelled pick that never shipped has no shipment timestamp to return after.
async function unfinishedCancelledProof(tx, clientId, identity, links, requests, evidence) {
 if (!links.length || links.some(t => t.status !== 'RELEASED' || t.completedAt || !requests.some(r => r.id === t.requestId))) return null;
 if (evidence.orders.some(o => !links.some(t => t.orderId === o.orderId) || (o.verified && !(o.supplierStatus === 'cancel' && cancelledWithoutSale(o.wbStatus))))) return null;
 const prefixes = kiz_sorting_return_proof_2.manualKizPrefixes(identity);
 const history = await tx.shippedKizHistory.findMany({where:{clientId,OR:prefixes.map(p=>({kiz:{startsWith:p}}))}});
 if (history.some(h=>kiz_sorting_return_proof_2.manualKizIdentity(h.kiz)===identity)) return null;
 for (const t of links) {
  const cancellation=await tx.fbsOrderRequestLink.findFirst({where:{clientId,connectionId:t.connectionId,orderId:t.orderId,requestId:t.requestId,syncStatus:'REMOVED',lastSupplierStatus:'cancel',lastWbStatus:{in:['canceled','canceled_by_client','declined_by_client']},handedOverAt:null}});
  if (!cancellation) return null;
 }
 const marks=(await tx.productMark.findMany({where:{clientId,OR:prefixes.map(p=>({value:{startsWith:p}}))}})).filter(m=>kiz_sorting_return_proof_2.manualKizIdentity(m.value)===identity);
 if(marks.length!==1||marks[0].status!=='AVAILABLE'||!marks[0].boxId)return null;
 const mark=marks[0],after=new Date(Math.max(...links.map(t=>new Date(t.updatedAt).getTime())));
 if(!Number.isFinite(after.getTime()))return null;
 const audit=await tx.auditLog.findFirst({where:{action:{in:['PALLET_SORTING_UNIT_MOVED','PALLET_SORTING_UNIT_RECOVERED']},entity:'PalletSortingSession',createdAt:{gt:after},AND:[{payload:{path:['identity'],equals:identity}},{payload:{path:['markId'],equals:mark.id}},{payload:{path:['targetBoxId'],equals:mark.boxId}}]},orderBy:{createdAt:'desc'}});
 const proof=audit?.payload;
 if(!audit?.userId||!proof||proof.physicalTruth!==true||proof.quantity!==1||proof.targetClientId!==clientId||proof.skuId!==mark.skuId||typeof proof.movementId!=='string')return null;
 const movement=await tx.stockMovement.findFirst({where:{id:proof.movementId,clientId,skuId:mark.skuId,boxId:mark.boxId,warehouseId:String(proof.targetWarehouseId),status:'AVAILABLE',quantity:{gt:0},createdAt:{gt:after}}});
 return movement?{auditId:audit.id,movementId:movement.id,markId:mark.id,boxId:mark.boxId,sortedAt:audit.createdAt,releasedBefore:after}:null;
}
