    let activeCustomTextures=null;
    const CUSTOM_TEXTURE_STAGES=['setup','begin','shadowcomp','prepare','gbuffers','deferred','composite','final','shadow'];
    const customSamplerName=name=>name==='noise'?'noisetex':name;
    function customTextureStage(pass){
      if(/^(?:clrwl_)?gbuffers/.test(pass))return 'gbuffers';
      if(/^deferred/.test(pass))return 'deferred';
      if(/^shadowcomp/.test(pass))return 'shadowcomp';
      if(/^begin/.test(pass))return 'begin';
      if(/^(?:clrwl_)?shadow/.test(pass))return 'shadow';
      if(pass==='final')return 'final';
      if(/^composite/.test(pass))return 'composite';
      if(/^prepare/.test(pass))return 'prepare';
      if(/^setup/.test(pass))return 'setup';
      return '';
    }
    function packTextureStage(pass){return pass.startsWith('gbuffers_')?'gbuffers':pass.replace(/\d+$/,'');}
    const stageWrittenTargets=new Map();
    function resetStageWrittenTargets(){stageWrittenTargets.clear();}
    function markStageWrittenTargets(pass){
      const targets=activePassTargets[pass];if(!targets)return;
      const stage=packTextureStage(pass);
      let written=stageWrittenTargets.get(stage);
      if(!written){written=new Set();stageWrittenTargets.set(stage,written);}
      const overrides=activeFlipOverrides.get(pass);
      for(const logical of targets)if(overrides?.get(logical)!==false)written.add(logical);
      if(overrides)for(const [logical,wanted] of overrides)if(wanted)written.add(logical);
    }
    function pipelineColorTargetIndex(name){
      const direct=/^colortex(\d+)$/.exec(name);
      if(direct)return Number(direct[1])<colortexCurrent.length?Number(direct[1]):-1;
      const alias=renderTargetAliases.indexOf(name);
      return alias>=0&&alias<colortexCurrent.length?alias:-1;
    }
    function isPipelineColorTarget(pass,name){
      const logical=pipelineColorTargetIndex(name);
      return logical>=0&&!!stageWrittenTargets.get(pass==='final'?'composite':packTextureStage(pass))?.has(logical);
    }
    function customTextureFor(pass,name){
      if(!activeCustomTextures)return null;
      const stage=activeCustomTextures.stages.get(customTextureStage(pass));
      const found=(stage&&stage.get(name))||activeCustomTextures.global.get(name)||null;
      if(found&&found.customTarget===gl.TEXTURE_3D)return found;
      if(isPipelineColorTarget(pass,name))return null;
      return found;
    }
    const ENGINE_TEXTURES={
      'minecraft:textures/atlas/blocks.png':()=>dirtTexture,'minecraft:textures/atlas/blocks_n.png':()=>normalTexture,
      'minecraft:textures/atlas/blocks_s.png':()=>specularTexture,'minecraft:dynamic/lightmap_1':()=>lightmapTexture,
      'minecraft:lightmap':()=>lightmapTexture,'minecraft:textures/environment/sun.png':()=>vanillaSunTexture,
      'minecraft:textures/environment/moon_phases.png':()=>vanillaMoonTexture,'minecraft:textures/environment/clouds.png':()=>vanillaCloudImage
    };
    const RAW_TEXTURE_CHANNELS={RED:1,RED_INTEGER:1,ALPHA:1,LUMINANCE:1,RG:2,RG_INTEGER:2,RGB:3,RGB_INTEGER:3,RGBA:4,RGBA_INTEGER:4};
    function rawTextureKind(name){
      if(name==='UNSIGNED_BYTE')return {array:Uint8Array,full:255,internal:gl.RGBA8,type:gl.UNSIGNED_BYTE};
      if(name==='BYTE')return {array:Int8Array,full:127,internal:gl.RGBA8_SNORM,type:gl.BYTE};
      if(name==='HALF_FLOAT')return {array:Uint16Array,full:0x3C00,internal:gl.RGBA16F,type:gl.HALF_FLOAT};
      if(name==='FLOAT')return {array:Float32Array,full:1,internal:gl.RGBA32F,type:gl.FLOAT};
      if(name==='UNSIGNED_SHORT')return {array:Uint16Array,full:65535,internal:gl.RGBA16,type:gl.UNSIGNED_SHORT};
      return null;
    }
    async function rawCustomTexture(zip,path,tokens){
      const shape={TEXTURE_1D:1,TEXTURE_2D:2,TEXTURE_RECTANGLE:2,TEXTURE_3D:3}[(tokens[1]||'').toUpperCase()];
      if(!shape||tokens.length!==shape+5)return null;
      const internalName=(tokens[2]||'').toUpperCase();
      if(/^(?:R|RG|RGB|RGBA)(?:8|16|32)U?I$/.test(internalName)&&gl[internalName]!==undefined){
        const sizes=tokens.slice(3,3+shape).map(Number);
        if(sizes.some(value=>!Number.isInteger(value)||value<1))return null;
        const [sizeX,sizeY=1,sizeZ=1]=sizes,texels=sizeX*sizeY*sizeZ;
        const channels=RAW_TEXTURE_CHANNELS[(tokens[tokens.length-2]||'').toUpperCase()];
        const input={UNSIGNED_BYTE:Uint8Array,BYTE:Int8Array,UNSIGNED_SHORT:Uint16Array,SHORT:Int16Array,UNSIGNED_INT:Uint32Array,INT:Int32Array}[(tokens[tokens.length-1]||'').toUpperCase()];
        if(!channels||!input)return null;
        const gpuFormat=gl.textureFormat(gl[internalName]),bits=/(\d+)(?:uint|sint)$/.exec(gpuFormat);
        if(!bits)return null;
        const lanes=/^rgba/.test(gpuFormat)?4:/^rg/.test(gpuFormat)?2:1,signed=/sint$/.test(gpuFormat);
        const output={8:signed?Int8Array:Uint8Array,16:signed?Int16Array:Uint16Array,32:signed?Int32Array:Uint32Array}[bits[1]];
        let source;
        try{const buffer=await zip.file(path).async('arraybuffer');source=new input(buffer,0,Math.floor(buffer.byteLength/input.BYTES_PER_ELEMENT));}catch(error){return null;}
        if(source.length<texels*channels)return null;
        const data=new output(texels*lanes);
        for(let texel=0;texel<texels;texel++)for(let c=0;c<lanes;c++)data[texel*lanes+c]=c<channels?source[texel*channels+c]:(c===3?1:0);
        const target=shape===3?gl.TEXTURE_3D:gl.TEXTURE_2D;
        const texture=gl.createTexture();gl.bindTexture(target,texture);
        if(target===gl.TEXTURE_3D)gl.texImage3D(target,0,gl[internalName],sizeX,sizeY,sizeZ,0,gl.RGBA_INTEGER,gl.UNSIGNED_BYTE,data);
        else gl.texImage2D(target,0,gl[internalName],sizeX,sizeY,0,gl.RGBA_INTEGER,gl.UNSIGNED_BYTE,data);
        gl.texParameteri(target,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(target,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texParameteri(target,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(target,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texParameteri(target,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
        texture.customTarget=target;
        return texture;
      }
      const kind=rawTextureKind((tokens[tokens.length-1]||'').toUpperCase());
      const channels=RAW_TEXTURE_CHANNELS[(tokens[tokens.length-2]||'').toUpperCase()];
      if(!kind||!channels)return null;
      const sizes=tokens.slice(3,3+shape).map(Number);
      if(sizes.some(value=>!Number.isInteger(value)||value<1))return null;
      const [sizeX,sizeY=1,sizeZ=1]=sizes,texels=sizeX*sizeY*sizeZ;
      let source;
      try{source=new kind.array(await zip.file(path).async('arraybuffer'));}catch(error){return null;}
      if(source.length<texels*channels)return null;
      const data=new kind.array(texels*4);
      for(let texel=0;texel<texels;texel++){
        const from=texel*channels,to=texel*4;
        for(let c=0;c<4;c++)data[to+c]=c<channels?source[from+c]:(c===3?kind.full:0);
      }
      const target=shape===3?gl.TEXTURE_3D:gl.TEXTURE_2D;
      const texture=gl.createTexture();gl.bindTexture(target,texture);
      if(target===gl.TEXTURE_3D&&kind.type===gl.UNSIGNED_SHORT&&gl.device.features.has('float32-filterable'))gl.texImage3D(target,0,gl.RGBA32F,sizeX,sizeY,sizeZ,0,gl.RGBA,gl.FLOAT,Float32Array.from(data,value=>value/65535));
      else if(target===gl.TEXTURE_3D)gl.texImage3D(target,0,kind.internal,sizeX,sizeY,sizeZ,0,gl.RGBA,kind.type,data);
      else gl.texImage2D(target,0,kind.internal,sizeX,sizeY,0,gl.RGBA,kind.type,data);
      gl.texParameteri(target,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(target,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(target,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(target,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(target,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
      texture.customTarget=target;
      return texture;
    }
    async function applyCustomTextureMetadata(zip,path,texture,isRaw){
      let metadata={};
      const entry=zip.file(path+'.mcmeta');
      if(entry)try{metadata=JSON.parse(await entry.async('string')).texture||{};}
      catch(error){console.warn('Iris: Unable to read the custom texture mcmeta at '+path+'.mcmeta, ignoring: '+error.message);metadata={};}
      for(const key of ['blur','clamp'])if(typeof metadata[key]==='string')metadata[key]=metadata[key].toLowerCase()==='true';
      const blur=typeof metadata.blur==='boolean'?metadata.blur:isRaw;
      const clamp=typeof metadata.clamp==='boolean'?metadata.clamp:isRaw;
      const target=texture.customTarget||gl.TEXTURE_2D;
      gl.bindTexture(target,texture);
      gl.texParameteri(target,gl.TEXTURE_MIN_FILTER,blur?gl.LINEAR:gl.NEAREST);
      gl.texParameteri(target,gl.TEXTURE_MAG_FILTER,blur?gl.LINEAR:gl.NEAREST);
      for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(target,axis,clamp?gl.CLAMP_TO_EDGE:gl.REPEAT);
    }
    async function readCustomTextures(zip,properties){
      const result={global:new Map(),stages:new Map(),textures:[],skipped:[]};
      const paths=Object.keys(zip.files);
      const locate=value=>{
        const wanted=String(value).trim().split(/\s+/)[0].replace(/^\.?\//,'').toLowerCase();
        if(!wanted)return null;
        const segments=[];
        for(const part of ('shaders/'+wanted).split('/')){if(part==='..')segments.pop();else if(part&&part!=='.')segments.push(part);}
        const target=segments.join('/');
        return paths.find(path=>path.toLowerCase()===target)||null;
      };
      for(const [key,value] of Object.entries(properties||{})){
        const match=key.match(/^(?:texture|customTexture)\.(?:(\w+)\.)?(\w+)(?:\.\d+)?$/);
        if(!match)continue;
        const stage=match[1]&&CUSTOM_TEXTURE_STAGES.includes(match[1])?match[1]:'';
        const sampler=customSamplerName(match[1]&&!stage?match[1]:match[2]);
        const engine=ENGINE_TEXTURES[String(value).trim().split(/\s+/)[0].toLowerCase()];
        if(engine){
          const provided=engine();
          if(!provided)continue;
          if(!stage)result.global.set(sampler,provided);
          else{
            if(!result.stages.has(stage))result.stages.set(stage,new Map());
            result.stages.get(stage).set(sampler,provided);
          }
          continue;
        }
        const path=locate(value);
        if(!path){result.skipped.push(key+': Datei nicht gefunden ('+String(value).trim().split(/\s+/)[0]+')');continue;}
        let texture=await rawCustomTexture(zip,path,String(value).trim().split(/\s+/));
        const isRaw=!!texture;
        if(!texture)try{
          const bytes=await packDeadline(zip.file(path).async('arraybuffer'),'ZIP-Eintrag '+path).catch(()=>packDeadline(zip.file(path).async('arraybuffer'),'ZIP-Eintrag '+path));
          let bitmap=await packDeadline(createImageBitmap(new Blob([bytes]),{premultiplyAlpha:'none',colorSpaceConversion:'none'}),'Bild '+path);
          const limit=gl.device?.limits?.maxTextureDimension2D||8192;
          if(bitmap.width>limit||bitmap.height>limit){
            const scale=limit/Math.max(bitmap.width,bitmap.height),large=bitmap;
            bitmap=await createImageBitmap(large,{resizeWidth:Math.floor(large.width*scale),resizeHeight:Math.floor(large.height*scale),resizeQuality:'high',premultiplyAlpha:'none',colorSpaceConversion:'none'});
            large.close&&large.close();
          }
          texture=textureFromImage(bitmap,gl.RGBA8,gl.RGBA,gl.LINEAR,gl.LINEAR);
          bitmap.close&&bitmap.close();
        }catch(error){result.skipped.push(key+': Inhalt nicht lesbar');continue;}
        if(!texture){result.skipped.push(key+': Inhalt nicht lesbar');continue;}
        await applyCustomTextureMetadata(zip,path,texture,isRaw);
        result.textures.push(texture);
        if(!stage)result.global.set(sampler,texture);
        else{
          if(!result.stages.has(stage))result.stages.set(stage,new Map());
          result.stages.get(stage).set(sampler,texture);
        }
      }
      return result;
    }
    function applyCustomTextures(next){
      if(activeCustomTextures)for(const texture of activeCustomTextures.textures)gl.deleteTexture(texture);
      activeCustomTextures=next;
    }
