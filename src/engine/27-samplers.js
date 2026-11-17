    let activePackTextures=new Map();
    async function readPackTextures(zip,properties){
      const result=new Map(),root='shaders/';
      try{
        for(const [key,value] of Object.entries(properties)){
          if(!key.startsWith('texture.'))continue;
          const fileName=value.trim().split(/\s+/)[0];
          if(!/\.(png|jpe?g|webp)$/i.test(fileName))continue;
          const file=zip.file(root+fileName.replace(/^\//,''));
          if(!file){
            if(/cloud[-_]?water/i.test(fileName))result.set(key,cloudWaterTexture);
            continue;
          }
          const bytes=await packDeadline(file.async('uint8array'),'ZIP-Eintrag '+fileName).catch(error=>{console.warn(error.message+' · zweiter Versuch');return packDeadline(file.async('uint8array'),'ZIP-Eintrag '+fileName);});
          const url=URL.createObjectURL(new Blob([bytes]));
          try{
            const image=await packDeadline(loadImage(url),'Bild '+fileName).catch(error=>{console.warn(error.message+' · zweiter Versuch');return packDeadline(createImageBitmap(new Blob([bytes])),'Bild '+fileName);});
            result.set(key,textureFromImage(image,gl.RGBA8,gl.RGBA,gl.LINEAR,gl.LINEAR));
          }
          finally{URL.revokeObjectURL(url);}
        }
        return result;
      }catch(error){disposePackTextures(result);throw error;}
    }
    function disposePackTextures(textures){for(const texture of new Set(textures.values()))if(texture!==cloudWaterTexture)gl.deleteTexture(texture);}
    function packSamplerTexture(pass,name){
      if(name==='noisetex')return activePackTextures.get('texture.noise');
      if(isPipelineColorTarget(pass,name))return null;
      const stage=pass.startsWith('gbuffers_')?'gbuffers':pass==='final'?'composite':pass.replace(/\d+$/,'');
      const logical=RENDER_TARGET_LEGACY[name];
      const alias=logical===undefined?null:'colortex'+logical;
      return activePackTextures.get('texture.'+pass+'.'+name)||activePackTextures.get('texture.'+stage+'.'+name)||(alias&&(activePackTextures.get('texture.'+pass+'.'+alias)||activePackTextures.get('texture.'+stage+'.'+alias)));
    }

    const samplerKindWarned=new Set();
    let whiteTexture=null;
    let packShadowTargets=[],shadowStorageTargets=new Set();
    function bindSamplers(program) {
      const count=gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS),pass=programNames.get(program)||'';let unit=0;
      const waterShadow=Array.from({length:count},(_,i)=>gl.getActiveUniform(program,i)?.name).includes('watershadow');
      const legacy={gcolor:0,gdepth:1,gnormal:2,composite:3,gaux1:4,gaux2:5,gaux3:6,gaux4:7};
      const fullscreenPass=/^(?:begin|prepare|deferred|composite|shadowcomp)\d*$|^final$/.test(pass);
      for(let i=0;i<count;i++){
        const info=gl.getActiveUniform(program,i); if(!info)continue;
        const isSampler=[gl.SAMPLER_2D,gl.SAMPLER_2D_SHADOW,gl.SAMPLER_3D,gl.UNSIGNED_INT_SAMPLER_2D,gl.UNSIGNED_INT_SAMPLER_3D,gl.INT_SAMPLER_2D,gl.INT_SAMPLER_3D].includes(info.type);
        if(!isSampler)continue;
        if(unit+info.size>gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS))throw new Error('Zu viele aktive Textursampler im Shader-Pack.');
        const name=info.name.endsWith('[0]')?info.name.slice(0,-3):info.name; const loc=gl.getUniformLocation(program,info.name);
        let target=gl.TEXTURE_2D,texture=neutralTexture,sampler=null;const customImage=gl.customImageBySampler?.(name);
        if(skyTextureOverride&&['tex','texture','gtexture','gcolor','colortex0','u_MainSampler'].includes(name)&&/^(?:clrwl_)?gbuffers/.test(pass)||skyTextureOverride&&['tex','texture','gtexture','u_MainSampler'].includes(name)){texture=skyTextureOverride;}
        else if(/^(?:clrwl_)?gbuffers/.test(pass)&&(name==='gcolor'||name==='colortex0'))texture=pass==='gbuffers_skybasic'?whiteTexture:dirtTexture;
        else if(customImage){texture=customImage.texture;if(customImage.dimension==='3d')target=gl.TEXTURE_3D;}
        else if(packSamplerTexture(pass,name))texture=packSamplerTexture(pass,name);
        else if(name.startsWith('colortex')&&info.type!==gl.SAMPLER_3D&&info.type!==gl.UNSIGNED_INT_SAMPLER_3D&&info.type!==gl.INT_SAMPLER_3D){const logical=Number(name.slice(8));if(Number.isInteger(logical)&&colortexCurrent[logical])texture=colortexCurrent[logical];}
        else if(name==='depthtex0'||name==='gdepthtex'){texture=sceneDepthTextures[0]||emptyDepthTexture;sampler=shadowRawSampler;}
        else if(name==='depthtex1'){texture=sceneDepthTextures[1]||emptyDepthTexture;sampler=shadowRawSampler;}
        else if(name==='depthtex2'){texture=sceneDepthTextures[2]||emptyDepthTexture;sampler=shadowRawSampler;}
        else if(name.startsWith('dhDepthTex')){texture=emptyDepthTexture;sampler=shadowRawSampler;}
        else if(/^shadowcolor\d*$/.test(name))texture=shadowColorTextures[Number(name.slice(11)||0)]||whiteTexture;
        else if(/^(?:shadowtex[01](?:HW|DH)?|shadow|watershadow)$/.test(name)){
          const logical=/^shadowtex1/.test(name)||(name==='shadow'&&waterShadow)?1:0;
          texture=shadowDepthTextures[logical]||emptyDepthTexture;sampler=info.type===gl.SAMPLER_2D_SHADOW?shadowCompareSampler:shadowRawSampler;
        }
        else if(info.type===gl.SAMPLER_2D_SHADOW){texture=emptyDepthTexture;sampler=shadowCompareSampler;}
        else if(info.type===gl.SAMPLER_3D){target=gl.TEXTURE_3D;texture=neutral3DTexture;}
        else if(info.type===gl.INT_SAMPLER_2D)texture=signed2DTexture;
        else if(info.type===gl.INT_SAMPLER_3D){target=gl.TEXTURE_3D;texture=signed3DTexture;}
        else if(info.type===gl.UNSIGNED_INT_SAMPLER_2D)texture=unsigned2DTexture;
        else if(info.type===gl.UNSIGNED_INT_SAMPLER_3D){target=gl.TEXTURE_3D;texture=unsigned3DTexture;}
        else if(name==='lightmap')texture=lightmapTexture||neutralTexture;
        else if(name==='textureAtlas'||name==='playerAtlas_sampler')texture=dirtTexture;
        else if(name==='tex'||name==='gtexture'||name==='texture'||name==='u_MainSampler')texture=fullscreenPass?((pass.startsWith('shadowcomp')?shadowColorTextures[0]:colortexCurrent[0])||neutralTexture):pass==='gbuffers_skybasic'?whiteTexture:dirtTexture;
        else if(name==='iris_overlay')texture=whiteTexture;
        else if(name==='iris_centerDepthSmooth')texture=gl.centerDepthTexture();
        else if(name==='normals')texture=normalTexture;
        else if(name==='specular')texture=specularTexture;
        else if(name==='noisetex')texture=noiseTexture;
        else if(name==='cloudWaterTex')texture=cloudWaterTexture;
        else if(Object.hasOwn(legacy,name)&&!fullscreenPass&&legacy[name]<4)texture=dirtTexture;
        else if(Object.hasOwn(legacy,name))texture=colortexCurrent[legacy[name]];
        else if(fullscreenPass&&info.type===gl.SAMPLER_2D)texture=(pass.startsWith('shadowcomp')?shadowColorTextures[0]:colortexCurrent[0])||neutralTexture;
        else if(info.type===gl.SAMPLER_2D)texture=skyTextureOverride||(pass==='gbuffers_skybasic'?whiteTexture:dirtTexture);
        const custom=customTextureFor(pass,name);
        if(custom){
          const customTarget=custom.customTarget||gl.TEXTURE_2D;
          const wantsVolume=info.type===gl.SAMPLER_3D||info.type===gl.UNSIGNED_INT_SAMPLER_3D||info.type===gl.INT_SAMPLER_3D;
          if(wantsVolume===(customTarget===gl.TEXTURE_3D)){texture=custom;target=customTarget;sampler=null;}
        }
        const wants3D=info.type===gl.SAMPLER_3D||info.type===gl.UNSIGNED_INT_SAMPLER_3D||info.type===gl.INT_SAMPLER_3D;
        if(wants3D!==(target===gl.TEXTURE_3D)){
          if(!samplerKindWarned.has(pass+'.'+name)){
            samplerKindWarned.add(pass+'.'+name);
            console.warn(pass+': '+name+' ist '+(wants3D?'sampler3D':'sampler2D')+
              ', gebunden war eine '+(target===gl.TEXTURE_3D?'3D':'2D')+'-Textur — Aushilfstextur eingesetzt.');
          }
          target=wants3D?gl.TEXTURE_3D:gl.TEXTURE_2D;
          sampler=null;
          texture=wants3D
            ?(info.type===gl.SAMPLER_3D?neutral3DTexture:info.type===gl.INT_SAMPLER_3D?signed3DTexture:unsigned3DTexture)
            :(info.type===gl.UNSIGNED_INT_SAMPLER_2D?unsigned2DTexture:info.type===gl.INT_SAMPLER_2D?signed2DTexture:neutralTexture);
        }
        const units=new Int32Array(info.size);
        for(let j=0;j<info.size;j++){units[j]=unit;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(target,texture);gl.bindSampler(unit,sampler);unit++;}
        if(info.size===1)gl.uniform1i(loc,units[0]);else gl.uniform1iv(loc,units);
      }
    }

