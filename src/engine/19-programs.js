    function giveEntityIdMatchingPrecision(source, label) {
      const declaration = 'uniform int entityId;';
      const first = source.indexOf(declaration);
      const second = first < 0 ? -1 : source.indexOf(declaration, first + declaration.length);
      if (first < 0 || second >= 0) {
        throw new Error(label + ': entityId-Deklaration ist nicht eindeutig.');
      }
      return source.slice(0, first) + 'uniform highp int entityId;' + source.slice(first + declaration.length);
    }

    function lowerIrisCenterDepth(source){
      return source.replace(/\buniform\s+(?:(?:highp|mediump|lowp)\s+)?float\s+centerDepthSmooth\s*;/g,
        'uniform sampler2D iris_centerDepthSmooth;\n#define centerDepthSmooth (texelFetch(iris_centerDepthSmooth, ivec2(0), 0).r)\n');
    }
    function activeLocationZeroOutputs(code){
      const defined=new Set(),stack=[],names=[],plainNames=[];
      const test=expression=>{
        const match=/^(!?)\s*defined\s*\(?\s*(\w+)\s*\)?$/.exec(expression.trim());
        return match?defined.has(match[2])!==(match[1]==='!'):null;
      };
      const active=()=>stack.every(frame=>frame.state!==false);
      code=code.replace(/layout\s*\([^)]*\)\s*out\b/g,match=>match.replace(/\s+/g,' '));
      for(const line of code.split('\n')){
        const directive=/^\s*#\s*(define|undef|ifdef|ifndef|if|elif|else|endif)\b\s*(.*)$/.exec(line);
        if(!directive){
          const output=/layout\s*\(\s*location\s*=\s*0\s*\)\s*out\s+(?:\w+\s+)?(?:float|[iu]?vec[234]|u?int)\s+(\w+)/.exec(line);
          if(output&&active())names.push(output[1]);
          const plain=!output&&/^\s*out\s+(?:float|vec[234])\s+(\w+)\s*;/.exec(line);
          if(plain&&active())plainNames.push(plain[1]);
          continue;
        }
        const [,op,arg]=directive,word=arg.trim().split(/\s+/)[0];
        if(op==='define'&&active())defined.add(word);
        else if(op==='undef'&&active())defined.delete(word);
        else if(op==='ifdef')stack.push({state:defined.has(word),taken:defined.has(word)});
        else if(op==='ifndef')stack.push({state:!defined.has(word),taken:!defined.has(word)});
        else if(op==='if'){const state=test(arg);stack.push({state,taken:state});}
        else if(op==='elif'){const frame=stack.at(-1);if(frame){const state=frame.taken===true?false:test(arg);frame.state=state;if(state!==false)frame.taken=frame.taken||state;}}
        else if(op==='else'){const frame=stack.at(-1);if(frame)frame.state=frame.taken===true?false:frame.taken===false?true:null;}
        else if(op==='endif')stack.pop();
      }
      return names.some(name=>name!=='outColor0')?names:[...names,...plainNames.slice(0,1)];
    }
    function applyEngineAlphaTest(source, label, properties = {}) {
      const rasterStage=/^(?:gbuffers_(?:terrain|terrain_solid|terrain_cutout|terrain_cutout_mip|textured|textured_lit|entities|hand|block|weather|water|clouds)|shadow|shadow_(?:solid|cutout|entities|block)|clrwl_shadow)$/.test(label);
      const code=source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,'');
      const alphaSetting=String(properties['alphaTest.'+label]||'').trim();
      if(/^gbuffers_(?:hand_)?water$/.test(label)&&!alphaSetting)return source;
      if(!alphaSetting&&/\bif\s*\([^;{]*\balphaTestRef\b/.test(code))return source;
      if(/\bif\s*\([^;{]*\.a\s*<[^{};]*\)\s*(?:\{[^{}]*?)?\bdiscard\b/.test(code))return source;
      if(rasterStage&&alphaSetting.toLowerCase()!=='off'){
        const outputs=activeLocationZeroOutputs(code);
        const output=outputs.filter(name=>name!=='outColor0').at(-1)||outputs[0];
        if(output&&/\bvoid\s+main\s*\(\s*(?:void\s*)?\)/.test(code)){
          const [operation='GREATER',value='0.1']=alphaSetting.split(/\s+/).filter(Boolean);
          const reject={GREATER:'<=',GEQUAL:'<',LESS:'>=',LEQUAL:'>',EQUAL:'!=',NOTEQUAL:'=='}[operation.toUpperCase()];
          const threshold=Number(value);
          if(reject&&Number.isFinite(threshold)){
            const dynamic=!alphaSetting&&/^gbuffers_(?:terrain|textured|textured_lit|entities)$/.test(label);
            const literal=dynamic?'viewerAlphaTestRef':Number.isInteger(threshold)?threshold.toFixed(1):String(threshold);
            if(dynamic)source='uniform float viewerAlphaTestRef;\n'+source;
            let guard=null;
            if(output!=='outColor0'){
              const declaration=new RegExp('(layout\\s*\\(\\s*location\\s*=\\s*0\\s*\\)\\s*out\\s+(?:\\w+\\s+)?(?:float|[iu]?vec[234]|u?int)\\s+'+output+'\\s*;)','g');
              if(declaration.test(source)){guard='WGPU_ALPHA_OUTPUT_'+output;source=source.replace(declaration,'$1\n#define '+guard+'\n');}
            }
            const check='if (wgpuAlphaOf('+output+') '+reject+' '+literal+') discard;';
            return source.replace(/\bvoid\s+main\s*\(\s*(?:void\s*)?\)/g,'void viewerPackAlphaMain()')+
              '\nfloat wgpuAlphaOf(vec4 wgpuAlphaValue) { return wgpuAlphaValue.a; }\nfloat wgpuAlphaOf(vec3 v) { return 1.0; }\nfloat wgpuAlphaOf(vec2 v) { return 1.0; }\nfloat wgpuAlphaOf(float v) { return 1.0; }'+
              '\nfloat wgpuAlphaOf(uvec4 v) { return 1.0; }\nfloat wgpuAlphaOf(uvec3 v) { return 1.0; }\nfloat wgpuAlphaOf(uvec2 v) { return 1.0; }\nfloat wgpuAlphaOf(uint v) { return 1.0; }'+
              '\nfloat wgpuAlphaOf(ivec4 v) { return 1.0; }\nfloat wgpuAlphaOf(ivec3 v) { return 1.0; }\nfloat wgpuAlphaOf(ivec2 v) { return 1.0; }\nfloat wgpuAlphaOf(int v) { return 1.0; }'+
              (guard?'\nvoid main() { viewerPackAlphaMain();\n#ifdef '+guard+'\n'+check+'\n#endif\n}\n':'\nvoid main() { viewerPackAlphaMain(); '+check+' }\n');
          }
        }
      }
      return source;
    }

    async function createProgram(vsSource,fsSource,label,options={}){
      const wgpuVs=GB.hooks.adaptShaderSource(vsSource,label),wgpuFs=GB.hooks.adaptShaderSource(fsSource,label);const program=await gl.createShaderProgram(wgpuVs,wgpuFs,label,false,options);program.wgpuDebugSource={vertex:wgpuVs,fragment:wgpuFs,options};
      programNames.set(program,label);return program;
    }

    function attachColorTargets(targets, textures, withDepth = true) {
      gl.wgpuSlotLogical=targets;gl.wgpuWriteMaskFor??=wgpuWriteMaskFor;gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      for(let index=0;index<maxColorAttachments;index++)gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+index,gl.TEXTURE_2D,null,0);
      targets.forEach((logical,index)=>gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+index,gl.TEXTURE_2D,textures[logical],0));
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,null,0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,withDepth?sceneDepthAttachment:null);
      gl.drawBuffers(targets.map((_,index)=>gl.COLOR_ATTACHMENT0+index));
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Framebuffer-Zuordnung ist unvollständig.');
    }

    function swapColorTargets(targets) {
      for(const logical of targets){const old=colortexCurrent[logical];colortexCurrent[logical]=colortexSpare[logical];colortexSpare[logical]=old;}
    }

