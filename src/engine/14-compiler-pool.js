class WebGPUShaderCompilerPool {
  constructor(source,onStatus){
    const cores=Math.max(1,Math.floor(navigator.hardwareConcurrency||4)-1);
    const memory=navigator.deviceMemory;
    const memoryLimit=memory?Math.max(1,Math.floor(memory*0.75)):4;
    this.concurrency=Math.min(cores,6,memoryLimit);
    this.onStatus=onStatus;this.queue=[];this.workers=[];this.nextId=0;
    this.memory=new Map();this.inflight=new Map();this.batch=null;this.closed=false;
    this.workerURL=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    this.encoder=new TextEncoder();
    this.version=this.digest(source);
    this.database=this.openDatabase();
    addEventListener('pagehide',()=>this.releaseIdleWorkers());
  }
  async digest(source){
    const bytes=await crypto.subtle.digest('SHA-256',this.encoder.encode(source));
    return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  }
  openDatabase(){
    return new Promise(resolve=>{
      let settled=false;
      const finish=db=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);resolve(db);};
      const timer=setTimeout(()=>finish(null),1500);
      try{
        const request=indexedDB.open('gbufferd-shaders',1);
        request.onupgradeneeded=()=>{const store=request.result.createObjectStore('shaders',{keyPath:'key'});store.createIndex('createdAt','createdAt');};
        request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();finish(request.result);};
        request.onerror=request.onblocked=()=>finish(null);
      }catch{finish(null);}
    });
  }
  async readDisk(key){
    const db=await this.database;if(!db)return null;
    return new Promise(resolve=>{
      const timer=setTimeout(()=>resolve(null),1000);
      const done=value=>{clearTimeout(timer);resolve(value);};
      try{
        const request=db.transaction('shaders','readonly').objectStore('shaders').get(key);
        request.onsuccess=()=>done(request.result?.artifact||null);
        request.onerror=()=>done(null);
      }catch{done(null);}
    });
  }
  valid(artifact){return artifact&&(artifact.kind==='compute'?typeof artifact.compute==='string'&&typeof artifact.computeEntry==='string'&&Array.isArray(artifact.images):typeof artifact.vertex==='string'&&typeof artifact.fragment==='string'&&typeof artifact.vertexEntry==='string'&&typeof artifact.fragmentEntry==='string'&&artifact.kind==='render')&&Array.isArray(artifact.fields)&&Array.isArray(artifact.samplers)&&Array.isArray(artifact.bindings)&&Array.isArray(artifact.attributes)&&Array.isArray(artifact.outputs)&&Number.isInteger(artifact.uniformSize)&&artifact.uniformSize>0;}
  rememberMemory(key,artifact){
    this.memory.delete(key);this.memory.set(key,artifact);
    while(this.memory.size>64)this.memory.delete(this.memory.keys().next().value);
  }
  async remember(key,artifact){
    this.rememberMemory(key,artifact);
    const db=await this.database;if(!db)return;
    try{
      const transaction=db.transaction('shaders','readwrite'),store=transaction.objectStore('shaders');
      store.put({key,artifact,createdAt:Date.now()});
      const count=store.count();
      count.onsuccess=()=>{
        let extra=count.result-128;if(extra<=0)return;
        const cursor=store.index('createdAt').openCursor();
        cursor.onsuccess=()=>{if(cursor.result&&extra-->0){cursor.result.delete();cursor.result.continue();}};
      };
      transaction.onerror=()=>{};
    }catch{}
  }
  async forget(key){
    this.memory.delete(key);const db=await this.database;if(!db)return;
    try{const tx=db.transaction('shaders','readwrite');tx.objectStore('shaders').delete(key);tx.onerror=()=>{};}catch{}
  }
  async translate(vertex,fragment,label,forceFresh=false,job={}){
    const key=(await this.version)+':'+await this.digest(vertex.length+':'+vertex+fragment+'\u0000'+JSON.stringify(job));
    const cached=forceFresh?null:(this.memory.get(key)||await this.readDisk(key));
    if(this.valid(cached)){
      this.rememberMemory(key,cached);if(this.batch)this.batch.cacheHits++;
      this.report('Cache: '+label);return {artifact:cached,key,cached:true};
    }
    let pending=this.inflight.get(key);
    if(!pending){
      pending=new Promise((resolve,reject)=>{
        this.queue.push({id:++this.nextId,vertex,fragment,label,job,resolve,reject});this.dispatch();
      });
      this.inflight.set(key,pending);
      const cleanup=()=>this.inflight.delete(key);pending.then(cleanup,cleanup);
    }else this.report('Gemeinsame Übersetzung: '+label);
    return {artifact:await pending,key,cached:false};
  }
  createWorker(){
    const slot={worker:new Worker(this.workerURL),current:null};
    slot.worker.onmessage=({data})=>{
      const job=slot.current;if(!job||job.id!==data.id)return;
      if(data.progress){this.report(data.progress);return;}
      slot.current=null;
      data.error?job.reject(new Error(data.error)):job.resolve(data.result);
      this.dispatch();this.scheduleRelease();
    };
    slot.worker.onerror=event=>{
      const job=slot.current;slot.current=null;slot.worker.terminate();
      this.workers=this.workers.filter(item=>item!==slot);
      this.concurrency=Math.max(1,Math.min(this.concurrency,this.workers.length+1)-1);
      if(job&&!job.retried){job.retried=true;this.queue.unshift(job);}
      else job?.reject(new Error('WGSL-Compiler: '+event.message));
      this.dispatch();
    };
    this.workers.push(slot);return slot;
  }
  dispatch(){
    clearTimeout(this.idleTimer);
    while(this.queue.length){
      let slot=this.workers.find(item=>!item.current);
      if(!slot&&this.workers.length>=this.concurrency)break;
      if(!slot){try{slot=this.createWorker();}catch(error){this.queue.shift().reject(error);continue;}}
      const job=this.queue.shift();slot.current=job;
      try{slot.worker.postMessage({...job.job,id:job.id,vertex:job.vertex,fragment:job.fragment,label:job.label});}
      catch(error){slot.current=null;job.reject(error);}
      this.report(job.label+' · Übersetzung');
    }
  }
  beginBatch(total){this.batch={total,done:0,cacheHits:0,start:performance.now()};this.report('Shader werden verteilt');}
  programDone(){if(this.batch)this.batch.done++;this.report('Shader-Programme übernehmen');}
  endBatch(){
    const batch=this.batch;this.batch=null;this.scheduleRelease();
    return batch?{...batch,seconds:(performance.now()-batch.start)/1000}:null;
  }
  report(detail){
    const active=this.workers.filter(slot=>slot.current).length;
    if(this.batch){const b=this.batch;this.onStatus(`${b.done}/${b.total} bereit · ${active}/${this.concurrency} Worker · ${b.cacheHits} aus Cache · ${detail} …`);}
    else this.onStatus(detail+' …');
  }
  scheduleRelease(){
    if(!this.queue.length&&!this.workers.some(slot=>slot.current)){
      clearTimeout(this.idleTimer);this.idleTimer=setTimeout(()=>this.releaseIdleWorkers(),30000);
    }
  }
  releaseIdleWorkers(){
    this.workers=this.workers.filter(slot=>{if(slot.current)return true;slot.worker.terminate();return false;});
  }
}

