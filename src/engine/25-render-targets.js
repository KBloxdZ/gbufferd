    const RENDER_TARGET_LEGACY={gcolor:0,gdepth:1,gnormal:2,composite:3,gaux1:4,gaux2:5,gaux3:6,gaux4:7};
    let packRenderTargets=[],nextRenderTargets=[];
    let colortexCount=9;
    function colortexCountFor(sources){
      let highest=8;
      for(const source of sources){
        for(const [,index] of source.matchAll(/\bcolortex(\d+)\b/g))highest=Math.max(highest,Number(index));
        for(const [,list] of source.matchAll(/\/\*\s*RENDERTARGETS\s*:\s*([\d,\s]+?)\s*\*\//g))
          for(const value of list.split(','))highest=Math.max(highest,Number(value.trim())||0);
      }
      return Math.min(32,highest+1);
    }
    const renderTargetIndex=name=>{
      const numbered=name.match(/^colortex(\d+)$/);
      if(numbered)return Number(numbered[1]);
      return Object.hasOwn(RENDER_TARGET_LEGACY,name)?RENDER_TARGET_LEGACY[name]:-1;
    };
    function packFormatCandidate(name){
      const entry={
        R:[gl.R8,gl.RED,gl.UNSIGNED_BYTE],RG:[gl.RG8,gl.RG,gl.UNSIGNED_BYTE],
        RGB:[gl.RGB8,gl.RGB,gl.UNSIGNED_BYTE],RGBA:[gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE],
        R8:[gl.R8,gl.RED,gl.UNSIGNED_BYTE],RG8:[gl.RG8,gl.RG,gl.UNSIGNED_BYTE],
        RGB8:[gl.RGB8,gl.RGB,gl.UNSIGNED_BYTE],RGBA8:[gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE],
        R8_SNORM:[gl.R8_SNORM,gl.RED,gl.BYTE],RG8_SNORM:[gl.RG8_SNORM,gl.RG,gl.BYTE],
        RGB8_SNORM:[gl.RGB8_SNORM,gl.RGB,gl.BYTE],RGBA8_SNORM:[gl.RGBA8_SNORM,gl.RGBA,gl.BYTE],
        R16F:[gl.R16F,gl.RED,gl.HALF_FLOAT],RG16F:[gl.RG16F,gl.RG,gl.HALF_FLOAT],
        RGB16F:[gl.RGB16F,gl.RGB,gl.HALF_FLOAT],RGBA16F:[gl.RGBA16F,gl.RGBA,gl.HALF_FLOAT],
        R32F:[gl.R32F,gl.RED,gl.FLOAT],RG32F:[gl.RG32F,gl.RG,gl.FLOAT],
        RGB32F:[gl.RGB32F,gl.RGB,gl.FLOAT],RGBA32F:[gl.RGBA32F,gl.RGBA,gl.FLOAT],
        R11F_G11F_B10F:[gl.R11F_G11F_B10F,gl.RGB,gl.UNSIGNED_INT_10F_11F_11F_REV],
        RGB10_A2:[gl.RGB10_A2,gl.RGBA,gl.UNSIGNED_INT_2_10_10_10_REV],
        R3_G3_B2:[gl.RGB8,gl.RGB,gl.UNSIGNED_BYTE],RGB4:[gl.RGB8,gl.RGB,gl.UNSIGNED_BYTE],
        RGB5:[gl.RGB8,gl.RGB,gl.UNSIGNED_BYTE],RGB565:[gl.RGB8,gl.RGB,gl.UNSIGNED_BYTE],RGBA2:[gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE],
        RGBA4:[gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE],RGB5_A1:[gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE],
        RGB9_E5:[gl.RGB16F,gl.RGB,gl.HALF_FLOAT],
        R16_SNORM:[gl.R32F,gl.RED,gl.FLOAT],RG16_SNORM:[gl.RG32F,gl.RG,gl.FLOAT],
        RGB16_SNORM:[gl.RGBA32F,gl.RGBA,gl.FLOAT],RGBA16_SNORM:[gl.RGBA32F,gl.RGBA,gl.FLOAT],
        R16:[gl.R16,gl.RED,gl.UNSIGNED_SHORT],
        RG16:[gl.RG16,gl.RG,gl.UNSIGNED_SHORT],
        RGB16:[gl.RGB16,gl.RGB,gl.UNSIGNED_SHORT],
        RGBA16:[gl.RGBA16,gl.RGBA,gl.UNSIGNED_SHORT],
        R8UI:[gl.R8UI,gl.RED_INTEGER,gl.UNSIGNED_BYTE],R16UI:[gl.R16UI,gl.RED_INTEGER,gl.UNSIGNED_SHORT],R32UI:[gl.R32UI,gl.RED_INTEGER,gl.UNSIGNED_INT],
        RG8UI:[gl.RG8UI,gl.RG_INTEGER,gl.UNSIGNED_BYTE],RG16UI:[gl.RG16UI,gl.RG_INTEGER,gl.UNSIGNED_SHORT],RG32UI:[gl.RG32UI,gl.RG_INTEGER,gl.UNSIGNED_INT],
        RGB8UI:[gl.RGB8UI,gl.RGB_INTEGER,gl.UNSIGNED_BYTE],RGB16UI:[gl.RGB16UI,gl.RGB_INTEGER,gl.UNSIGNED_SHORT],RGB32UI:[gl.RGB32UI,gl.RGB_INTEGER,gl.UNSIGNED_INT],
        RGBA8UI:[gl.RGBA8UI,gl.RGBA_INTEGER,gl.UNSIGNED_BYTE],RGBA16UI:[gl.RGBA16UI,gl.RGBA_INTEGER,gl.UNSIGNED_SHORT],RGBA32UI:[gl.RGBA32UI,gl.RGBA_INTEGER,gl.UNSIGNED_INT],
        R8I:[gl.R8I,gl.RED_INTEGER,gl.BYTE],R16I:[gl.R16I,gl.RED_INTEGER,gl.INT],R32I:[gl.R32I,gl.RED_INTEGER,gl.INT],
        RG8I:[gl.RG8I,gl.RG_INTEGER,gl.BYTE],RG16I:[gl.RG16I,gl.RG_INTEGER,gl.INT],RG32I:[gl.RG32I,gl.RG_INTEGER,gl.INT],
        RGB8I:[gl.RGB8I,gl.RGB_INTEGER,gl.BYTE],RGB16I:[gl.RGB16I,gl.RGB_INTEGER,gl.INT],RGB32I:[gl.RGB32I,gl.RGB_INTEGER,gl.INT],
        RGBA8I:[gl.RGBA8I,gl.RGBA_INTEGER,gl.BYTE],RGBA16I:[gl.RGBA16I,gl.RGBA_INTEGER,gl.INT],RGBA32I:[gl.RGBA32I,gl.RGBA_INTEGER,gl.INT]
      }[String(name).toUpperCase()];
      if(!entry)return null;
      const approximate=/^(?:R|RG|RGB|RGBA)16$/.test(String(name).toUpperCase())&&!norm16Exact();
      return {internal:entry[0],format:entry[1],type:entry[2],label:String(name).toUpperCase()+(approximate?' → 32F (16-Bit-Daten erhalten)':'')};
    }
    function collectRenderTargetDirectives(source,into){
      const code=String(source);
      const at=index=>(into[index]??={});
      for(const [,name,value] of code.matchAll(/\bconst\s+int\s+(\w+)Format\s*=\s*(\w+)\s*;/g)){
        const index=renderTargetIndex(name);if(index>=0)at(index).format=value;
      }
      for(const [,name,value] of code.matchAll(/\bconst\s+bool\s+(\w+)Clear\s*=\s*(true|false)\s*;/g)){
        const index=renderTargetIndex(name);if(index>=0)at(index).clear=value==='true';
      }
      for(const [,name,value] of code.matchAll(/\bconst\s+vec4\s+(\w+)ClearColor\s*=\s*vec4\s*\(([^)]*)\)\s*;/g)){
        const index=renderTargetIndex(name);if(index<0)continue;
        const parts=value.split(',').map(part=>Number(part.trim())).filter(Number.isFinite);
        if(parts.length===1)at(index).clearColor=[parts[0],parts[0],parts[0],parts[0]];
        else if(parts.length===4)at(index).clearColor=parts;
      }
    }
    async function readShaderSources(zip){
      const binary=/\.(?:png|jpe?g|gif|bmp|tga|dds|ktx|ogg|wav|mp3|zip|jar|ttf|otf|ico|webp|bin|exe|dll)$/i;
      const sources=[];
      for(const path of Object.keys(zip.files)){
        if(zip.files[path].dir||!/(?:^|\/)shaders\//.test(path)||binary.test(path))continue;
        try{sources.push(await zip.file(path).async('string'));}catch(error){}
      }
      return sources;
    }
    async function readRenderTargetDirectives(zip){
      const binary=/\.(?:png|jpe?g|gif|bmp|tga|dds|ktx|ogg|wav|mp3|zip|jar|ttf|otf|ico|webp|bin|exe|dll)$/i;
      const found=[];
      for(const path of Object.keys(zip.files)){
        if(zip.files[path].dir||!/(?:^|\/)shaders\//.test(path)||binary.test(path))continue;
        try{collectRenderTargetDirectives(await zip.file(path).async('string'),found);}catch(error){}
      }
      return found;
    }
    function renderTargetClearColor(logical){
      const declared=packRenderTargets[logical]?.clearColor;
      if(declared)return declared;
      return logical===0?[...FOG_COLOR,1]:logical===1?[1,1,1,1]:[0,0,0,0];
    }
    function applyRenderTargetDirectives(next){
      const formats=list=>(list||[]).map(entry=>entry&&entry.format||'').join(',');
      const changed=formats(next)!==formats(packRenderTargets);
      packRenderTargets=next||[];
      if(changed)createFramebuffer();
    }
    function clearPackRenderTargets(){
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,null);
      const wanted=[];
      for(let logical=0;logical<colortexCurrent.length;logical++)
        if(packRenderTargets[logical]?.clear!==false)wanted.push(logical);
      if(!wanted.length)return;
      for(const textures of [colortexCurrent,colortexSpare]){
        for(let start=0;start<wanted.length;start+=maxColorAttachments){
          const batch=wanted.slice(start,start+maxColorAttachments);
          for(let slot=0;slot<maxColorAttachments;slot++)
            gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+slot,gl.TEXTURE_2D,
              slot<batch.length?textures[batch[slot]]:null,0);
          gl.drawBuffers(batch.map((_,slot)=>gl.COLOR_ATTACHMENT0+slot));
          batch.forEach((logical,slot)=>gl.clearBufferfv(gl.COLOR,slot,new Float32Array(renderTargetClearColor(logical))));
        }
      }
      for(let slot=0;slot<maxColorAttachments;slot++)
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+slot,gl.TEXTURE_2D,null,0);
    }
    function formatCandidates(logical) {
      const rgba16={internal:gl.RGBA16F,format:gl.RGBA,type:gl.HALF_FLOAT,label:'RGBA16F'};
      const declared=packRenderTargets[logical]?.format&&packFormatCandidate(packRenderTargets[logical].format);
      if(declared)return[declared,...formatFallbacks(logical,rgba16)];
      return formatFallbacks(logical,rgba16);
    }
    function formatFallbacks(logical,rgba16) {
      return[{internal:gl.RGBA8,format:gl.RGBA,type:gl.UNSIGNED_BYTE,label:'RGBA8 (Iris default)'}];
    }

    function renderTextureIsComplete(texture) {
      const probe=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,probe);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      const complete=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
      gl.deleteFramebuffer(probe);return complete;
    }

    let colortexSizes=new Map();
    function colortexSizesFor(properties){
      const sizes=new Map();
      for(const [key,value] of Object.entries(properties||{})){
        const match=/^size\.buffer\.(?:colortex(\d+)|(\w+))$/.exec(String(key).trim());
        if(!match)continue;
        const logical=match[1]!==undefined?Number(match[1]):RENDER_TARGET_LEGACY[match[2]];
        if(!Number.isInteger(logical)||logical<0)continue;
        const parts=String(value).trim().split(/\s+/);
        if(parts.length<2)continue;
        const read=text=>({absolute:/^\d+$/.test(text),value:Number(text)});
        const entry=[read(parts[0]),read(parts[1])];
        if(entry.some(part=>!Number.isFinite(part.value)||part.value<=0))continue;
        sizes.set(logical,entry);
      }
      return sizes;
    }
    function colortexSize(logical){
      const entry=colortexSizes.get(logical);
      if(!entry)return [width,height];
      return [Math.max(1,entry[0].absolute?entry[0].value:Math.floor(width*entry[0].value)),
              Math.max(1,entry[1].absolute?entry[1].value:Math.floor(height*entry[1].value))];
    }
    const sameSizes=(a,b)=>a.size===b.size&&[...a].every(([logical,entry])=>{
      const other=b.get(logical);
      return other&&other[0].absolute===entry[0].absolute&&other[0].value===entry[0].value
        &&other[1].absolute===entry[1].absolute&&other[1].value===entry[1].value;
    });
    let colortexStorageTargets=new Set();
    function colorImageTargetsFor(sources){
      const found=new Set();
      for(const source of sources)for(const [,index] of source.matchAll(/\bcolorimg(\d+)\b/g))found.add(Number(index));
      return found;
    }
    const sameTargets=(a,b)=>a.size===b.size&&[...a].every(value=>b.has(value));
    function createRenderTexture(logical) {
      gl.storageColorTarget=colortexStorageTargets.has(logical);
      try{
      for(const candidate of formatCandidates(logical)){
        while(gl.getError()!==gl.NO_ERROR){}
        const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
        const [textureWidth,textureHeight]=colortexSize(logical);
        gl.texImage2D(gl.TEXTURE_2D,0,candidate.internal,textureWidth,textureHeight,0,candidate.format,candidate.type,null);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        if(gl.getError()===gl.NO_ERROR&&renderTextureIsComplete(texture)){
          if(!colortexFormatLabels[logical]){
            const actual=gl.textureFormat?.(candidate.internal);
            const wanted=candidate.label.replace(/ →.*$/,'');
            colortexFormatLabels[logical]=actual&&actual.toLowerCase()!==wanted.toLowerCase().replace(/_/g,'')
              ?wanted+' → '+actual:candidate.label;
          }
          return texture;
        }
        gl.deleteTexture(texture);
      }
      throw new Error(`colortex${logical} hat kein kompatibles WebGPU-Format.`);
      }finally{gl.storageColorTarget=false;}
    }

    function createDepthTexture(sizeX,sizeY) {
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,sizeX,sizeY,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.NONE);return texture;
    }

    function resetColortexState() {
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,null);
      for(let index=0;index<maxColorAttachments;index++)gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+index,gl.TEXTURE_2D,null,0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      for(const textures of [colortexCurrent,colortexSpare])for(let logical=0;logical<textures.length;logical++){
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,textures[logical],0);
        gl.clearBufferfv(gl.COLOR,0,new Float32Array(sceneClearColor(logical)));
      }
      temporalHistoryValid=false;renderedFrameCounter=0;gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }

    function createFramebuffer() {
      [...colortexCurrent,...colortexSpare,...sceneDepthTextures].forEach(t=>t&&gl.deleteTexture(t));colortexCurrent=[];colortexSpare=[];sceneDepthTextures=[];
      if(framebuffer)gl.deleteFramebuffer(framebuffer);if(depthCopyFramebuffer)gl.deleteFramebuffer(depthCopyFramebuffer);if(sceneDepthAttachment)gl.deleteRenderbuffer(sceneDepthAttachment);
      framebuffer=gl.createFramebuffer();depthCopyFramebuffer=gl.createFramebuffer();colortexFormatLabels.length=0;
      for(let i=0;i<colortexCount;i++){colortexCurrent.push(createRenderTexture(i));colortexSpare.push(createRenderTexture(i));}
      gl.setColorImageTargets(colortexCurrent);
      sceneDepthAttachment=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,sceneDepthAttachment);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,width,height);
      sceneDepthTextures=[createDepthTexture(width,height),createDepthTexture(width,height),createDepthTexture(width,height)];
      attachColorTargets([0],colortexCurrent,true);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('G-Buffer ist nicht vollständig.');
      resetColortexState();clearDepthSnapshots(sceneDepthTextures,width,height,depthCopyFramebuffer);
      console.info('colortex-Formate:\n'+colortexFormatLabels.map((label,i)=>'  colortex'+i+': '+label).join('\n'));
    }

    function shadowSetting(index,suffix){
      return activeRenderConstants['shadowcolor'+index+suffix]
        ??activeRenderConstants['shadowColor'+index+suffix]
        ??packShadowTargets[index]?.[{Format:'format',Clear:'clear',ClearColor:'clearColor'}[suffix]];
    }
    function attachShadowTargets(targets,textures,depth){
      gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFramebuffer);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth?shadowDepthAttachment:null);
      for(let slot=0;slot<maxColorAttachments;slot++)
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+slot,gl.TEXTURE_2D,slot<targets.length?textures[targets[slot]]:null,0);
      gl.drawBuffers(targets.map((_,slot)=>gl.COLOR_ATTACHMENT0+slot));
    }
    function clearShadowBuffers(initial=false){
      for(const textures of [shadowColorTextures,shadowColorSpare]){
        const targets=textures.map((_,i)=>i).filter(i=>initial||shadowSetting(i,'Clear')!==false);
        for(let first=0;first<targets.length;first+=maxColorAttachments){
          const batch=targets.slice(first,first+maxColorAttachments);attachShadowTargets(batch,textures,false);
          batch.forEach((logical,slot)=>gl.clearBufferfv(gl.COLOR,slot,new Float32Array(shadowSetting(logical,'ClearColor')||[1,1,1,1])));
        }
      }
      attachShadowTargets([],shadowColorTextures,true);gl.clearBufferfv(gl.DEPTH,0,new Float32Array([1]));
    }
    function createShadowFramebuffer(){
      for(const t of [...shadowColorTextures,...shadowColorSpare,...shadowDepthTextures])gl.deleteTexture(t);
      shadowColorTextures=[];shadowColorSpare=[];shadowDepthTextures=[];
      if(shadowFramebuffer)gl.deleteFramebuffer(shadowFramebuffer);if(shadowDepthCopyFramebuffer)gl.deleteFramebuffer(shadowDepthCopyFramebuffer);if(shadowDepthAttachment)gl.deleteRenderbuffer(shadowDepthAttachment);
      const count=Math.max(2,packShadowTargets.length,...Object.keys(activeRenderConstants).map(name=>Number(name.match(/^shadowcolor(\d+)/)?.[1]??-1)+1),...Array.from(shadowStorageTargets,i=>i+1),...[...gbufferPrograms.values(),...pipelinePrograms.values(),...computePrograms.values()].flatMap(program=>(program.activeSamplers||[]).map(sampler=>Number(sampler.name.match(/^shadowcolor(\d+)$/)?.[1]??-1)+1)),...[...pipelinePrograms].filter(([name])=>name==='shadow'||name.startsWith('shadowcomp')).flatMap(([name])=>(activePassTargets[name]||[]).map(i=>i+1)));
      if(count>8)throw new Error('shadowcolor'+(count-1)+': Iris unterstützt maximal acht Shadow-Farbpuffer.');
      const size=SHADOW_RESOLUTION;
      if(!Number.isInteger(size)||size<1||size>gl.device.limits.maxTextureDimension2D)throw new Error('Ungültige shadowMapResolution: '+size);
      shadowFramebuffer=gl.createFramebuffer();shadowDepthCopyFramebuffer=gl.createFramebuffer();
      for(let i=0;i<count;i++){
        const format=shadowSetting(i,'Format')||'RGBA',candidate=packFormatCandidate(format);
        if(!candidate)throw new Error('shadowcolor'+i+'Format: '+format+' noch nicht unterstützt.');
        for(const textures of [shadowColorTextures,shadowColorSpare]){
          const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
          gl.storageColorTarget=shadowStorageTargets.has(i);
          try{gl.texImage2D(gl.TEXTURE_2D,0,candidate.internal,size,size,0,candidate.format,candidate.type,null);}finally{gl.storageColorTarget=false;}
          const nearest=shadowSetting(i,'Nearest')??activeRenderConstants['shadowColor'+i+'MinMagNearest']??false;
          const filter=nearest||!gl.filterableFormat(texture.format)?gl.NEAREST:gl.LINEAR;
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
          textures.push(texture);
        }
      }
      gl.setShadowImageTargets(shadowColorTextures);
      shadowDepthAttachment=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,shadowDepthAttachment);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,size,size);
      shadowDepthTextures=[createDepthTexture(size,size),createDepthTexture(size,size)];
      if(shadowCompareSampler)gl.deleteSampler(shadowCompareSampler);if(shadowRawSampler)gl.deleteSampler(shadowRawSampler);
      shadowCompareSampler=gl.createSampler();gl.samplerParameteri(shadowCompareSampler,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.samplerParameteri(shadowCompareSampler,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.samplerParameteri(shadowCompareSampler,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.samplerParameteri(shadowCompareSampler,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.samplerParameteri(shadowCompareSampler,gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE);gl.samplerParameteri(shadowCompareSampler,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);
      shadowRawSampler=gl.createSampler();gl.samplerParameteri(shadowRawSampler,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.samplerParameteri(shadowRawSampler,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.samplerParameteri(shadowRawSampler,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.samplerParameteri(shadowRawSampler,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.samplerParameteri(shadowRawSampler,gl.TEXTURE_COMPARE_MODE,gl.NONE);
      clearShadowBuffers(true);clearDepthSnapshots(shadowDepthTextures,size,size,shadowDepthCopyFramebuffer);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }
    function generateShadowColorMipmaps(){
      for(let i=0;i<shadowColorTextures.length;i++){
        const requested=shadowSetting(i,'Mipmap')??activeRenderConstants.generateShadowColorMipmap;
        if(requested!==true&&requested!=='true'&&requested!==1)continue;
        const texture=shadowColorTextures[i],nearest=texture.params.get(gl.TEXTURE_MAG_FILTER)===gl.NEAREST;
        gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,nearest?gl.NEAREST_MIPMAP_NEAREST:gl.LINEAR_MIPMAP_LINEAR);gl.generateMipmap(gl.TEXTURE_2D);
      }
    }
    function runShadowComposite(name,eye,now){
      if(gl.viewerDisabledPrograms?.has(pipelinePrograms.get(name)))return true;
      const program=pipelinePrograms.get(name),targets=activePassTargets[name]||[0];if(!program)return true;
      for(let i=0;i<shadowColorTextures.length;i++)if([true,'true',1].includes(program.constants?.['colortex'+i+'MipmapEnabled'])){
        gl.bindTexture(gl.TEXTURE_2D,shadowColorTextures[i]);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.generateMipmap(gl.TEXTURE_2D);
      }
      attachShadowTargets(targets,shadowColorSpare,false);gl.viewport(...irisViewport(activePackProperties,name,SHADOW_RESOLUTION,SHADOW_RESOLUTION));
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.depthMask(false);applyPackBlend(name,targets);
      gl.useProgram(program);setUniforms(program,identityMatrix,fullscreenProjectionMatrix,eye,now);gl.bindVertexArray(screenVao);
      gl.drawElements(gl.TRIANGLES,screenIndexCount,gl.UNSIGNED_SHORT,0);
      if(gl.getError()!==gl.NO_ERROR)return false;
      for(const index of flipTargetsFor(name,targets)){
        if(!shadowColorTextures[index])throw new Error(name+': ungültiger Shadow-Puffer '+index);
        [shadowColorTextures[index],shadowColorSpare[index]]=[shadowColorSpare[index],shadowColorTextures[index]];
      }
      return true;
    }

    function resize() {
      const dpr=Math.min(devicePixelRatio||1,1)*(GB.state.active?GB.hooks.resolutionScale():1);
      const w=GB.hooks.canvasSize()?.[0]??Math.max(1,Math.round(canvas.clientWidth*dpr));
      const h=GB.hooks.canvasSize()?.[1]??Math.max(1,Math.round(canvas.clientHeight*dpr));
      if(w===width&&h===height)return;
      width=canvas.width=w; height=canvas.height=h; createFramebuffer();gl.resizePackResources?.(w,h);irisSetupPending=true;
    }

