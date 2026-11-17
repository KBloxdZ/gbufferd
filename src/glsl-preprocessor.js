
const GLSL_BIOMES=(()=>{
  const biomes={PLAINS:1,FOREST:4,RIVER:7};
  'THE_VOID SUNFLOWER_PLAINS SNOWY_PLAINS ICE_SPIKES DESERT SWAMP MANGROVE_SWAMP FLOWER_FOREST BIRCH_FOREST DARK_FOREST OLD_GROWTH_BIRCH_FOREST OLD_GROWTH_PINE_TAIGA OLD_GROWTH_SPRUCE_TAIGA TAIGA SNOWY_TAIGA SAVANNA SAVANNA_PLATEAU WINDSWEPT_HILLS WINDSWEPT_GRAVELLY_HILLS WINDSWEPT_FOREST WINDSWEPT_SAVANNA JUNGLE SPARSE_JUNGLE BAMBOO_JUNGLE BADLANDS ERODED_BADLANDS WOODED_BADLANDS MEADOW CHERRY_GROVE GROVE SNOWY_SLOPES FROZEN_PEAKS JAGGED_PEAKS STONY_PEAKS FROZEN_RIVER BEACH SNOWY_BEACH STONY_SHORE WARM_OCEAN LUKEWARM_OCEAN DEEP_LUKEWARM_OCEAN OCEAN DEEP_OCEAN COLD_OCEAN DEEP_COLD_OCEAN FROZEN_OCEAN DEEP_FROZEN_OCEAN MUSHROOM_FIELDS DRIPSTONE_CAVES LUSH_CAVES DEEP_DARK NETHER_WASTES WARPED_FOREST CRIMSON_FOREST SOUL_SAND_VALLEY BASALT_DELTAS THE_END END_HIGHLANDS END_MIDLANDS SMALL_END_ISLANDS END_BARRENS PALE_GARDEN'.split(' ').forEach((name,index)=>{biomes[name]=100+index;});
  return biomes;
})();
const GLSL_ENGINE_MACROS=(()=>{
  const macros={IRIS_VERSION:'10900',MC_VERSION:'11900',IS_IRIS:'',MC_GL_VERSION:'320',MC_GLSL_VERSION:'320',MC_OS_WINDOWS:'',MC_GL_VENDOR_OTHER:'',MC_GL_RENDERER_OTHER:'',MC_NORMAL_MAP:'',MC_SPECULAR_MAP:'',MC_RENDER_QUALITY:'1.0',MC_SHADOW_QUALITY:'1.0',MC_HAND_DEPTH:'0.125',MC_MIPMAP_LEVEL:'4',MC_OLD_LIGHTING:'0',IRIS_HAS_TRANSLUCENCY_SORTING:'',IRIS_TAG_SUPPORT:'2',
    UNDERWATERCOLOR_RM:'0.2',UNDERWATERCOLOR_GM:'0.6',UNDERWATERCOLOR_BM:'0.8',WEATHER_TEX_OPACITY_M:'1.0'};
  for(const name of ['CUSTOM_IMAGES','SSBO','COMPUTE','COMPUTE_SHADERS','PER_BUFFER_BLENDING','SEPARATE_HARDWARE_SAMPLERS','HIGHER_SHADOWCOLOR','BLOCK_EMISSION_ATTRIBUTE','ENTITY_TRANSLUCENT'])macros['IRIS_FEATURE_'+name]='';
  ['NONE','SKY','SUNSET','CUSTOM_SKY','SUN','MOON','STARS','VOID','TERRAIN_SOLID','TERRAIN_CUTOUT_MIPPED','TERRAIN_CUTOUT','ENTITIES','BLOCK_ENTITIES','DESTROY','OUTLINE','DEBUG','HAND_SOLID','TERRAIN_TRANSLUCENT','TRIPWIRE','PARTICLES','CLOUDS','RAIN_SNOW','WORLD_BORDER','HAND_TRANSLUCENT'].forEach((name,index)=>{macros['MC_RENDER_STAGE_'+name]=String(index);});
  ['UNKNOWN','LEAVES','STONE','WOOD','METAL','DIRT','LAVA','DEEPSLATE','SNOW','SAND','TERRACOTTA','NETHER_STONE','WATER','GRASS','AIR','ILLUMINATED'].forEach((name,index)=>{macros['DH_BLOCK_'+name]=String(index);});
  for(const [name,id] of Object.entries(GLSL_BIOMES))macros['BIOME_'+name]=String(id);
  ['NONE','TAIGA','EXTREME_HILLS','JUNGLE','MESA','PLAINS','SAVANNA','ICY','THEEND','BEACH','FOREST','OCEAN','DESERT','RIVER','SWAMP','MUSHROOM','NETHER','UNDERGROUND','MOUNTAIN'].forEach((name,index)=>{macros['CAT_'+name]=String(index);});
  macros.CAT_THE_END=macros.CAT_THEEND;
  ['NONE','RAIN','SNOW'].forEach((name,index)=>{macros['PPT_'+name]=String(index);});
  return macros;
})();
const GLSL_TOKEN=/[A-Za-z_]\w*|\.?\d(?:[eE][-+]|[\w.])*|##|\r?\n|[ \t\f\v]+|"[^"\n]*"|./g;
function glslTokens(text){return text.match(GLSL_TOKEN)||[];}
const glslIsSpace=token=>token===' '||token==='\n'||/^\s+$/.test(token);
const glslIsName=token=>/^[A-Za-z_]/.test(token);
function glslFindInclude(files,from,raw){
  const normalize=value=>{const parts=[];for(const part of String(value).replace(/\\/g,'/').split('/')){if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part);}return parts.join('/');};
  const at=from.indexOf('shaders/'),root=at>=0?from.slice(0,at+8):from.slice(0,from.lastIndexOf('/')+1),here=from.slice(0,from.lastIndexOf('/')+1);
  const tried=[];
  for(const candidate of raw.startsWith('/')?[root+raw.slice(1),here+raw.slice(1),raw.slice(1)]:[here+raw,root+raw,raw]){
    const target=normalize(candidate);
    if(!tried.includes(target))tried.push(target);
    if(Object.hasOwn(files,target))return {target,tried};
  }
  const byLower=new Map();for(const key of Object.keys(files))byLower.set(key.toLowerCase(),key);
  for(const candidate of tried){const hit=byLower.get(candidate.toLowerCase());if(hit)return {target:hit,tried};}
  const base=raw.split('/').pop().toLowerCase(),sameName=Object.keys(files).filter(key=>key.toLowerCase().endsWith('/'+base)||key.toLowerCase()===base);
  if(sameName.length===1)return {target:sameName[0],tried};
  return {target:null,tried,similar:sameName};
}
function wgpuCommentLineMap(text){
  const map=[0];let i=0,line=0;const n=text.length;
  while(i<n){
    const c=text[i],d=text[i+1];
    if(c==='/'&&d==='/'){while(i<n&&text[i]!=='\n')i++;continue;}
    if(c==='/'&&d==='*'){
      const end=text.indexOf('*/',i+2),stop=end<0?n:end+2,comment=text.slice(i,stop);let start=line;
      const constants=comment.match(/^[ \t]*const[ \t]+\w+[ \t]+\w+[ \t]*=[^;\n]*;/gm);
      const kept=/^\/\*\s*(?:DRAWBUFFERS|RENDERTARGETS)\s*:/.test(comment)?comment:constants?'/*\n'+constants.join('\n')+'\n*/':' ';
      if(kept===comment){for(let k=i;k<stop;k++)if(text[k]==='\n'){line++;map.push(line);}}
      else{
        for(let k=i;k<stop;k++)if(text[k]==='\n')line++;
        const breaks=kept.split('\n').length-1;for(let k=0;k<breaks;k++)map.push(k<breaks-1?start:line);
      }
      i=stop;continue;
    }
    if(c==='\\'){
      let j=i+1;
      while(text[j]===' '||text[j]==='\t'||text[j]==='\r')j++;
      if(text[j]==='/'&&text[j+1]==='/')while(j<n&&text[j]!=='\n')j++;
      if(text[j]==='\n'){i=j+1;line++;continue;}
    }
    if(c==='"'){const close=text.indexOf('"',i+1),nl=text.indexOf('\n',i+1);if(close>=0&&(nl<0||close<nl)){i=close+1;continue;}}
    if(c==='\n'){line++;map.push(line);}
    i++;
  }
  return map;
}
function glslStripComments(text){
  let out='',i=0;const n=text.length;
  while(i<n){
    const c=text[i],d=text[i+1];
    if(c==='/'&&d==='/'){while(i<n&&text[i]!=='\n')i++;continue;}
    if(c==='/'&&d==='*'){
      const end=text.indexOf('*/',i+2),stop=end<0?n:end+2,comment=text.slice(i,stop);
      const constants=comment.match(/^[ \t]*const[ \t]+\w+[ \t]+\w+[ \t]*=[^;\n]*;/gm);
      out+=/^\/\*\s*(?:DRAWBUFFERS|RENDERTARGETS)\s*:/.test(comment)?comment:constants?'/*\n'+constants.join('\n')+'\n*/':' ';
      i=stop;continue;
    }
    if(c==='\\'){
      let j=i+1;
      while(text[j]===' '||text[j]==='\t'||text[j]==='\r')j++;
      if(text[j]==='/'&&text[j+1]==='/')while(j<n&&text[j]!=='\n')j++;
      if(text[j]==='\n'){i=j+1;out+=' ';continue;}
    }
    if(c==='"'){const close=text.indexOf('"',i+1),line=text.indexOf('\n',i+1);if(close>=0&&(line<0||close<line)){out+=text.slice(i,close+1);i=close+1;continue;}}
    if(c!=='\r')out+=c;
    i++;
  }
  return out;
}
function glslEvaluate(tokens){
  const list=tokens.filter(token=>!glslIsSpace(token));
  const merged=[];
  for(let i=0;i<list.length;i++){const pair=list[i]+(list[i+1]||'');if(['&&','||','==','!=','<=','>=','<<','>>'].includes(pair)){merged.push(pair);i++;}else merged.push(list[i]);}
  let at=0;
  const binary={'||':1,'&&':2,'|':3,'^':4,'&':5,'==':6,'!=':6,'<':7,'>':7,'<=':7,'>=':7,'<<':8,'>>':8,'+':9,'-':9,'*':10,'/':10,'%':10};
  const number=token=>{const clean=token.replace(/[uUfFlL]+$/,'');if(/^0[xX]/.test(token))return parseInt(token,16);const value=Number(clean);if(Number.isNaN(value))throw new Error('Zahl');return value;};
  const unary=()=>{
    const token=merged[at++];
    if(token===undefined)throw new Error('Ende');
    if(token==='('){const value=parse(0);if(merged[at++]!==')')throw new Error('Klammer');return value;}
    if(token==='!')return unary()?0:1;
    if(token==='-')return -unary();
    if(token==='+')return unary();
    if(token==='~')return ~unary();
    if(glslIsName(token)){if(merged[at]==='(')throw new Error('Makro');return 0;}
    if(/^[.\d]/.test(token))return number(token);
    throw new Error('Zeichen');
  };
  const parse=minimum=>{
    let left=unary();
    for(;;){
      const op=merged[at];
      if(op==='?'&&minimum<=0){at++;const a=parse(0);if(merged[at++]!==':')throw new Error('Bedingung');const b=parse(0);left=left?a:b;continue;}
      const level=binary[op];
      if(!level||level<minimum)return left;
      at++;
      const right=parse(level+1);
      switch(op){
        case '||':left=+(!!left||!!right);break;case '&&':left=+(!!left&&!!right);break;
        case '|':left=left|right;break;case '^':left=left^right;break;case '&':left=left&right;break;
        case '==':left=+(left===right);break;case '!=':left=+(left!==right);break;
        case '<':left=+(left<right);break;case '>':left=+(left>right);break;case '<=':left=+(left<=right);break;case '>=':left=+(left>=right);break;
        case '<<':left=left<<right;break;case '>>':left=left>>right;break;
        case '+':left+=right;break;case '-':left-=right;break;case '*':left*=right;break;
        case '/':left=right?(Number.isInteger(left)&&Number.isInteger(right)?Math.trunc(left/right):left/right):0;break;
        case '%':left=right?left%right:0;break;
      }
    }
  };
  try{const value=parse(0);return at===merged.length&&!!value;}catch(error){return false;}
}
const irisTrim=value=>value.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g,'');
function irisSplitLines(text){
  const lines=String(text).split(/\r\n|[\n\u000B\f\r\u0085\u2028\u2029]/);
  if(lines.length>1)while(lines.length>1&&lines.at(-1)==='')lines.pop();
  return lines;
}
function irisNormalizePath(path){
  if(!path.startsWith('/'))throw new Error('Not an absolute path: '+path);
  const parts=[];
  for(const segment of path.split('/')){
    if(!segment||segment==='.')continue;
    if(segment==='..'){if(parts.length)parts.pop();}else parts.push(segment);
  }
  return parts.length?'/'+parts.join('/'):'/';
}
function irisResolvePath(directory,path){
  if(path.startsWith('/'))return irisNormalizePath(path);
  return irisNormalizePath(!directory.endsWith('/')&!path.startsWith('/')?directory+'/'+path:directory+path);
}
const irisParent=path=>{const at=path.lastIndexOf('/');return at<=0?'/':path.slice(0,at);};
function irisFindIncludes(path,lines){
  const directory=irisParent(path),found=new Map();
  for(let i=0;i<lines.length;i++){
    const line=irisTrim(lines[i]);
    if(!line.startsWith('#include'))continue;
    if(line.length<9)throw new Error(path+':'+(i+1)+': #include ohne Pfad');
    let target=irisTrim(line.slice(9));
    if(target.startsWith('"'))target=target.slice(1);
    if(target.endsWith('"'))target=target.slice(0,-1);
    found.set(i,irisResolvePath(directory,target));
  }
  return found;
}
function irisRusticError(severity,message,detail,file,lineNumber,badLine){
  return severity+': '+message+'\n --> '+file+':'+lineNumber+'\n  |\n  | '+badLine+'\n  | '+'^'.repeat(badLine.length)+' '+detail+'\n  |';
}
function irisIncludeGraph(files,root,starts){
  const nodes=new Map(),failures=new Map(),cameFrom=new Map(),lineNumberInclude=new Map(),queue=[...starts];
  while(queue.length){
    const next=queue.shift();
    if(nodes.has(next)||failures.has(next))continue;
    if(!Object.hasOwn(files,root+next.slice(1))){
      const src=cameFrom.get(next);
      if(src===undefined)throw new Error('unexpected error: failed to read '+next);
      const badLine=irisTrim(nodes.get(src).lines[lineNumberInclude.get(next)]);
      failures.set(next,irisRusticError('error','failed to resolve #include directive','file not found',src,lineNumberInclude.get(next)+1,badLine));
      continue;
    }
    const lines=irisSplitLines(files[root+next.slice(1)]),node={lines,includes:irisFindIncludes(next,lines)};
    nodes.set(next,node);
    for(const [line,included] of node.includes){
      if(included===next){
        failures.set(next,irisRusticError('error','trivial #include cycle detected','file includes itself',next,line+1,irisTrim(lines[line])));
        nodes.delete(next);continue;
      }
      if(!nodes.has(included)&&!cameFrom.has(included)){cameFrom.set(included,next);lineNumberInclude.set(included,line);}
      queue.push(included);
    }
  }
  const state=new Map();
  const visit=path=>{
    state.set(path,1);
    for(const included of nodes.get(path)?.includes.values()||[]){
      if(state.get(included)===1)throw new Error('Cycle detected in #include graph, see previous messages for details');
      if(!state.has(included)&&nodes.has(included))visit(included);
    }
    state.set(path,2);
  };
  for(const path of nodes.keys())if(!state.has(path))visit(path);
  return {nodes,failures};
}
function wgpuIncludeMap(graph,path,memo=new Map()){
  if(memo.has(path))return memo.get(path);
  const node=graph.nodes.get(path);const out=[];
  if(node)node.lines.forEach((line,i)=>{
    const included=node.includes.get(i);
    if(included===undefined){out.push([path,i,0,[]]);return;}
    for(const [file,at,depth,chain] of wgpuIncludeMap(graph,included,memo))out.push([file,at,depth+1,[included,...chain]]);
  });
  memo.set(path,out);return out;
}
function irisIncludedLines(graph,path,cache=new Map()){
  if(cache.has(path))return cache.get(path);
  const node=graph.nodes.get(path);let result=null;
  if(node){
    result=[];
    node.lines.forEach((line,i)=>{
      const included=node.includes.get(i);
      if(included===undefined){result.push(line);return;}
      const lines=irisIncludedLines(graph,included,cache);
      if(!lines)throw new Error('#include-Ziel fehlt: '+included);
      for(const spliced of lines)result.push(spliced);
    });
  }
  cache.set(path,result);return result;
}
const IRIS_STAGE_EXTENSIONS=['vsh','tcs','tes','gsh','fsh'];
function irisIsPotentialStart(name){
  const match=/^(.+?)(?:_([a-z]))?\.(vsh|tcs|tes|gsh|fsh|csh)$/.exec(name);if(!match)return false;
  const [,base,letter,extension]=match;
  const array=/^(setup|begin|shadowcomp|prepare|deferred|composite)([1-9]\d?)?$/.test(base);
  const compute=array||base==='final'||base==='shadow';
  if(letter)return compute&&extension==='csh';
  if(extension==='csh')return compute;
  return array||/^(?:final|shadow|shadow_solid|shadow_cutout|shadow_water|shadow_entities|shadow_lightning|shadow_block|dh_terrain|dh_water|dh_shadow|dh_generic|gbuffers_(?:basic|line|textured|textured_lit|skybasic|skytextured|clouds|terrain|terrain_solid|terrain_cutout|terrain_cutout_mip|damagedblock|block|block_translucent|beaconbeam|item|entities|entities_translucent|entities_glowing|particles|particles_translucent|armor_glint|spidereyes|hand|hand_water|weather|water|lightning))$/.test(base)&&IRIS_STAGE_EXTENSIONS.includes(extension);
}
function irisPackIncludeFailures(files){
  const root='shaders/',paths=Object.keys(files).filter(key=>key.startsWith(root)).map(key=>'/'+key.slice(root.length));
  const starts=[],inFolder=folder=>paths.filter(path=>irisParent(path)===folder&&irisIsPotentialStart(path.slice(path.lastIndexOf('/')+1)));
  starts.push(...inFolder('/'));
  const ids=[];
  for(const line of irisSplitLines(files[root+'dimension.properties']||'')){const match=/^\s*dimension\.([^\s=]+)\s*=/.exec(line);if(match)ids.push(match[1]);}
  if(!ids.length)for(const id of ['world0','world-1','world1'])if(paths.some(path=>path.startsWith('/'+id+'/')))ids.push(id);
  for(const id of ids)starts.push(...inFolder('/'+id));
  const graph=irisIncludeGraph(files,root,starts);
  return [...graph.failures.values()];
}
function irisIncludedSource(files,path,cache){
  const at=path.indexOf('shaders/');if(at<0)return null;
  const root=path.slice(0,at+8),self='/'+path.slice(root.length),key='iris-include:'+path;
  if(cache?.has(key))return cache.get(key);
  const graph=irisIncludeGraph(files,root,[self]);
  if(graph.failures.size)throw new Error([...graph.failures.values()].join('\n'));
  const lines=irisIncludedLines(graph,self);
  if(lines)try{(window.wgpuIncludeOrigins??=new Map()).set(path,wgpuIncludeMap(graph,self));}catch{}
  const text=lines?lines.map(line=>line+'\n').join(''):null;
  cache?.set(key,text);return text;
}
function glslPreprocess(path,options){
  const {overrides={},cache=new Map(),text=false,line:lineFilter=null}=options;
  let files=options.files;
  if(!text&&Object.hasOwn(files,path)){const spliced=irisIncludedSource(files,path,cache);if(spliced!==null)files={...files,[path]:spliced};}if(options.debugLines)options.debugLines.raw=String(files[path]??'').replace(/\r/g,'').split('\n');
  const macros=new Map();
  const define=(name,value)=>macros.set(name,{params:null,body:glslTokens(String(value))});
  for(const [name,value] of Object.entries(GLSL_ENGINE_MACROS))define(name,value);
  for(const [name,value] of Object.entries(options.defines||{}))define(name,value);
  for(const name of options.undefine||[])macros.delete(name);
  const clean=file=>{
    if(cache.has(file))return cache.get(file);
    if(text){const lines=files[file].replace(/\r/g,'').split('\n');cache.set(file,lines);return lines;}
    const source=files[file].replace(/^[ \t]*\/\/[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]*(\/\/[^\n]*)?\r?$/gm,(whole,name)=>overrides[name]===true?'#define '+name:whole);
    const lines=glslStripComments(source).split('\n');cache.set(file,lines);return lines;
  };
  const output=[];let run=[];const wgpuDbg=options.debugLines||null;let wgpuOut=0,wgpuRun=[];if(wgpuDbg){const push=output.push.bind(output);output.push=(...items)=>{for(const item of items){const n=String(item).split('\n').length;if(wgpuRun.length){for(let k=0;k<wgpuRun.length;k++)wgpuDbg.out[wgpuRun[k]]=wgpuOut+Math.min(k,n-1);wgpuRun=[];}wgpuOut+=n;}return push(...items);};}
  const expand=tokens=>{
    const stack=[],result=[];
    for(let i=tokens.length-1;i>=0;i--)stack.push(tokens[i]);
    const text=entry=>typeof entry==='string'?entry:entry.t,hidden=entry=>typeof entry==='string'?null:entry.h;
    while(stack.length){
      const entry=stack.pop(),token=text(entry);
      if(!glslIsName(token)){result.push(token);continue;}
      const macro=macros.get(token),hide=hidden(entry);
      if(!macro||hide&&hide.has(token)){result.push(token);continue;}
      if(!macro.params){
        const next=new Set(hide||[]);next.add(token);
        for(let i=macro.body.length-1;i>=0;i--)stack.push({t:macro.body[i],h:next});
        continue;
      }
      let look=stack.length-1;
      while(look>=0&&glslIsSpace(text(stack[look])))look--;
      if(look<0||text(stack[look])!=='('){result.push(token);continue;}
      const args=[[]];let depth=1,closed=false,index=look-1;
      for(;index>=0;index--){
        const current=stack[index],inner=text(current);
        if(inner==='('||inner==='['||inner==='{')depth++;
        else if(inner===')'||inner===']'||inner==='}'){depth--;if(!depth){closed=true;break;}}
        if(inner===','&&depth===1){args.push([]);continue;}
        args[args.length-1].push(current);
      }
      if(!closed){result.push(token);continue;}
      const closing=hidden(stack[index]);
      stack.length=index;
      const plain=list=>{const copy=[...list];while(copy.length&&glslIsSpace(text(copy[0])))copy.shift();while(copy.length&&glslIsSpace(text(copy[copy.length-1])))copy.pop();return copy;};
      const expanded=args.map(list=>expand(plain(list)));
      const raw=args.map(plain);
      const next=new Set(hide||[]);if(closing)for(const name of closing)if(!next.has(name)&&hide&&hide.has(name))next.add(name);next.add(token);
      const body=[];
      for(let i=0;i<macro.body.length;i++){
        const part=macro.body[i],slot=macro.params.indexOf(part);
        const pastes=macro.body[i+1]==='##'||macro.body[i+2]==='##'&&glslIsSpace(macro.body[i+1])||macro.body[i-1]==='##'||macro.body[i-2]==='##'&&glslIsSpace(macro.body[i-1]);
        if(slot>=0)body.push(...(pastes?(raw[slot]||[]).map(text):(expanded[slot]||[])));
        else body.push(part);
      }
      const glued=[];
      for(let i=0;i<body.length;i++){
        if(body[i]==='##'){
          while(glued.length&&glslIsSpace(glued[glued.length-1]))glued.pop();
          let j=i+1;while(j<body.length&&glslIsSpace(body[j]))j++;
          const joined=(glued.length?glued.pop():'')+(body[j]||'');glued.push(...glslTokens(joined));i=j;
        }else glued.push(body[i]);
      }
      for(let i=glued.length-1;i>=0;i--)stack.push({t:glued[i],h:next});
    }
    return result;
  };
  const flush=()=>{if(!run.length)return;output.push(expand(glslTokens(run.join('\n'))).join(''));run=[];};
  const condition=expression=>{
    const protect=tokens=>{
      const out=[];
      for(let i=0;i<tokens.length;i++){
        if(tokens[i]!=='defined'){out.push(tokens[i]);continue;}
        let j=i+1;while(glslIsSpace(tokens[j]||''))j++;
        const open=tokens[j]==='(';if(open){j++;while(glslIsSpace(tokens[j]||''))j++;}
        const name=tokens[j];if(!name||!glslIsName(name)){out.push('(','(');continue;}
        if(open){j++;while(glslIsSpace(tokens[j]||''))j++;if(tokens[j]!==')'){out.push('(','(');continue;}}
        out.push(macros.has(name)?'1':'0');i=j;
      }
      return out;
    };
    const lone=/^\s*([A-Za-z_]\w*)\s*$/.exec(expression);
    if(lone&&macros.get(lone[1])&&!macros.get(lone[1]).params&&!macros.get(lone[1]).body.length)return true;
    return glslEvaluate(protect(expand(protect(glslTokens(expression)))));
  };
  const included=new Set();
  const once=new Set();
  const process=(file,stack)=>{
    if(stack.includes(file))throw new Error('Zyklisches #include: '+[...stack,file].join(' → '));
    if(stack.length>64)throw new Error('Zu tief verschachtelte #includes: '+file);
    const levels=[];
    const wgpuLines=clean(file),wgpuTop=wgpuDbg&&!stack.length,wgpuMap=wgpuTop?wgpuCommentLineMap(String(files[file]??'')):null;
    for(let wgpuIndex=0;wgpuIndex<wgpuLines.length;wgpuIndex++){const line=wgpuLines[wgpuIndex];
      const directive=/^\s*#\s*(\w*)\s*(.*)$/.exec(line);
      const active=levels.every(level=>level.active);
      if(wgpuTop)wgpuDbg.state[wgpuMap[wgpuIndex]]=directive?'d':active?'a':'i';
      if(!directive){if(active){if(text)output.push(lineFilter?lineFilter(line,macros):line);else{run.push(line);if(wgpuTop)wgpuRun.push(wgpuMap[wgpuIndex]);}}continue;}
      const [,op,rawArgument]=directive,argument=(text?rawArgument.replace(/\/\/.*$/,''):rawArgument).trim();
      if(op==='if'||op==='ifdef'||op==='ifndef'){
        if(active)flush();
        let value=false;
        if(active){
          const name=/^[A-Za-z_]\w*/.exec(argument)?.[0]??null;
          if(op==='if')value=condition(argument);
          else if(!name)value=op==='ifdef'?condition(argument):!condition(argument);
          else value=op==='ifdef'?macros.has(name):!macros.has(name);
        }
        levels.push({active:value,taken:value});
      }else if(op==='elif'){
        const level=levels.at(-1);if(!level)continue;
        const parents=levels.slice(0,-1).every(item=>item.active);
        if(level.active)flush();
        const value=parents&&!level.taken&&condition(argument);
        level.active=value;level.taken=level.taken||value;
      }else if(op==='else'){
        const level=levels.at(-1);if(!level)continue;
        if(level.active)flush();
        level.active=!level.taken;level.taken=true;
      }else if(op==='endif'){
        if(!levels.length)continue;
        if(levels.at(-1).active)flush();
        levels.pop();
      }else if(!active)continue;
      else if(op==='define'){
        flush();
        const match=/^([A-Za-z_]\w*)(\()?/.exec(argument);if(!match)continue;
        const name=match[1];
        if(text){
          if(match[2])continue;
          if(overrides[name]===false){macros.delete(name);continue;}
          const body=argument.slice(name.length).trim();
          macros.set(name,{params:null,body:glslTokens(Object.hasOwn(overrides,name)?(overrides[name]===true?'1':String(overrides[name])):body||'1')});
          continue;
        }
        let params=null,rest=argument.slice(match[0].length);
        if(match[2]){const close=rest.indexOf(')');if(close<0)continue;params=rest.slice(0,close).split(',').map(item=>item.trim()).filter(Boolean);rest=rest.slice(close+1);}
        if(Object.hasOwn(overrides,name)&&!params){
          const value=overrides[name],valueless=!rest.trim();
          if(value===false&&valueless)continue;
          if(typeof value!=='boolean'&&/^[\w.+-]+$/.test(String(value))&&!valueless){macros.set(name,{params:null,body:glslTokens(String(value))});continue;}
        }
        macros.set(name,{params,body:glslTokens(rest.trim())});
      }else if(op==='undef'){flush();macros.delete(argument.split(/\s+/)[0]);}
      else if(op==='include'){
        flush();
        const match=/["<]([^">]+)[">]/.exec(argument)||/^(\S+)/.exec(argument);if(!match)continue;
        const found=glslFindInclude(files,file,match[1]);
        if(!found.target)throw new Error(file+': #include "'+match[1]+'" nicht gefunden\n  gesucht als: '+found.tried.join(' , ')+(found.similar?.length?'\n  mehrdeutig, im Pack vorhanden: '+found.similar.slice(0,6).join(' , '):''));
        if(once.has(found.target))continue;
        included.add(found.target);
        if(!text)output.push('// ---> INCLUDE START: '+match[1]);
        process(found.target,[...stack,file]);
        if(!text)output.push('// <--- INCLUDE END: '+match[1]);
      }else if(op==='pragma'){if(/^once\b/.test(argument))once.add(file);}
      else if(op==='error'&&!text){flush();throw new Error(file+': #error '+argument);}
    }
    flush();
  };
  process(path,[]);flush();
  return {code:text?output.join('\n').replace(/\\\n[ \t]*/g,options.continuation??''):output.join('\n'),macros,included};
}
const GLSL_LEGACY_NAMES={
  gl_ModelViewMatrix:'wgpuIrisModelView',gl_ProjectionMatrix:'mc_ProjectionMatrix',gl_ModelViewProjectionMatrix:'wgpuIrisModelViewProjection',gl_NormalMatrix:'mc_NormalMatrix',
  gl_Vertex:'wgpuIrisVertex',gl_Normal:'mc_Normal',gl_MultiTexCoord0:'mc_MultiTexCoord0',gl_MultiTexCoord1:'mc_MultiTexCoord1',gl_TextureMatrix:'mc_TextureMatrix',
  gl_ModelViewMatrixInverse:'inverse(wgpuIrisModelView)',gl_ProjectionMatrixInverse:'inverse(mc_ProjectionMatrix)',gl_ModelViewProjectionMatrixInverse:'inverse(wgpuIrisModelViewProjection)',
  gl_ModelViewMatrixTranspose:'transpose(wgpuIrisModelView)',gl_ProjectionMatrixTranspose:'transpose(mc_ProjectionMatrix)',gl_ModelViewMatrixInverseTranspose:'transpose(inverse(wgpuIrisModelView))',
  gl_MultiTexCoord2:'mc_MultiTexCoord1',
  mc_TexCoord0:'mc_MultiTexCoord0.xy',vaPosition:'wgpuIrisVertex.xyz',vaNormal:'mc_Normal',vaColor:'mc_Color',vaUV0:'mc_MultiTexCoord0.xy',vaUV1:'mc_MultiTexCoord1.xy',vaUV2:'ivec2(mc_MultiTexCoord1.xy)',
  texture2D:'texture',texture3D:'texture',textureCube:'texture',texture2DProj:'textureProj',texture2DLod:'textureLod',textureSize2D:'textureSize',texture3DLod:'textureLod',textureCubeLod:'textureLod',
  texture2DGrad:'textureGrad',texture3DGrad:'textureGrad',textureCubeGrad:'textureGrad',texelFetch2D:'texelFetch',texelFetch3D:'texelFetch',
  texture2DLodEXT:'textureLod',texture2DGradEXT:'textureGrad',textureCubeLodEXT:'textureLod',texture3DLodEXT:'textureLod',
  texture2DGradARB:'textureGrad',texture2DProjGradARB:'textureProjGrad',texture2DLodARB:'textureLod',texture2DProjLodARB:'textureProjLod'
};
const GLSL_SHADOW_CALLS={shadow2D:'texture',shadow2DLod:'textureLod',shadow2DProj:'textureProj',shadow2DGradARB:'textureGrad',shadow2DProjGradARB:'textureProjGrad',shadow2DLodARB:'textureLod'};
const GLSL_FOG_FIELDS={color:'vec4(fogColor, 1.0)',density:'fogDensity',index:'0.0',start:'fogStart',end:'fogEnd',scale:'(1.0 / max(fogEnd - fogStart, 0.0001))'};
const GLSL_INT_MOD=`int wgpuMod(int a,int b){return a-(a/b)*b;}
uint wgpuMod(uint a,uint b){return a-(a/b)*b;}
ivec2 wgpuMod(ivec2 a,ivec2 b){return a-(a/b)*b;}
ivec3 wgpuMod(ivec3 a,ivec3 b){return a-(a/b)*b;}
ivec4 wgpuMod(ivec4 a,ivec4 b){return a-(a/b)*b;}
uvec2 wgpuMod(uvec2 a,uvec2 b){return a-(a/b)*b;}
uvec3 wgpuMod(uvec3 a,uvec3 b){return a-(a/b)*b;}
uvec4 wgpuMod(uvec4 a,uvec4 b){return a-(a/b)*b;}
ivec2 wgpuMod(ivec2 a,int b){return a-(a/b)*b;}
ivec3 wgpuMod(ivec3 a,int b){return a-(a/b)*b;}
ivec4 wgpuMod(ivec4 a,int b){return a-(a/b)*b;}
uvec2 wgpuMod(uvec2 a,uint b){return a-(a/b)*b;}
uvec3 wgpuMod(uvec3 a,uint b){return a-(a/b)*b;}
uvec4 wgpuMod(uvec4 a,uint b){return a-(a/b)*b;}
float wgpuMod(float a,float b){return mod(a,b);}
vec2 wgpuMod(vec2 a,vec2 b){return mod(a,b);}
vec3 wgpuMod(vec3 a,vec3 b){return mod(a,b);}
vec4 wgpuMod(vec4 a,vec4 b){return mod(a,b);}
vec2 wgpuMod(vec2 a,float b){return mod(a,b);}
vec3 wgpuMod(vec3 a,float b){return mod(a,b);}
vec4 wgpuMod(vec4 a,float b){return mod(a,b);}
`;
const GLSL_SAFE_NORMALIZE=['float','vec2','vec3','vec4'].map(type=>`${type} wgpuNormalize(${type} v){float l=dot(v,v);return l>0.0?v/sqrt(l):v;}`).join('\n')+'\n';
const GLSL_SAFE_TRIG=['sin','cos'].map(call=>['float','vec2','vec3','vec4'].map(type=>`${type} wgpu${call[0].toUpperCase()+call.slice(1)}(${type} x){return ${call}(clamp(x,-1e18,1e18));}`).join('\n')).join('\n')+'\n';
const GLSL_ANY_ALL=['any','all'].map(name=>{const own='wgpu'+name[0].toUpperCase()+name.slice(1);return `bool ${own}(bool b){return b;}\n`+[2,3,4].map(size=>`bool ${own}(bvec${size} b){return ${name}(b);}\n`).join('');}).join('');
const GLSL_BIT_CALLS=(()=>{
  const lines=[];
  for(const [own,call] of [['wgpuFindLSB','findLSB'],['wgpuFindMSB','findMSB'],['wgpuBitCount','bitCount']]){
    lines.push(`int ${own}(int v){return ${call}(v);}`);
    lines.push(`int ${own}(uint v){return ${call==='findMSB'?'v>=2147483648u?31:':''}${call}(int(v));}`);
    for(const size of [2,3,4]){
      lines.push(`ivec${size} ${own}(ivec${size} v){return ${call}(v);}`);
      lines.push(`ivec${size} ${own}(uvec${size} v){return ivec${size}(${'xyzw'.slice(0,size).split('').map(c=>`${own}(v.${c})`).join(',')});}`);
    }
  }
  return lines.join('\n')+'\n';
})();
const GLSL_QUERY_LOD=`vec2 wgpuQueryLod(vec2 texels){vec2 dx=dFdx(texels),dy=dFdy(texels);float lod=0.5*log2(max(max(dot(dx,dx),dot(dy,dy)),1e-8));return vec2(max(lod,0.0),lod);}
`;
const GLSL_BITS_TO_FLOAT=`float wgpuBitsToFloat(float v){return v;}
vec2 wgpuBitsToFloat(vec2 v){return v;}
vec3 wgpuBitsToFloat(vec3 v){return v;}
vec4 wgpuBitsToFloat(vec4 v){return v;}
float wgpuBitsToFloat(uint v){return uintBitsToFloat(v);}
vec2 wgpuBitsToFloat(uvec2 v){return uintBitsToFloat(v);}
vec3 wgpuBitsToFloat(uvec3 v){return uintBitsToFloat(v);}
vec4 wgpuBitsToFloat(uvec4 v){return uintBitsToFloat(v);}
`;
const GLSL_RESERVED_NAMES=new Set(['sample','patch','common','partition','active','filter','input','output','resource','half','fixed','class','this','template','public','static','extern','external','interface','long','short','unsigned','inline','noinline','goto','using','namespace','cast','sizeof','superp','subroutine','textureSample','textureSampleLevel','textureSampleBias','textureSampleGrad','textureSampleCompare','textureSampleCompareLevel','textureSampleBaseClampToEdge','textureLoad','textureStore','textureDimensions','textureNumLevels','textureNumLayers','textureNumSamples','textureBarrier','select','saturate','arrayLength','dpdx','dpdy','dpdxCoarse','dpdyCoarse','dpdxFine','dpdyFine','fwidthCoarse','fwidthFine','countOneBits','countLeadingZeros','countTrailingZeros','firstLeadingBit','firstTrailingBit','extractBits','insertBits','reverseBits','atomicLoad','atomicStore','atomicSub','atomicXor','pack4x8snorm','pack4x8unorm','pack2x16snorm','pack2x16unorm','pack2x16float','unpack4x8snorm','unpack4x8unorm','unpack2x16snorm','unpack2x16unorm','unpack2x16float','workgroupBarrier','storageBarrier']);
const GLSL_WRAPPED_CALLS={any:'wgpuAny',all:'wgpuAll',findLSB:'wgpuFindLSB',findMSB:'wgpuFindMSB',bitCount:'wgpuBitCount'};
const GLSL_IRIS_ATTRIBUTE_TYPES={vaPosition:'vec3',vaNormal:'vec3',vaColor:'vec4',vaUV0:'vec2',vaUV1:'vec2',vaUV2:'ivec2'};
function glslAttributeAs(expression,from,to){
  if(from===to)return expression;
  const size=type=>/^(?:float|int|uint)$/.test(type)?1:+type.slice(-1);
  const base=type=>/^(?:int|ivec)/.test(type)?'i':/^(?:uint|uvec)/.test(type)?'u':'';
  const n=size(from),m=size(to),kind=base(from);
  const constant=value=>kind==='i'?String(value):kind==='u'?value+'u':value+'.0';
  let value='('+expression+')';
  if(m<n)value=value+'.'+'xyzw'.slice(0,m);
  else if(m>n){
    const fill=[];for(let index=n;index<m;index++)fill.push(constant(index===3?1:0));
    value=kind+'vec'+m+'('+value+', '+fill.join(', ')+')';
  }
  if(base(to)!==kind)value=to+'('+value+')';
  return value;
}
const GLSL_ONE_ARGUMENT_BUILTINS=['round','roundEven','trunc','sinh','cosh','tanh','asinh','acosh','atanh'];
function glslOwnBuiltinFunctions(source){
  for(const name of GLSL_ONE_ARGUMENT_BUILTINS){
    const definition=new RegExp('^[ \\t]*(float|vec[234])\\s+'+name+'\\s*\\(\\s*(?:(?:in|const|highp|mediump|lowp)\\s+)*(float|vec[234])\\s+\\w+\\s*\\)\\s*\\{','gm');
    const own=new Set([...source.matchAll(definition)].filter(match=>match[1]===match[2]).map(match=>match[1]));
    if(!own.size)continue;
    let fresh='wgpuOwn_'+name;
    while(new RegExp('\\b'+fresh+'\\b').test(source))fresh+='_';
    source=source.replace(new RegExp('(?<![.\\w])'+name+'(?=\\s*\\()','g'),fresh);
    const forward=['float','vec2','vec3','vec4'].filter(type=>!own.has(type)).map(type=>type+' '+fresh+'('+type+' x){return '+name+'(x);}\n').join('');
    const first=source.search(new RegExp('^[ \\t]*(?:float|vec[234])\\s+'+fresh+'\\s*\\(','m'));
    source=first<0?source:source.slice(0,first)+forward+source.slice(first);
  }
  return source;
}
function glslLowerLegacy(code,stage){
  code=code.replace(/(^|[;{}\n])([ \t]*)uniform[ \t]+((?:(?:highp|mediump|lowp)[ \t]+)?\w+)[ \t]+([A-Za-z_]\w*(?:[ \t]*\[[^\]\n]*\])?(?:[ \t]*,[ \t]*[A-Za-z_]\w*(?:[ \t]*\[[^\]\n]*\])?)+)[ \t]*;/g,
    (whole,lead,indent,type,names)=>lead+names.split(',').map(name=>indent+'uniform '+type+' '+name.trim()+';').join('\n'));
  const tokens=glslTokens(code),out=[];
  const space=token=>token!==undefined&&glslIsSpace(token);
  const next=at=>{let i=at+1;while(space(tokens[i]))i++;return i;};
  const previous=at=>{let i=at-1;while(i>=0&&space(tokens[i]))i--;return i;};
  const names={...GLSL_LEGACY_NAMES};
  const ownMatrix=name=>new RegExp('(?<!uniform\\s+)\\bmat[34]\\s+(?:\\w+\\s*,\\s*)*'+name+'\\b').test(code);
  const coreMatrices={projectionMatrix:'mc_ProjectionMatrix',modelViewMatrix:'wgpuIrisModelView',textureMatrix:'mc_TextureMatrix[0]',normalMatrix:'mc_NormalMatrix',projectionMatrixInverse:'inverse(mc_ProjectionMatrix)',modelViewMatrixInverse:'inverse(wgpuIrisModelView)'};
  for(const [name,engine] of Object.entries(coreMatrices))if(!ownMatrix(name))names[name]=engine;
  if(stage==='vertex'){names.gl_FrontColor='wgpu_FrontColor';names.gl_Color='mc_Color';names.attribute='in';names.varying='out';}
  if(stage==='vertex')for(const [,type,name] of code.matchAll(/\b(?:in|attribute)\s+(float|int|uint|[iu]?vec[234])\s+(va(?:Position|Normal|Color|UV0|UV1|UV2))\s*;/g))
    names[name]=glslAttributeAs(names[name],GLSL_IRIS_ATTRIBUTE_TYPES[name],type);
  else if(stage==='fragment'){names.gl_Color='wgpu_FrontColor';names.varying='in';names.gl_FragColor='outColor0';names.vaColor='wgpu_FrontColor';names.vaPosition='wgpuFragVertex';}
  else names.gl_Color='mc_Color';
  const ownNormalize=/\b(?:float|vec[234])\s+normalize\s*\(/.test(code);let braces=0;
  const ownTrig=/\b(?:float|vec[234])\s+(?:sin|cos)\s*\(/.test(code);let constStatement=false;
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i];
    if(token==='{')braces++;else if(token==='}')braces--;
    if(token==='const')constStatement=true;else if(token===';'||token==='{'||token==='}')constStatement=false;
    if((token==='sin'||token==='cos')&&braces>0&&!constStatement&&!ownTrig&&tokens[i-1]!=='.'&&tokens[next(i)]==='('){out.push(token==='sin'?'wgpuSin':'wgpuCos');continue;}
    if(token==='normalize'&&braces>0&&!ownNormalize&&tokens[i-1]!=='.'&&tokens[next(i)]==='('){out.push('wgpuNormalize');continue;}
    if(Object.hasOwn(GLSL_WRAPPED_CALLS,token)&&braces>0&&tokens[i-1]!=='.'&&tokens[next(i)]==='('){out.push(GLSL_WRAPPED_CALLS[token]);continue;}
    if(GLSL_RESERVED_NAMES.has(token)&&!((token==='sample'||token==='patch')&&['in','out','centroid','flat','smooth','noperspective'].includes(tokens[next(i)]))){out.push('wgpuName_'+token);continue;}
    if(!glslIsName(token)){
      const suffix=/^(\d*\.?\d*(?:[eE][-+]?\d+)?)[fF]$/.exec(token);
      out.push(suffix&&!/^0[xX]/.test(token)?(/[.eE]/.test(suffix[1])?suffix[1]:suffix[1]+'.0'):token);
      continue;
    }
    if(tokens[i-1]==='.'){out.push(token);continue;}
    if(token==='noperspective'||token==='restrict'||(/^(?:lowp|mediump|highp)$/.test(token)&&tokens[previous(i)]!=='precision')){if(space(tokens[i+1]))i++;continue;}
    if(token==='ftransform'&&tokens[next(i)]==='('&&tokens[next(next(i))]===')'){out.push('(mc_ModelViewProjectionMatrix * mc_Vertex)');i=next(next(i));continue;}
    if(token==='gl_Fog'&&tokens[next(i)]==='.'){const field=next(next(i));if(GLSL_FOG_FIELDS[tokens[field]]){out.push(GLSL_FOG_FIELDS[tokens[field]]);i=field;continue;}}
    if(token==='gl_FragData'&&stage==='fragment'&&tokens[next(i)]==='['&&/^\d+$/.test(tokens[next(next(i))]||'')&&tokens[next(next(next(i)))]===']'){out.push('outColor'+tokens[next(next(i))]);i=next(next(next(i)));continue;}
    if(GLSL_SHADOW_CALLS[token]&&tokens[next(i)]==='('){
      let depth=0,close=-1;
      for(let j=next(i);j<tokens.length;j++){if(tokens[j]==='(')depth++;else if(tokens[j]===')'&&--depth===0){close=j;break;}}
      if(close>=0){tokens.splice(close+1,0,')');out.push('vec4(',GLSL_SHADOW_CALLS[token]);continue;}
    }
    if(Object.hasOwn(names,token)&&!/^(?:attribute|varying)$/.test(token)){
      const before=previous(i),declares=before>=0&&/^(?:float|int|uint|bool|[iub]?vec[234]|mat[234](?:x[234])?|void|sampler\w*)$/.test(tokens[before]);
      if(!declares){out.push(names[token]);continue;}
    }
    if(Object.hasOwn(names,token)&&/^(?:attribute|varying)$/.test(token)){out.push(names[token]);continue;}
    out.push(token);
  }
  let source=glslOwnBuiltinFunctions(out.join(''));
  source=source.replace(/(?:layout\s*\([^)]*\)\s*)?(?:\b(?:flat|smooth|centroid|invariant)\s+)*\b(?:in)\s+\w+\s+(?:mc_Vertex|mc_MultiTexCoord0|mc_MultiTexCoord1|wgpuFragVertex|wgpuIrisVertex\.xyz|mc_Normal|mc_Color|wgpu_FrontColor|mc_MultiTexCoord0\.xy|mc_MultiTexCoord1\.xy|ivec2\(mc_MultiTexCoord1\.xy\))\s*;/g,'');
  source=source.replace(/(?:layout\s*\([^)]*\)\s*)?(?:\b(?:flat|smooth|centroid|invariant)\s+)*\b(?:in|attribute)\s+\w+\s+(?:vaPosition|vaNormal|vaColor|vaUV0|vaUV1|vaUV2)\b[^;]*;/g,'');
  source=source.replace(/\buniform\s+mat4\s+wgpuIrisModelView(?:Projection)?\s*;/g,'').replace(/\buniform\s+mat4\s+mc_ProjectionMatrix\s*;/g,'');
  source=source.replace(/\bconst\s+in\b/g,'in');
  source=source.replace(/\buniform\s+(layout\s*\([^)]*\))/g,'$1 uniform');
  source=source.replace(/\buniform\s+(\w+)\s+(\w+)\s*=\s*([^;]+);/g,(whole,type,name,value)=>glslEngineSetsUniform(name)?'uniform '+type+' '+name+';':'const '+type+' '+name+' = '+value+';');
  source=source.replace(/\bclrwl_computeFragment\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*;/g,(whole,args)=>{const parts=args.split(',').map(part=>part.trim());return `${parts[3]||'ao'} = 1.0; ${parts[4]||'overlayColor'} = vec4(0.0);`;});
  source=source.replace(/\buintBitsToFloat\s*\(\s*0x(7f|ff)800000[uU]?\s*\)/gi,(whole,sign)=>sign.toLowerCase()==='ff'?'-3.4028234e38':'3.4028234e38');
  for(const name of ['viewWidth','viewHeight'])if(new RegExp('\\buniform\\s+int\\s+'+name+'\\s*;').test(source))
    source=source.replace(new RegExp('\\buniform\\s+int\\s+'+name+'\\s*;'),'uniform float WGPU_NAME;').replace(new RegExp('\\b'+name+'\\b','g'),'int('+name+')').replace('WGPU_NAME',name);
  source=source.replace(/\bgl_TexCoord\s*\[\s*(\d+)\s*\]/g,'wgpu_TexCoord$1');
  const texCoordVaryings=[...new Set(source.match(/\bwgpu_TexCoord\d+\b/g)||[])].map(name=>(stage==='vertex'?'out':'in')+' vec4 '+name+';\n').join('');
  if(stage==='vertex')source=glslNumberedInputs(source);
  if(stage==='fragment')source=glslForeignOutColorNames(glslUnusedAttributeInputs(glslNumberedOutputs(source)));
  source=glslQueryLod(glslLocalsHidingBuiltins(glslSelfNamedLocals(glslWriteOnlyImages(glslDropBuiltinCopies(source)))),stage);
  if(stage==='compute')source=glslUniformBarriers(glslSharedVectorAtomics(glslComputeGather(source)));
  source=glslHoistGlobalInits(glslSplitConsts(glslDeclarationInIf(glslDuplicateConsts(glslDropStraySemicolons(glslLowerModulo(glslDepthChannel(source)))))));
  return glslLegacyPrelude(source,stage)+texCoordVaryings+(/\bwgpuShadowCompare\b/.test(source)?GLSL_SHADOW_COMPARE:'')+(/\bwgpuBitsToFloat\b/.test(source)?GLSL_BITS_TO_FLOAT:'')+(/\bwgpuQueryLod\b/.test(source)?GLSL_QUERY_LOD:'')+(/\bwgpuNormalize\b/.test(source)?GLSL_SAFE_NORMALIZE:'')+(/\bwgpu(?:Sin|Cos)\b/.test(source)?GLSL_SAFE_TRIG:'')+(/\bwgpu(?:Any|All)\b/.test(source)?GLSL_ANY_ALL:'')+(/\bwgpu(?:FindLSB|FindMSB|BitCount)\b/.test(source)?GLSL_BIT_CALLS:'')+source;
}
function glslSplitConsts(source){
  const tokens=glslTokens(source);
  const blank=token=>token!==undefined&&glslIsSpace(token);
  for(let i=0;i<tokens.length;i++){
    if(tokens[i]!=='const'&&tokens[i]!=='uniform')continue;
    let at=i+1;while(blank(tokens[at]))at++;
    while(/^(?:highp|mediump|lowp)$/.test(tokens[at]||'')){at++;while(blank(tokens[at]))at++;}
    const type=tokens[at];
    if(!type||!glslIsName(type))continue;
    let depth=0,end=-1;const commas=[];
    for(let j=at+1;j<tokens.length;j++){
      const token=tokens[j];
      if(token==='('||token==='['||token==='{')depth++;
      else if(token===')'||token===']'||token==='}'){if(!depth)break;depth--;}
      else if(token===','&&!depth)commas.push(j);
      else if(token===';'&&!depth){end=j;break;}
    }
    if(end<0||!commas.length)continue;
    for(const comma of commas)tokens[comma]='; '+tokens[i]+' '+type+' ';
    i=end;
  }
  return tokens.join('');
}
function glslMatchInterpolation(vs,fs){
  const flat=new Map();
  for(const match of fs.matchAll(/(?:^|[;}\n])[ \t]*(?:layout\s*\([^)]*\)\s*)?((?:(?:flat|smooth|noperspective|centroid)\s+)*)in\s+\w+\s+(\w+)\s*(?:\[[^\]]*\]\s*)?;/g))flat.set(match[2],/\bflat\b/.test(match[1]));
  return vs.replace(/(^|[;}\n])([ \t]*(?:layout\s*\([^)]*\)\s*)?)((?:(?:flat|smooth|centroid)\s+)*)out(\s+\w+\s+(\w+)\s*(?:\[[^\]]*\]\s*)?;)/g,(whole,lead,layout,qualifiers,rest,name)=>{
    if(!flat.has(name)||flat.get(name)===/\bflat\b/.test(qualifiers))return whole;
    return lead+layout+(flat.get(name)?'flat ':'')+qualifiers.replace(/\bflat\s+/,'')+'out'+rest;
  });
}
function glslGlobalStatements(tokens,visit){
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i];
    if(glslIsSpace(token)||token===';')continue;
    if(token==='/'&&tokens[i+1]==='/'){while(i<tokens.length&&tokens[i]!=='\n')i++;continue;}
    if(token==='/'&&tokens[i+1]==='*'){while(i<tokens.length&&!(tokens[i]==='*'&&tokens[i+1]==='/'))i++;i++;continue;}
    let parens=0,end=i;
    for(;end<tokens.length;end++){
      const current=tokens[end];
      if(current==='('||current==='[')parens++;
      else if(current===')'||current===']')parens--;
      else if(!parens&&(current===';'||current==='{'))break;
    }
    if(tokens[end]==='{'){
      let depth=0;
      for(;end<tokens.length;end++){if(tokens[end]==='{')depth++;else if(tokens[end]==='}'&&--depth===0)break;}
      i=end;continue;
    }
    visit(i,end);
    i=end;
  }
}
function glslHoistGlobalInits(source){
  const qualifier=/^(?:const|highp|mediump|lowp|flat|smooth|centroid|invariant|precise)$/;
  const external=/^(?:uniform|in|out|inout|layout|buffer|shared|attribute|varying|struct|precision)$/;
  const typeWord=/^(?:float|int|uint|bool|double|[biud]?vec[234]|mat[234](?:x[234])?|true|false|gl_WorkGroupSize)$/;
  let tokens=glslTokens(source);
  glslGlobalStatements(tokens,(start,end)=>{
    const part=tokens.slice(start,end);
    if(!part.includes('=')||part.some(token=>external.test(token)))return;
    let at=start;
    while(at<end&&(glslIsSpace(tokens[at])||qualifier.test(tokens[at])))at++;
    const head=tokens.slice(start,at+1).join('');
    let depth=0;
    for(let i=at;i<end;i++){
      const token=tokens[i];
      if(token==='('||token==='['||token==='{')depth++;
      else if(token===')'||token===']'||token==='}')depth--;
      else if(token===','&&!depth)tokens[i]=';'+head+' ';
    }
  });
  tokens=glslTokens(tokens.join(''));
  const constants=new Set(),assignments=[];let lastMoved=-1;
  glslGlobalStatements(tokens,(start,end)=>{
    const part=tokens.slice(start,end),equal=part.indexOf('=');
    if(equal<0||part.some(token=>external.test(token)))return;
    const head=part.slice(0,equal).filter(token=>!glslIsSpace(token));
    if(head.includes('('))return;
    const isConst=head.includes('const'),bare=head.filter(token=>!qualifier.test(token));
    if(bare.join('').includes('[]'))return;
    let depth=0,name=null;
    for(let i=1;i<bare.length;i++){
      if(bare[i]==='[')depth++;else if(bare[i]===']')depth--;else if(!depth&&glslIsName(bare[i]))name=bare[i];
    }
    if(!name)return;
    const value=part.slice(equal+1);
    const constant=value.every((token,index)=>{
      if(!glslIsName(token))return true;
      if(value[index-1]==='.')return true;
      return typeWord.test(token)||constants.has(token);
    });
    if(constant){if(isConst)constants.add(name);return;}
    tokens[start]=bare.join(' ').replace(/ \[ /g,'[').replace(/ \]/g,']');
    for(let i=start+1;i<end;i++)tokens[i]='';
    assignments.push(name+' ='+value.join('')+';');lastMoved=start;
  });
  if(!assignments.length)return source;
  for(let i=0;i<tokens.length;i++){
    if(tokens[i]!=='main')continue;
    let before=i-1;while(before>=0&&glslIsSpace(tokens[before]))before--;
    if(tokens[before]!=='void')continue;
    let open=i+1;while(open<tokens.length&&tokens[open]!=='{'&&tokens[open]!==';')open++;
    if(tokens[open]!=='{')continue;
    if(lastMoved>open){
      let name='wgpuHoistedInits';while(tokens.includes(name))name+='_';
      tokens[before]='void '+name+'();\n'+tokens[before];tokens[open]='{\n'+name+'();\n';
      return tokens.join('')+'\nvoid '+name+'() {\n'+assignments.join('\n')+'\n}\n';
    }
    tokens[open]='{\n'+assignments.join('\n')+'\n';
    return tokens.join('');
  }
  return source;
}
function glslDepthChannel(source){
  const names=[...source.matchAll(/\bsampler2D\s+(shadow|shadowtex[01]|watershadow|depthtex[01]|gdepthtex|dhDepthTex[01]?)\b/g)].map(match=>match[1]);
  if(!names.length)return source;
  const calls=new RegExp('\\b(?:texture2DLod|texture2D|textureLod|texture|texelFetch)\\s*\\(\\s*(?:'+names.join('|')+')\\s*,','g');
  let match,at=0,output='';
  while((match=calls.exec(source))){
    let depth=1,end=calls.lastIndex;
    for(;end<source.length&&depth;end++){if(source[end]==='(')depth++;else if(source[end]===')')depth--;}
    const channel=/^\s*\.\s*[yzgb]\b/.exec(source.slice(end,end+16));
    if(!channel)continue;
    output+=source.slice(at,end)+channel[0].slice(0,-1)+'x';at=end+channel[0].length;
  }
  return output+source.slice(at);
}

