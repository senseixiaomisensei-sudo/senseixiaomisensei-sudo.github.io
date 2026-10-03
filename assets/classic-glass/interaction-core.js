// Copied from the user-supplied craft-fluid-frontends/scripts/interaction-core.mjs.
/** Small, framework-independent primitives. Copy into the target project. */
export const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function criticalSpring(value,velocity,target,dt,rate=18){
  if(![value,velocity,target,dt,rate].every(Number.isFinite)||dt<0||rate<=0)
    throw new RangeError('Spring inputs must be finite; dt >= 0 and rate > 0.');
  const delta=value-target,j=velocity+rate*delta,e=Math.exp(-rate*dt);
  return {value:target+(delta+j*dt)*e,velocity:(velocity-rate*j*dt)*e};
}

/** Calculate once at pointerdown and retain for that gesture. Tune for the UI. */
export function expansionThreshold(width,height,{ratio=.85,min=180,max=320}={}){
  if(![width,height,ratio,min,max].every(Number.isFinite)||width<=0||height<=0||ratio<=0||min<0||max<min)
    throw new RangeError('Invalid gesture dimensions or threshold bounds.');
  return clamp(Math.min(width,height)*ratio,min,max);
}

export function dragAxis(dx,dy,currentAxis=null,dominance=1.35){
  if(![dx,dy,dominance].every(Number.isFinite)||dominance<1)
    throw new RangeError('Invalid drag direction inputs.');
  if(currentAxis!==null&&!['horizontal','vertical'].includes(currentAxis))
    throw new RangeError('Unknown axis.');
  if(dx===0&&dy===0)return currentAxis;
  const ax=Math.abs(dx),ay=Math.abs(dy),candidate=ax>=ay?'horizontal':'vertical';
  if(currentAxis&&candidate!==currentAxis&&Math.max(ax,ay)<Math.min(ax,ay)*dominance)return currentAxis;
  return candidate;
}

function validateOrder(order){
  if(!Array.isArray(order)||new Set(order).size!==order.length)
    throw new TypeError('Order must contain unique stable IDs.');
}
export function visualPosition(order,selectedId){
  validateOrder(order);if(!order.length)return {position:0,total:0};
  const index=order.indexOf(selectedId);
  if(index<0)throw new RangeError('Selected ID is absent from the visual order.');
  return {position:index+1,total:order.length};
}
export function neighborId(order,selectedId,delta=1){
  validateOrder(order);if(!Number.isInteger(delta))throw new RangeError('Delta must be an integer.');
  if(!order.length)return null;
  const {position}=visualPosition(order,selectedId);
  return order[((position-1+delta)%order.length+order.length)%order.length];
}

/** Bounds for 2D cards rotated about their centers. r is degrees. */
export function cardBottom({y,w,h,r=0}){
  if(![y,w,h,r].every(Number.isFinite)||w<0||h<0)throw new RangeError('Invalid card bounds.');
  const a=Math.abs(r)*Math.PI/180;
  return y+h+(Math.abs(w*Math.sin(a))+Math.abs(h*Math.cos(a))-h)/2;
}
export function deckExtent(cards,{targetHeight=0,gap=16,heldId=null}={}){
  if(!Number.isFinite(targetHeight)||!Number.isFinite(gap)||targetHeight<0||gap<0)
    throw new RangeError('Invalid container bounds.');
  return Math.max(targetHeight,...cards.filter(c=>c.id!==heldId&&(c.opacity??1)>.05).map(c=>cardBottom(c)+gap));
}

/** Exact underdamped spring. Carry value and velocity through interruptions. */
export function elasticSpring(value,velocity,target,dt,{omega=26,zeta=.72}={}){
  if(![value,velocity,target,dt,omega,zeta].every(Number.isFinite)||dt<0||omega<=0||zeta<=0||zeta>=1)
    throw new RangeError('Use finite inputs, dt >= 0, omega > 0, 0 < zeta < 1.');
  const d=value-target,a=zeta*omega,w=omega*Math.sqrt(1-zeta*zeta),b=(velocity+a*d)/w,e=Math.exp(-a*dt),c=Math.cos(w*dt),s=Math.sin(w*dt);
  return {value:target+e*(d*c+b*s),velocity:e*((-a*d+w*b)*c+(-a*b-w*d)*s)};
}
