    let packSettings=null;
    const propertyMap=text=>Object.fromEntries(text.replace(/\\\r?\n\s*/g,'').split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')&&line.includes('=')).map(line=>{const i=line.indexOf('=');return[line.slice(0,i).trim(),line.slice(i+1).trim()];}));
    function profileValues(properties,name,seen=new Set()){
      if(seen.has(name))throw new Error('Zyklisches Shader-Profil');seen.add(name);const values={};
      for(const token of (properties['profile.'+name]||'').split(/\s+/)){
        if(token.startsWith('profile.'))Object.assign(values,profileValues(properties,token.slice(8),new Set(seen)));
        else if(token.includes('=')){const i=token.indexOf('=');values[token.slice(0,i)]=token.slice(i+1);}
        else if(token.includes(':')){const i=token.indexOf(':');values[token.slice(0,i)]=token.slice(i+1);}
        else if(token)values[token.replace(/^!/, '')]=!token.startsWith('!');
      }return values;
    }
    async function readPackSettings(zip,label,requested){
      const path=Object.keys(zip.files).find(path=>path==='shaders/shaders.properties');
      const properties=propertyMap(path?await zip.file(path).async('string'):'');
      if(!Object.keys(properties).length){
        const shaderFiles=Object.keys(zip.files).filter(name=>/^shaders\/.*\.glsl$/.test(name)&&!zip.files[name].dir);let sdv=false;
        for(const name of shaderFiles){if(/\buniform\s+float\s+(?:dayCycle|shdFade|eyeSkylight)\s*;/.test(await zip.file(name).async('string'))){sdv=true;break;}}
        if(sdv){
          Object.assign(properties,propertyMap('vignette = false\nseparateAo = true\noldLighting = false\nunderwaterOverlay = false\nrain.depth = false\nshadow.culling = true\nfrustum.culling = true\nbeacon.beam.depth = true\nsky = false\nstars = false\nocclusion.culling = true\nparticles.ordering = after\nseparateEntityDraws = true\nsun = false\nmoon = false\nshadowBlockEntities = false\nshadowEntities = false\nshadowPlayer = true\nblend.gbuffers_basic = off\nblend.gbuffers_clouds = off\nblend.gbuffers_line = off\nblend.gbuffers_skybasic = off\nblend.gbuffers_terrain = off\nblend.shadow = off\nblend.gbuffers_armor_glint = ONE ONE ZERO ZERO\nblend.gbuffers_skytextured = ONE ONE ZERO ZERO\nblend.gbuffers_lightning = ONE ONE ZERO ZERO\nblend.gbuffers_spidereyes = ONE ONE ZERO ZERO\nblend.gbuffers_block.colortex1 = off\nblend.gbuffers_block.colortex2 = off\nblend.gbuffers_block.colortex3 = off\nblend.gbuffers_entities.colortex1 = off\nblend.gbuffers_entities.colortex2 = off\nblend.gbuffers_entities.colortex3 = off\nblend.gbuffers_hand.colortex1 = off\nblend.gbuffers_hand.colortex2 = off\nblend.gbuffers_hand.colortex3 = off\nblend.gbuffers_water.colortex1 = off\nblend.gbuffers_water.colortex2 = off\nblend.gbuffers_water.colortex3 = off\nblend.gbuffers_textured.colortex3 = off\nblend.gbuffers_lightning.colortex3 = off\nblend.gbuffers_particles.colortex3 = off\nalphaTest.gbuffers_armor_glint = off\nalphaTest.gbuffers_basic = off\nalphaTest.gbuffers_beaconbeam = off\nalphaTest.gbuffers_block = off\nalphaTest.gbuffers_clouds = off\nalphaTest.gbuffers_damagedblock = off\nalphaTest.gbuffers_entities = off\nalphaTest.gbuffers_hand = off\nalphaTest.gbuffers_line = off\nalphaTest.gbuffers_skybasic = off\nalphaTest.gbuffers_skytextured = off\nalphaTest.gbuffers_spidereyes = off\nalphaTest.gbuffers_terrain = off\nalphaTest.gbuffers_textured = off\nalphaTest.gbuffers_water = off\nalphaTest.gbuffers_weather = off\nalphaTest.shadow = off\nalphaTest.gbuffers_lightning = off\nalphaTest.gbuffers_particles = off'));
          const root=(path||'shaders/shaders.properties').replace(/shaders\.properties$/,'');
          if(zip.file(root+'textures/noise.png'))properties['texture.noise']='textures/noise.png';
          if(zip.file(root+'textures/clouds.png')){properties['texture.composite.colortex0']='textures/clouds.png';properties['texture.deferred.colortex0']='textures/clouds.png';}
          console.info('Leere shaders.properties eines Super-Duper-Vanilla-Ablegers: SDV-Einstellungen übernommen');
        }
      }
      const langPath=Object.keys(zip.files).find(path=>/(^|\/)shaders\/lang\/en_US\.lang$/.test(path));
      const language=propertyMap(langPath?await zip.file(langPath).async('string'):'');
      const referenced=new Set(Object.entries(properties).filter(([key])=>key==='screen'||key.startsWith('screen.')).flatMap(([,value])=>value.split(/\s+/)).filter(name=>/^\w+$/.test(name)));
      const options={};
      const packDefines=new Set();
      const binary=/\.(?:png|jpe?g|gif|bmp|tga|dds|ktx|ogg|wav|mp3|zip|jar|ttf|otf|ico|webp|bin|exe|dll)$/i,packSources={};
      for(const path of Object.keys(zip.files))if(!zip.files[path].dir&&path.startsWith('shaders/')&&!binary.test(path))packSources[path]=await zip.file(path).async('string');
      const sources=Object.entries(packSources).filter(([path,text])=>!/\.(?:properties|lang|txt|md|json|mcmeta)$/i.test(path)&&!/\/world(?:-1|[1-9]\d*)\//.test(path)&&text.length<2000000).map(([,text])=>text);
      for(const source of sources)for(const line of source.split(/\r?\n/)){
        const define=line.match(/^\s*(\/\/\s*)?#define\s+(\w+)(?:\s+([^/\s]+))?\s*(?:\/\/.*)?$/);
        const constant=line.match(/^\s*const\s+(?:float|int|bool)\s+(\w+)\s*=\s*([^;]+);/);
        const choices=line.match(/\/\/[^\[]*\[([^\]]+)\]/);
        if(define&&!define[1]&&!define[3]&&!/^[a-z0-9_]+$/.test(define[2])&&!/^(?:NETHER|THE_END|OVERWORLD)$/.test(define[2]))packDefines.add(define[2]);
        if(define){const [,disabled,name,value]=define;if(!referenced.has(name)&&!choices)continue;
          if(choices)options[name]??={value:value||'',choices:choices[1].trim().split(/\s+/),kind:'define'};
          else if(!value)options[name]??={value:!disabled,choices:[true,false],kind:'boolean'};
        }else if(constant&&choices){options[constant[1]]??={value:constant[2].trim(),choices:choices[1].trim().split(/\s+/),kind:'constant'};}
      }
      const profile=requested?.profile??(properties['profile.HIGH']?'HIGH':'');
      const values=requested?.values??profileValues(properties,profile);
            return{zip,label,properties,language,options,packDefines:[...packDefines],profile,values,packSources,sourceCache:new Map(),uniforms:compilePropertyUniforms(properties)};
    }
    function packStageSource(file,stage,settings){
      const wgpuLines={state:[],out:[],raw:null};let source=glslPreprocess(file.slice(file.indexOf('shaders/')),{files:settings.packSources,overrides:settings.values,cache:settings.sourceCache,debugLines:wgpuLines}).code;(window.wgpuStageOrigins??=new Map()).set(file,{raw:wgpuLines.raw,state:wgpuLines.state,out:wgpuLines.out,pre:source,includes:window.wgpuIncludeOrigins?.get(file.slice(file.indexOf('shaders/')))});
      for(const [name,value] of Object.entries(settings.values)){
        if(typeof value==='boolean'||!/^\w+$/.test(name)||!/^[\w.+-]+$/.test(String(value)))continue;
        if(settings.options[name]?.kind==='constant'||name==='shadowDistance')source=source.replace(new RegExp('(const\\s+(?:float|int|bool)\\s+'+name+'\\s*=\\s*)[^;]+;','g'),(_,prefix)=>prefix+value+';');
      }
      settings.colortexFormats??=Object.fromEntries(Object.values(settings.packSources||{}).flatMap(text=>[...text.matchAll(/\bconst\s+int\s+colortex(\d+)Format\s*=\s*(\w+)\s*;/g)].map(match=>[match[1],match[2].toLowerCase()])));
      source=source.replace(/\blayout\s*\(\s*\w+\s*\)(\s*uniform\s+(?:\w+\s+)*[iu]?image2D\s+colorimg(\d+)\s*;)/g,(whole,rest,index)=>{
        const format=settings.colortexFormats[index];if(!format)return whole;
        if(/^r32u?i$/.test(format)&&/\buniform\s+(?:\w+\s+)*image2D\b/.test(rest))return whole;
        const allocated=/^(?:r|rg|rgb)16f$/.test(format)?'rgba16f':/^(?:r|rg|rgb|rgba)32f$/.test(format)?(gl?.device?.features.has('float32-filterable')?'rgba32f':'rgba16f'):/^(?:r|rg|rgb)8$/.test(format)?'rgba8':format;
        return 'layout('+allocated+')'+rest;
      });
      settings.atomicVectorMembers??=glslAtomicVectorMembers(Object.values(settings.packSources||{}));
      return glslLowerLegacy(glslBufferVectorAtomics(glslImageFormatViews(glslFloatBitSamplers(glslFullscreenMainSampler(glslPlainShadowCalls(glslTextureParameters(lowerSamplerTernaries(glslDropEmptySwitches(source)))),file),settings.colortexFormats),settings.colortexFormats),settings.atomicVectorMembers),stage);
    }
    function lowerStageSource(s,stage,atomicImages){
      s=glslBufferQualifiers(nameAnonymousStructs(foldBufferArrayLengths(lowerLongTernaryChains(s))));
      s=splitInterfaceDeclarations(s);
      s=renameReservedIdentifiers(s);
      s=lowerSwitchFallthrough(s);
      s=stage==='fragment'?lowerComponentOutputs(dropBuiltinRedeclarations(s)):dropPerVertexBlocks(s);
      if(stage==='fragment')s=s.replace(/\bgl_HelperInvocation\b/g,'false');
      s=lowerAtomicImages(lowerImage1D(s),atomicImages);
      s=lowerSampler1D(lowerSubgroups(lowerGatherOffsets(lowerDynamicTexelOffsets(s)),stage));
      s=joinMultilineConsts(s);
      s=dropDuplicateConsts(s);
      s=unwrapIntArgumentCasts(s);
      if(stage!=='geometry'){s=lowerInterfaceBlocks(s,stage);s=lowerArrayVaryings(s,stage);}
      s=lowerIntegerSampling(s);
      if(stage==='fragment')s=dropImageAtomics(s);
      return glslDropUnusedSamplers(s);
    }
    function lowerSamplerTernaries(source){
      if(!/\?/.test(source))return source;
      const samplers=new Set([...source.matchAll(/\buniform\s+(?:(?:lowp|mediump|highp)\s+)?[iu]?sampler\w+\s+(\w+)\s*;/g)].map(m=>m[1]));
      if(!samplers.size)return source;
      const call=/\b(texture|textureLod|textureGrad|textureOffset|textureLodOffset|textureGradOffset|textureProj|textureProjLod|texelFetch|texelFetchOffset|textureGather|textureGatherOffset|textureSize|textureQueryLevels)\s*\(/g;
      let out='',cursor=0,match;
      while((match=call.exec(source))){
        let depth=0,end=-1,comma=-1;
        for(let i=match.index+match[0].length;i<source.length;i++){
          const c=source[i];
          if(c==='('||c==='[')depth++;
          else if(c===')'||c===']'){if(depth===0){end=i;break;}depth--;}
          else if(c===','&&depth===0&&comma<0)comma=i;
        }
        if(end<0)break;
        const first=source.slice(match.index+match[0].length,comma<0?end:comma);
        const pick=/^\s*([^?]+?)\s*\?\s*(\w+)\s*:\s*(\w+)\s*$/.exec(first);
        if(!pick||!samplers.has(pick[2])||!samplers.has(pick[3]))continue;
        const rest=comma<0?'':source.slice(comma,end);
        out+=source.slice(cursor,match.index)+'(('+pick[1]+') ? '+match[1]+'('+pick[2]+rest+') : '+match[1]+'('+pick[3]+rest+'))';
        cursor=end+1;call.lastIndex=end+1;
      }
      return out+source.slice(cursor);
    }
    function glslDropEmptySwitches(source){
      return source.replace(/\bswitch\s*(\((?:[^()]|\([^()]*\))*\))\s*\{\s*\}/g,(whole,expression)=>expression+';');
    }
    function packProgramSources(files,name,settings,properties,atomicImages){
      let vs=lowerStageSource(packStageSource(files.vsh,'vertex',settings),'vertex',atomicImages);
      const fs=lowerStageSource(applyEngineAlphaTest(packStageSource(files.fsh,'fragment',settings),name,properties),'fragment',atomicImages);(window.wgpuProgramOrigins??=new Map()).set(name,window.wgpuStageOrigins?.get(files.fsh));
      if(/\bwgpuFragVertex\b/.test(fs))vs=vs.replace(/\bvoid\s+main\s*\(\s*(?:void\s*)?\)\s*\{/,whole=>'out vec3 wgpuFragVertex;\n'+whole+'\n  wgpuFragVertex=wgpuIrisVertex.xyz;');
      let tess=null;
      if(files.tcs&&files.tes&&packWantsTessellation(properties)){
        const control=lowerStageSource(packStageSource(files.tcs,'geometry',settings),'geometry',atomicImages),evaluation=lowerStageSource(packStageSource(files.tes,'geometry',settings),'geometry',atomicImages);
        if(/\blayout\s*\([^)]*\btriangles\b[^)]*\)\s*in\s*;/.test(evaluation))tess={control,evaluation};
        else console.warn(name+': Tessellation mit quads/isolines wird noch nicht nachgebaut, das Programm läuft ohne sie.');
      }
      if(files.gsh||tess){
        const gs=files.gsh?lowerStageSource(packStageSource(files.gsh,'geometry',settings),'geometry',atomicImages):null;
        const [matchedVs,matchedFs]=glslMatchUniformTypes(vs,fs);return [matchedVs,matchedFs,gs,tess];
      }
      const [matchedVs,matchedFs]=glslMatchUniformTypes(vs,fs);return matchVaryingWidths(glslMatchInterpolation(matchedVs,matchedFs),matchedFs);
    }
