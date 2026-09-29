// FIX: count concurrent requests; retain the native response and rejection unchanged.
export function installNetworkLoading(target: Window = window) {
  const key='__wmsNetworkLoadingInstalled';
  if((target as unknown as Record<string,unknown>)[key])return;
  (target as unknown as Record<string,unknown>)[key]=true;
  const original=target.fetch;let pending=0;
  const publish=()=>{target.document.documentElement.toggleAttribute('data-network-loading',pending>0);};
  function track<T>(action:()=>Promise<T>) {
    pending++;publish();
    try {return action().finally(()=>{pending--;publish();});}
    catch(error){pending--;publish();throw error;}
  }
  target.fetch=function(...args: Parameters<typeof fetch>) {
    return track(()=>original.apply(this,args)).then(response=>{
      // FIX: headers may arrive before a slow JSON or downloaded document body.
      for(const method of ['json','text','blob','arrayBuffer','formData'] as const) {
        const read=response[method];
        if(typeof read==='function') Object.defineProperty(response,method,{configurable:true,value:()=>track(()=>read.call(response))});
      }
      return response;
    });
  };
}
