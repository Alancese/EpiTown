/* The map uses the approved GLB geometry and its embedded artwork, without a CDN. */
(function(scope){
  'use strict';
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  function bytes(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
  function parseGLB(buffer){
    const view=new DataView(buffer);
    if(buffer.byteLength<28||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength)throw Error('Invalid GLB');
    const jsonLength=view.getUint32(12,true),binHeader=20+jsonLength;
    if(view.getUint32(16,true)!==0x4e4f534a||binHeader+8>buffer.byteLength||view.getUint32(binHeader+4,true)!==0x004e4942)throw Error('Invalid GLB chunks');
    const data=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jsonLength))),base=binHeader+8;
    if(base+view.getUint32(binHeader,true)!==buffer.byteLength)throw Error('Invalid binary size');
    function attribute(index,components){
      const a=data.accessors[index],b=a&&data.bufferViews[a.bufferView];
      if(!a||!b||a.componentType!==5126||a.type!=='VEC'+components||a.count%3||!a.count)throw Error('Unsupported mesh');
      const offset=base+(b.byteOffset||0)+(a.byteOffset||0),stride=b.byteStride||components*4;
      if(offset+(a.count-1)*stride+components*4>base+(b.byteOffset||0)+b.byteLength||base+(b.byteOffset||0)+b.byteLength>buffer.byteLength)throw Error('Mesh exceeds buffer');
      const result=new Float32Array(a.count*components);
      for(let i=0;i<a.count;i++)for(let j=0;j<components;j++){
        const value=view.getFloat32(offset+i*stride+j*4,true);
        if(!Number.isFinite(value))throw Error('Nonfinite mesh');
        result[i*components+j]=value;
      }
      return result;
    }
    const primitives=data.meshes[0].primitives;
    if(primitives.length!==2)throw Error('Expected solid and artwork meshes');
    const arrays=primitives.map((p,index)=>{
      if(p.indices!==undefined||(p.mode!==undefined&&p.mode!==4))throw Error('Unsupported primitive');
      const textured=index===1,stride=textured?8:9;
      const pos=attribute(p.attributes.POSITION,3),normal=attribute(p.attributes.NORMAL,3),detail=attribute(p.attributes[textured?'TEXCOORD_0':'COLOR_0'],textured?2:3);
      const count=pos.length/3;
      if(normal.length/3!==count||detail.length/(textured?2:3)!==count)throw Error('Mismatched attributes');
      const result=new Float32Array(count*stride);
      for(let i=0;i<count;i++){
        result.set(pos.subarray(i*3,i*3+3),i*stride);result.set(normal.subarray(i*3,i*3+3),i*stride+3);
        for(let j=0;j<(textured?2:3);j++){
          let value=detail[i*(textured?2:3)+j];
          if(!textured)value=value<=.0031308?12.92*value:1.055*Math.pow(value,1/2.4)-.055;
          result[i*stride+6+j]=value;
        }
      }
      return result;
    });
    const img=data.images[0],b=data.bufferViews[img.bufferView];
    if(img.mimeType!=='image/png'||!b||base+(b.byteOffset||0)+b.byteLength>buffer.byteLength)throw Error('Invalid embedded artwork');
    return {solid:arrays[0],detail:arrays[1],png:new Uint8Array(buffer,base+(b.byteOffset||0),b.byteLength)};
  }
  function cameraPoint(point,camera){
    const p=point.map((v,i)=>v-camera.target[i]),s=Math.sin(camera.yaw),c=Math.cos(camera.yaw),sp=Math.sin(camera.pitch),cp=Math.cos(camera.pitch);
    const x=p[0]*c-p[2]*s,z=p[0]*s+p[2]*c;
    return [x,p[1]*cp-z*sp,p[1]*sp+z*cp];
  }
  function fit(bounds,width,height,camera){
    let extentX=0,extentY=0;
    for(const x of [bounds[0][0],bounds[1][0]])for(const y of [bounds[0][1],bounds[1][1]])for(const z of [bounds[0][2],bounds[1][2]]){
      const p=cameraPoint([x,y,z],camera);extentX=Math.max(extentX,Math.abs(p[0]));extentY=Math.max(extentY,Math.abs(p[1]));
    }
    return .88*Math.min(width/(2*extentX||1),height/(2*extentY||1));
  }
  function matches(building,category,query){return (category==='全部'||category===building.category)&&(building.id+' '+building.name+' '+building.category).toLowerCase().includes(query.trim().toLowerCase());}
  const api={clamp,bytes,parseGLB,cameraPoint,fit,matches};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.EpiTownCore=api;
})(typeof window!=='undefined'?window:globalThis);