function glslComputeGather(source){
  const calls=/\btextureGather\s*\(/g;
  let match,at=0,output='';
  while((match=calls.exec(source))){
    const args=[];let depth=1,start=calls.lastIndex,end=start;
    for(;end<source.length&&depth;end++){
      const c=source[end];
      if(c==='('||c==='[')depth++;
      else if(c===')'||c===']'){depth--;if(!depth)args.push(source.slice(start,end).trim());}
      else if(c===','&&depth===1){args.push(source.slice(start,end).trim());start=end+1;}
    }
    if(depth||args.length<2||args.length>3||(args[2]&&!/^[0-3]$/.test(args[2]))||!new RegExp('\\b(?:[iu]?sampler2D)\\s+'+args[0]+'\\b').test(source))continue;
    const component='xyzw'[Number(args[2]||0)],[sampler,coord]=args,kind=new RegExp('\\busampler2D\\s+'+sampler+'\\b').test(source)?'u':new RegExp('\\bisampler2D\\s+'+sampler+'\\b').test(source)?'i':'';
    const texel=([x,y])=>`texelFetch(${sampler},clamp(ivec2(floor((${coord})*vec2(textureSize(${sampler},0))-0.5))+ivec2(${x},${y}),ivec2(0),textureSize(${sampler},0)-1),0).${component}`;
    output+=source.slice(at,match.index)+`${kind}vec4(${[[0,1],[1,1],[1,0],[0,0]].map(texel).join(',')})`;at=end;calls.lastIndex=end;
  }
  return output+source.slice(at);
}
function glslSharedVectorAtomics(source){
  for(const [whole,qualifier,kind,size,name] of [...source.matchAll(/(\bshared\s+)?\b([iu])vec([234])\s+(\w+)\s*;/g)]){
    if(!new RegExp('\\batomic\\w+\\s*\\(\\s*'+name+'\\s*\\.').test(source))continue;
    const scalar=kind==='i'?'int':'uint',vector=kind+'vec'+size,items='xyzw'.slice(0,+size).split('');
    source=source.replace(whole,`${qualifier||''}${scalar} ${name}_wgpu[${size}];`);
    source=source.replace(new RegExp('(^|[;{}\\s])'+name+'\\s*=(?!=)\\s*([^;]+);','g'),(all,before,value)=>`${before}{${vector} wgpuValue=${value};${items.map((item,index)=>`${name}_wgpu[${index}]=wgpuValue.${item};`).join('')}}`);
    source=source.replace(new RegExp('\\b'+name+'\\s*\\.\\s*([xyzw])\\b','g'),(all,item)=>`${name}_wgpu[${items.indexOf(item)}]`);
    source=source.replace(new RegExp('\\b'+name+'\\b(?!_wgpu)','g'),`${vector}(${items.map((item,index)=>`${name}_wgpu[${index}]`).join(',')})`);
  }
  return source;
}
function glslStatements(body){
  const list=[];let depth=0,start=0;
  for(let i=0;i<body.length;i++){
    const c=body[i];
    if(c==='('||c==='[')depth++;
    else if(c===')'||c===']')depth--;
    else if(c==='{')depth++;
    else if(c==='}'){
      depth--;
      if(!depth&&!/^\s*else\b/.test(body.slice(i+1))&&!/^\s*(?:\w+\s+)*\w+(?:\s*\[[^\]]*\])?\s*=\s*\{/.test(body.slice(start,i))){list.push(body.slice(start,i+1));start=i+1;}
    }else if(c===';'&&!depth&&!/^\s*else\b/.test(body.slice(i+1))){list.push(body.slice(start,i+1));start=i+1;}
  }
  if(body.slice(start).trim())list.push(body.slice(start));
  return list;
}
function glslUniformBarriers(source){
  const header=/\bvoid\s+main\s*\(\s*(?:void\s*)?\)\s*\{/.exec(source);
  if(!header||!/\bbarrier\s*\(/.test(source))return source;
  const open=header.index+header[0].length;let depth=1,end=open;
  for(;end<source.length&&depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
  const statements=glslStatements(source.slice(open,end-1).replace(/\/\/[^\n]*/g,''));
  const early=statements.findIndex(item=>/^\s*if\s*\(/.test(item)&&/^\s*if\s*\([\s\S]*\)\s*\{?\s*return\s*;\s*\}?\s*$/.test(item));
  if(early<0||!statements.slice(early+1).some(item=>/\bbarrier\s*\(/.test(item)))return source;
  const guard=item=>{
    if(!item.trim())return item;
    if(/^\s*(?:barrier|memoryBarrier\w*|groupMemoryBarrier)\s*\(\s*\)\s*;\s*$/.test(item))return item;
    if(/\bbarrier\s*\(/.test(item)){
      const loop=/^(\s*(?:for|while)\s*\([\s\S]*?\)\s*\{)([\s\S]*)\}\s*$/.exec(item);
      return loop?loop[1]+glslStatements(loop[2]).map(guard).join('')+'}':item;
    }
    if(/^\s*(?:const\s+)?(?!return\b|else\b)[A-Za-z_]\w*\s+[A-Za-z_]\w*\s*(?:\[[^\]]*\]\s*)?(?:=|;|,)/.test(item))return item;
    return 'if(!wgpuDone){'+item+'}';
  };
  const cond=/^\s*if\s*\(([\s\S]*)\)\s*\{?\s*return\s*;\s*\}?\s*$/.exec(statements[early])[1];
  const body=[...statements.slice(0,early),`bool wgpuDone=(${cond});`,...statements.slice(early+1).map(guard)].join('');
  return source.slice(0,open)+body+source.slice(end-1);
}
function glslTextureParameters(source){
  const header=/\b\w+\s*\([^(){};]*\bsampler\w*\s+texture\b[^(){};]*\)\s*\{/g;let match;
  while((match=header.exec(source))){
    let depth=1,end=header.lastIndex;
    for(;end<source.length&&depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
    const whole=source.slice(match.index,end).replace(/\btexture\b(?!\s*\()/g,'wgpuTextureParameter');
    source=source.slice(0,match.index)+whole+source.slice(end);
    header.lastIndex=match.index+whole.length;
  }
  return source;
}
function glslAtomicVectorMembers(sources){
  const members=new Set();
  for(const text of sources)for(const match of text.matchAll(/\batomic\w+\s*\(\s*[\w\s.\[\]]*\.\s*(\w+)\s*\.\s*[xyzw]\b/g))members.add(match[1]);
  const macros=new Map();
  for(const text of sources)for(const [,name,params,body] of text.matchAll(/^[ \t]*#define[ \t]+(\w+)\(([^)]*)\)((?:.*\\\r?\n)*.*)/gm)){
    const list=params.split(',').map(param=>param.trim());
    for(const [,param] of body.matchAll(/\batomic\w+\s*\(\s*(\w+)\s*\.\s*[xyzw]\b/g))if(list.includes(param)){
      if(!macros.has(name))macros.set(name,new Set());
      macros.get(name).add(list.indexOf(param));
    }
  }
  for(const [name,slots] of macros)for(const text of sources){
    const calls=new RegExp('\\b'+name+'\\s*\\(','g');let call;
    while((call=calls.exec(text))){
      const parsed=callArguments(text,calls.lastIndex);if(!parsed)continue;
      for(const slot of slots){const member=/(\w+)\s*$/.exec(parsed[0][slot]||'');if(member)members.add(member[1]);}
    }
  }
  return members;
}
function glslBufferVectorAtomics(source,members){
  if(!members?.size)return source;
  const found=new Map();
  source=source.replace(/\b([iu])vec([234])\s+(\w+(?:\s*,\s*\w+)*)\s*;/g,(whole,kind,size,list)=>{
    const names=list.split(',').map(name=>name.trim());
    if(!names.some(name=>members.has(name)))return whole;
    return names.map(name=>{
      if(!members.has(name))return `${kind}vec${size} ${name};`;
      found.set(name,{kind,size:+size});
      return `${kind==='i'?'int':'uint'} ${name}_wgpu[${size}];`;
    }).join(' ');
  });
  for(const [name,{kind,size}] of found){
    const items='xyzw'.slice(0,size).split(''),vector=kind+'vec'+size,path='((?:\\b\\w+(?:\\[[^\\]]*\\])?\\s*\\.\\s*)+)';
    source=source.replace(new RegExp(path+name+'\\s*\\.\\s*([xyzw])\\b(?!\\w)','g'),(all,prefix,item)=>`${prefix}${name}_wgpu[${items.indexOf(item)}]`);
    source=source.replace(new RegExp(path+name+'\\s*=(?!=)\\s*([^;]+);','g'),(all,prefix,value)=>`{${vector} wgpuValue=${value};${items.map((item,index)=>`${prefix}${name}_wgpu[${index}]=wgpuValue.${item};`).join('')}}`);
    source=source.replace(new RegExp(path+name+'\\b','g'),(all,prefix)=>`${vector}(${items.map((item,index)=>`${prefix}${name}_wgpu[${index}]`).join(',')})`);
  }
  for(const [,struct,body] of [...source.matchAll(/\bstruct\s+(\w+)\s*\{([^}]*)\}/g)]){
    if(!body.includes('_wgpu['))continue;
    const slots=body.split(';').flatMap(line=>{
      const array=/\b(int|uint)\s+\w+_wgpu\[(\d)\]/.exec(line);
      if(array)return [{scalar:array[1],size:+array[2]}];
      return line.trim()?line.split(',').map(()=>null):[];
    });
    const calls=new RegExp('\\b'+struct+'\\s*\\(','g');let match,at=0,output='';
    while((match=calls.exec(source))){
      const parsed=callArguments(source,calls.lastIndex);if(!parsed||parsed[0].length!==slots.length)continue;
      const args=parsed[0].map((arg,index)=>{
        const slot=slots[index];if(!slot)return arg;
        return `${slot.scalar}[${slot.size}](${'xyzw'.slice(0,slot.size).split('').map(item=>`(${arg}).${item}`).join(',')})`;
      });
      output+=source.slice(at,match.index)+struct+'('+args.join(',')+')';at=parsed[1];calls.lastIndex=parsed[1];
    }
    source=output+source.slice(at);
  }
  return source;
}
function glslDeclarationInIf(source){
  return source.replace(/\bif\s*\(([^;{}]*)\)\s*((?:[iu]?vec[234]|float|int|uint|bool|mat[234])\s+(\w+))\s*=\s*([^;]+);/g,(whole,condition,declaration,name,value)=>`${declaration}; if(${condition}) ${name} = ${value};`);
}
function glslNumberedInputs(source){
  return source.replace(/\blayout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*in\s+((?:vec|ivec|uvec)?[234]?\w*)\s+(\w+)\s*;/g,(whole,slot,type,name)=>{
    if(/^(?:mc_|wgpu|at_|va[A-Z])/.test(name))return whole;
    const swizzle={vec4:'',vec3:'.xyz',vec2:'.xy',float:'.x'}[type];
    if(swizzle===undefined||+slot>1)return 'const '+type+' '+name+' = '+type+'(0);';
    return `#define ${name} ${+slot===0?'mc_Vertex':'mc_MultiTexCoord0'}${swizzle}\n`;
  });
}
function glslUnusedAttributeInputs(source){
  return source.replace(/^[ \t]*(?:layout\s*\([^)]*\)\s*)?(?:(?:flat|smooth|noperspective|centroid)\s+)*(?:in|varying)\s+\w+\s+(mc_Entity|mc_midTexCoord|at_tangent|at_midBlock|at_velocity|vaPosition|vaColor|vaUV0|vaUV1|vaUV2|vaNormal)\s*;[ \t]*$/gm,(whole,name)=>{
    const rest=source.replace(whole,'');
    return new RegExp('\\b'+name+'\\b').test(rest)?whole:'';
  });
}
function glslForeignOutColorNames(source){
  const declared=/^[ \t]*(?:layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*)?(?:(?:flat|smooth|noperspective|centroid|invariant)\s+)*out\s+(\w+)\s+outColor(\d)\s*;/gm;
  for(const [,location,type,index] of [...source.matchAll(declared)]){
    if(Number(location??0)===Number(index)&&type==='vec4')continue;
    let fresh='wgpuPackOutColor'+index;
    while(new RegExp('\\b'+fresh+'\\b').test(source))fresh+='_';
    source=source.replace(new RegExp('\\boutColor'+index+'\\b','g'),fresh);
  }
  return source;
}
function glslNumberedOutputs(source){
  const open=/^[ \t]*out\s+\w+\s+\w+\s*(?:\[\s*\d+\s*\])?\s*;/gm;
  if((source.match(open)||[]).length<2)return source;
  const taken=new Set(Array.from(source.matchAll(/\blayout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*out\b/g),match=>+match[1]));
  let slot=0;
  return source.replace(/^([ \t]*)(out\s+\w+\s+\w+\s*(?:\[\s*(\d+)\s*\])?\s*;)/gm,(whole,indent,declaration,size)=>{
    const count=+size||1;
    const free=at=>Array.from({length:count},(_,index)=>at+index).every(index=>!taken.has(index));
    while(!free(slot))slot++;
    const location=slot;
    slot+=count;
    return indent+'layout(location='+location+') '+declaration;
  });
}
function glslDuplicateConsts(source){
  const seen=new Map();
  for(const match of source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|\bconst\s+\w+\s+(\w+)\s*=/g))if(match[1])seen.set(match[1],(seen.get(match[1])||0)+1);
  const twice=[...seen].filter(([,count])=>count>1).map(([name])=>name);
  if(!twice.length)return source;
  let depth=0,at=0,output='';const kept=new Set();
  const pattern=new RegExp('/\\*[\\s\\S]*?\\*/|//[^\\n]*|\\bconst\\s+\\w+\\s+('+twice.join('|')+')\\s*=[^;]*;|[{}]','g');let match;
  while((match=pattern.exec(source))){
    if(match[0].startsWith('/'))continue;
    if(match[0]==='{')depth++;else if(match[0]==='}')depth--;
    else if(!depth){
      if(kept.has(match[1])){output+=source.slice(at,match.index);at=pattern.lastIndex;}
      else kept.add(match[1]);
    }
  }
  return output+source.slice(at);
}
const GLSL_SHADOW_COMPARE=`vec4 wgpuShadowCompare(sampler2D image,vec3 position){return vec4(step(position.z,texture(image,position.xy).x));}
`;
function glslPlainShadowCalls(source){
  return source.replace(/\bshadow2D\s*\(\s*(\w+)\s*,/g,(whole,name)=>new RegExp('\\buniform\\s+sampler2D\\s+'+name+'\\b').test(source)?'wgpuShadowCompare('+name+',':whole);
}
function glslFullscreenUnknownAttribute(source){
  const known=/^(?:mc_|va[A-Z]|iris_|gl_|at_(?:tangent|midBlock|velocity)$)/;
  const declaration=/^[ \t]*(?:attribute|in)\s+(vec[234]|float)\s+(\w+)\s*;[ \t]*$/gm;
  for(const [whole,type,name] of [...source.matchAll(declaration)]){
    if(known.test(name))continue;
    const rest=source.replace(whole,'');
    if(!new RegExp('\\b'+name+'\\b').test(rest))continue;
    const value={vec4:'gl_MultiTexCoord0',vec3:'gl_MultiTexCoord0.xyz',vec2:'gl_MultiTexCoord0.xy',float:'gl_MultiTexCoord0.x'}[type];
    return rest.replace(new RegExp('\\b'+name+'\\b','g'),'('+value+')');
  }
  return source;
}
function glslFullscreenMainSampler(source,path){
  if(!/(?:^|\/)(?:composite|deferred|final|prepare|begin)[^/]*\.(?:fsh|vsh|csh)$/.test(String(path)))return source;
  if(/\.vsh$/.test(String(path)))source=glslFullscreenUnknownAttribute(source);
  source=source.replace(/\bgl_FragDepth\s*=\s*[^;]+;/g,';');
  for(const name of ['texture','tex','gtexture','u_MainSampler']){
    const declaration=new RegExp('\\buniform\\s+sampler2D\\s+'+name+'\\s*;');
    if(!declaration.test(source))continue;
    const own=/\buniform\s+sampler2D\s+colortex0\s*;/.test(source);
    source=source.replace(declaration,own?'':'uniform sampler2D colortex0;').replace(new RegExp('\\b'+name+'\\b(?!\\s*\\()','g'),'colortex0');
  }
  return source;
}
function glslFloatBitSamplers(source,formats){
  if(!/\buintBitsToFloat\b/.test(source))return source;
  const isFloat=name=>{
    const colortex=/^colortex(\d+)$/.exec(name);
    if(colortex)return !/(?:ui|i)$/i.test(formats?.[colortex[1]]||'rgba8');
    return /^(?:shadowtex\d*|shadowcolor\d*|depthtex\d*|noisetex|normals|specular|gtexture|texture|lightmap)$/.test(name);
  };
  let changed=false;
  source=source.replace(/\buniform\s+usampler2D\s+(\w+)\s*;/g,(whole,name)=>{if(!isFloat(name))return whole;changed=true;return 'uniform sampler2D '+name+';';});
  if(!changed)return source;
  return source.replace(/\busampler2D(\s+\w+\s*[,)])/g,'sampler2D$1').replace(/\buintBitsToFloat\b/g,'wgpuBitsToFloat');
}
function glslQueryLod(source,stage){
  if(!source.includes('textureQueryLod'))return source;
  const calls=/\btextureQueryLod\s*\(/g;let match,at=0,output='';
  while((match=calls.exec(source))){
    const parsed=callArguments(source,calls.lastIndex);if(!parsed)continue;
    const [args,end]=parsed;
    output+=source.slice(at,match.index)+(stage==='fragment'?`wgpuQueryLod((${args[1]})*vec2(textureSize(${args[0]},0)))`:'vec2(0.0)');at=end;calls.lastIndex=end;
  }
  return output+source.slice(at);
}
function glslSelfNamedLocals(source){
  const declaration=/\b(?:float|int|uint|bool|[iu]?vec[234]|mat[234])\s+(\w+)\s*=\s*\1\s*\(/g;
  let match;
  while((match=declaration.exec(source))){
    let depth=0,end=match.index;
    for(;end<source.length&&depth>=0;end++)if(source[end]==='{')depth++;else if(source[end]==='}')depth--;
    const scope=source.slice(match.index,end).replace(new RegExp('(?<![.\\w])'+match[1]+'\\b(?!\\s*\\()','g'),'wgpuLocal_'+match[1]);
    source=source.slice(0,match.index)+scope+source.slice(end);
    declaration.lastIndex=match.index+1;
  }
  return source;
}
function glslLocalsHidingBuiltins(source){
  const declaration=/\b(?:float|int|uint|bool|[iu]?vec[234]|mat[234])\s+(step|distance|length|mix|min|max|smoothstep|clamp|dot|cross|floor|ceil|fract|sign|abs|pow|exp|log|sqrt|sin|cos|tan|mod|normalize|reflect|refract|radians|degrees|round|trunc)\s*[=;,]/g;
  let match;
  while((match=declaration.exec(source))){
    let depth=0,end=match.index;
    for(;end<source.length&&depth>=0;end++)if(source[end]==='{')depth++;else if(source[end]==='}')depth--;
    const scope=source.slice(match.index,end);
    if(!new RegExp('(?<![.\\w])'+match[1]+'\\s*\\(').test(scope))continue;
    source=source.slice(0,match.index)+scope.replace(new RegExp('(?<![.\\w])'+match[1]+'\\b(?!\\s*\\()','g'),'wgpuLocal_'+match[1])+source.slice(end);
    declaration.lastIndex=match.index+1;
  }
  return source;
}
const GLSL_INT_UNIFORMS=/^(?:heldBlockLightValue2?|heldItemId2?|worldDay|worldTime|moonPhase|frameCounter|isEyeInWater|entityId|blockEntityId|currentRenderedItemId|hideGUI|fogMode|fogShape|biome|biome_category|biome_precipitation|renderStage)$/;
function glslMatchUniformTypes(vs,fs){
  const declared=(source,type)=>new Set([...source.matchAll(new RegExp('\\buniform\\s+'+type+'\\s+(\\w+)\\s*;','g'))].map(match=>match[1]));
  const retype=(source,name,from,to)=>source.replace(new RegExp('\\buniform\\s+'+from+'\\s+'+name+'\\s*;'),'uniform '+to+' WGPU_NAME;').replace(new RegExp('\\b'+name+'\\b','g'),from+'('+name+')').replace('WGPU_NAME',name);
  const fix=(floats,ints)=>{for(const name of declared(floats,'float'))if(declared(ints,'int').has(name)){
    if(GLSL_INT_UNIFORMS.test(name))floats=retype(floats,name,'float','int');else ints=retype(ints,name,'int','float');
  }return [floats,ints];};
  const [fsFloat,vsInt]=fix(fs,vs);
  const [vsFloat,fsInt]=fix(vsInt,fsFloat);
  return [vsFloat,fsInt];
}
let glslEngineUniformText=null;
function glslEngineSetsUniform(name){
  if(name==='alphaTestRef')return true;
  try{glslEngineUniformText??=[setUniforms,bindPropertyUniforms,irisUniformState].map(String).join(' ');}catch(error){return true;}
  return new RegExp('\\b'+name+'\\b').test(glslEngineUniformText);
}
function glslDropUnusedSamplers(source){
  for(const match of [...source.matchAll(/\buniform\s+[iu]?sampler\w+\s+(\w+)\s*;/g)])
    if(!new RegExp('\\b'+match[1]+'\\b').test(source.replace(match[0],'')))source=source.replace(match[0],'');
  return source;
}
function glslWriteOnlyImages(source){
  return source.replace(/(\blayout\s*\([^)]*\)\s*uniform\s+)((?:coherent\s+|volatile\s+|restrict\s+)*[iu]?image\w+\s+(\w+)\s*;)/g,(whole,start,rest,name)=>
    new RegExp('\\b(?:imageLoad|imageAtomic\\w*)\\s*\\(\\s*'+name+'\\b').test(source)?whole:start+'writeonly '+rest);
}
function glslDropBuiltinCopies(source){
  const forms={step:['T,T','float,T'],smoothstep:['T,T,T','float,float,T'],clamp:['T,T,T','T,float,float'],min:['T,T','T,float'],max:['T,T','T,float'],mod:['T,T','T,float'],mix:['T,T,T','T,T,float']};
  const header=/\b(float|vec[234])\s+(step|smoothstep|clamp|min|max|mod|mix)\s*\(([^()]*)\)\s*\{/g;
  let match,at=0,output='';
  while((match=header.exec(source))){
    const types=match[3].split(',').map(part=>part.trim().split(/\s+/).filter(word=>!/^(?:in|const|highp|mediump|lowp)$/.test(word))[0]);
    if(!forms[match[2]].includes(types.map(type=>type===match[1]&&match[1]!=='float'?'T':type).join(','))&&!(match[1]==='float'&&types.every(type=>type==='float')&&types.length===forms[match[2]][0].split(',').length))continue;
    let depth=1,end=header.lastIndex;
    for(;end<source.length&&depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
    output+=source.slice(at,match.index);at=end;header.lastIndex=end;
  }
  return output+source.slice(at);
}

function glslDropStraySemicolons(source){
  const tokens=glslTokens(source);
  let depth=0,last=';',body=false;
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i];
    if(glslIsSpace(token))continue;
    if(token==='/'&&tokens[i+1]==='/'){while(i<tokens.length&&tokens[i]!=='\n')i++;continue;}
    if(token==='{'){if(!depth)body=last===')';depth++;}
    else if(token==='}'){depth--;if(!depth){last=body?';':'}';continue;}}
    else if(token===';'&&!depth&&last===';'){tokens[i]='';continue;}
    if(!depth)last=token;
  }
  return tokens.join('');
}
function glslLowerModulo(source){
  if(!source.includes('%'))return source;
  const tokens=glslTokens(source);let used=false;
  const blank=token=>token!==undefined&&glslIsSpace(token);
  const leftStart=at=>{
    let i=at-1;
    for(;;){
      while(i>=0&&blank(tokens[i]))i--;
      for(;;){
        if(tokens[i]===')'||tokens[i]===']'){const closing=tokens[i],opening=closing===')'?'(':'[';let depth=0;for(;i>=0;i--){if(tokens[i]===closing)depth++;else if(tokens[i]===opening&&--depth===0)break;}i--;while(i>=0&&blank(tokens[i]))i--;if(glslIsName(tokens[i]||'')&&closing===')'&&!/^(?:return|else|case)$/.test(tokens[i])){i--;while(i>=0&&blank(tokens[i]))i--;if(tokens[i]==='.'){i--;while(i>=0&&blank(tokens[i]))i--;continue;}break;}if(closing===']')continue;break;}
        if(glslIsName(tokens[i]||'')||/^[.\d]/.test(tokens[i]||'')){i--;while(i>=0&&blank(tokens[i]))i--;if(tokens[i]==='.'){i--;while(i>=0&&blank(tokens[i]))i--;continue;}break;}
        break;
      }
      if((tokens[i]==='*'||tokens[i]==='/')&&tokens[i+1]!=='='){i--;continue;}
      break;
    }
    let start=i+1;while(blank(tokens[start]))start++;
    return start;
  };
  const rightEnd=at=>{
    let i=at+1;
    while(blank(tokens[i]))i++;
    while(tokens[i]==='-'||tokens[i]==='+'||tokens[i]==='!'||tokens[i]==='~'){i++;while(blank(tokens[i]))i++;}
    for(;;){
      if(tokens[i]==='('||tokens[i]==='['){const opening=tokens[i],closing=opening==='('?')':']';let depth=0;for(;i<tokens.length;i++){if(tokens[i]===opening)depth++;else if(tokens[i]===closing&&--depth===0)break;}i++;}
      else if(glslIsName(tokens[i]||'')||/^[.\d]/.test(tokens[i]||''))i++;
      else break;
      let j=i;while(blank(tokens[j]))j++;
      if(tokens[j]==='('||tokens[j]==='['){i=j;continue;}
      if(tokens[j]==='.'){i=j+1;while(blank(tokens[i]))i++;continue;}
      break;
    }
    return i;
  };
  for(let at=0;at<tokens.length;at++){
    if(tokens[at]!=='%')continue;
    used=true;
    if(tokens[at+1]==='='){
      let start=at-1;while(start>=0&&!/^[;{}]$/.test(tokens[start])&&tokens[start]!==')')start--;
      const a=tokens.slice(start+1,at).join('').trim();
      let end=at+2;while(end<tokens.length&&tokens[end]!==';')end++;
      const b=tokens.slice(at+2,end).join('').trim();
      tokens.splice(start+1,end-start-1,' '+a+' = wgpuMod('+a+', '+b+')');
      at=start+1;continue;
    }
    const left=leftStart(at),right=rightEnd(at);
    const a=tokens.slice(left,at).join('').trim(),b=tokens.slice(at+1,right).join('').trim();
    tokens.splice(left,right-left,'wgpuMod('+a+', '+b+')');
    at=left;
  }
  return used?glslPlaceAfterStructs(tokens.join('')):source;
}
function glslPlaceAfterStructs(source){return GLSL_INT_MOD+source;}
function glslGlobalScope(source){
  let out='',braces=0,parens=0;
  for(const c of source){
    if(c==='{')braces++;
    else if(c==='}'){braces--;if(!braces)out+=';';}
    else if(!braces){
      if(c==='('){if(!parens)out+='(';parens++;}
      else if(c===')'){parens--;if(!parens)out+=')';}
      else if(!parens)out+=c;
    }
  }
  return out;
}
function glslLegacyPrelude(source,stage){
  const global=glslGlobalScope(source);
  const lines=[
    'uniform mat4 mc_ModelViewMatrix;','uniform mat4 mc_ProjectionMatrix;','uniform mat4 mc_ModelViewProjectionMatrix;','uniform mat3 mc_NormalMatrix;','uniform mat4 mc_TextureMatrix[2];',
    'uniform mat4 wgpuIrisModelView;','uniform mat4 wgpuIrisModelViewProjection;','uniform vec3 wgpuVertexOffset;',
    'uniform vec3 fogColor;','uniform float fogStart;','uniform float fogEnd;','uniform float fogDensity;',
    'uniform int dhRenderDistance;','uniform mat4 dhProjection;','uniform mat4 dhProjectionInverse;','uniform mat4 dhPreviousProjection;','uniform mat4 dhPreviousProjectionInverse;','uniform mat4 dhModelView;','uniform mat4 dhModelViewInverse;','uniform mat4 dhPreviousModelView;','uniform mat4 dhPreviousModelViewInverse;','uniform float dhZnear;','uniform float dhZfar;','uniform sampler2D dhDepthTex;','uniform sampler2D dhDepthTex0;','uniform sampler2D dhDepthTex1;'
  ].filter(entry=>{
    const name=/(\w+)(?:\[\d+\])?;$/.exec(entry)[1];
    return !new RegExp('\\b(?:float|int|uint|bool|[iub]?vec[234]|mat[234](?:x[234])?|sampler\\w*)\\s+(?:\\w+(?:\\[[^\\]]*\\])?\\s*(?:=[^;,]*)?,\\s*)*'+name+'\\s*(?:\\[[^\\]]*\\]\\s*)?[=;,(]').test(global);
  });
  if(stage==='vertex'){
    lines.push('in vec4 mc_Vertex;','in vec3 mc_Normal;','in vec4 mc_MultiTexCoord0;','in vec4 mc_MultiTexCoord1;','in vec4 mc_Color;','in int dhMaterialId;');
    if(/\bwgpu_FrontColor\b/.test(source))lines.push('out vec4 wgpu_FrontColor;');
    lines.push('#define wgpuIrisVertex (mc_Vertex - vec4(wgpuVertexOffset, 0.0))');
  }else if(stage==='fragment'){
    if(/\bwgpu_FrontColor\b/.test(source))lines.push('in vec4 wgpu_FrontColor;');
    if(/\bwgpuFragVertex\b/.test(source))lines.push('in vec3 wgpuFragVertex;');
    for(let index=0;index<8;index++)if(!new RegExp('\\bout\\s+\\w+\\s+outColor'+index+'\\b').test(source))lines.push('layout(location = '+index+') out vec4 outColor'+index+';');
    if(!/\b(?:[iu]?vec[234]|float|int)\s+outColor\b/.test(source))lines.push('#define outColor outColor0');
  }
  return lines.join('\n')+'\n';
}
