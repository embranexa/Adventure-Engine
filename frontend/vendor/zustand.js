/* zustand — vendored from https://esm.sh/zustand@4.5.2/X-ZXJlYWN0/es2022/zustand.bundle.mjs by scripts/vendor_deps.py */
/* esm.sh - zustand@4.5.2 */
import*as __0$ from"react";var require=n=>{const e=m=>typeof m.default<"u"?m.default:m,c=m=>Object.assign({__esModule:true},m);switch(n){case"react":return e(__0$);default:console.error('module "'+n+'" not found');return null;}};
var z=Object.create;var D=Object.defineProperty;var C=Object.getOwnPropertyDescriptor;var W=Object.getOwnPropertyNames;var N=Object.getPrototypeOf,k=Object.prototype.hasOwnProperty;var x=(e=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(e,{get:(t,n)=>(typeof require<"u"?require:t)[n]}):e)(function(e){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')});var E=(e,t)=>()=>{try{return t||e((t={exports:{}}).exports,t),t.exports}catch(n){throw t=0,n}};var F=(e,t,n,o)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of W(t))!k.call(e,r)&&r!==n&&D(e,r,{get:()=>t[r],enumerable:!(o=C(t,r))||o.enumerable});return e};var _=(e,t,n)=>(n=e!=null?z(N(e)):{},F(t||!e||!e.__esModule?D(n,"default",{value:e,enumerable:!0}):n,e));var O=E(b=>{"use strict";var f=x("react");function B(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var L=typeof Object.is=="function"?Object.is:B,U=f.useState,G=f.useEffect,H=f.useLayoutEffect,J=f.useDebugValue;function K(e,t){var n=t(),o=U({inst:{value:n,getSnapshot:t}}),r=o[0].inst,u=o[1];return H(function(){r.value=n,r.getSnapshot=t,y(r)&&u({inst:r})},[e,n,t]),G(function(){return y(r)&&u({inst:r}),e(function(){y(r)&&u({inst:r})})},[e]),J(n),n}function y(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!L(e,n)}catch{return!0}}function Q(e,t){return t()}var X=typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"?Q:K;b.useSyncExternalStore=f.useSyncExternalStore!==void 0?f.useSyncExternalStore:X});var q=E((ve,j)=>{"use strict";j.exports=O()});var V=E(I=>{"use strict";var S=x("react"),Y=q();function Z(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var $=typeof Object.is=="function"?Object.is:Z,ee=Y.useSyncExternalStore,te=S.useRef,ne=S.useEffect,re=S.useMemo,oe=S.useDebugValue;I.useSyncExternalStoreWithSelector=function(e,t,n,o,r){var u=te(null);if(u.current===null){var l={hasValue:!1,value:null};u.current=l}else l=u.current;u=re(function(){function v(i){if(!m){if(m=!0,s=i,i=o(i),r!==void 0&&l.hasValue){var a=l.value;if(r(a,i))return d=a}return d=i}if(a=d,$(s,i))return a;var h=o(i);return r!==void 0&&r(a,h)?a:(s=i,d=h)}var m=!1,s,d,c=n===void 0?null:n;return[function(){return v(t())},c===null?void 0:function(){return v(c())}]},[t,n,o,r]);var p=ee(e,u[0],u[1]);return ne(function(){l.hasValue=!0,l.value=p},[p]),oe(p),p}});var T=E((Ee,R)=>{"use strict";R.exports=V()});var g=e=>{let t,n=new Set,o=(s,d)=>{let c=typeof s=="function"?s(t):s;if(!Object.is(c,t)){let i=t;t=d??(typeof c!="object"||c===null)?c:Object.assign({},t,c),n.forEach(a=>a(t,i))}},r=()=>t,v={setState:o,getState:r,getInitialState:()=>m,subscribe:s=>(n.add(s),()=>n.delete(s)),destroy:()=>{(import.meta.env?import.meta.env.MODE:void 0)!=="production"&&console.warn("[DEPRECATED] The `destroy` method will be unsupported in a future version. Instead use unsubscribe function returned by subscribe. Everything will be garbage-collected if store is garbage-collected."),n.clear()}},m=t=e(o,r,v);return v},w=e=>e?g(e):g;var P=_(T(),1);import ue from"react";var{useDebugValue:se}=ue,{useSyncExternalStoreWithSelector:ie}=P.default,A=!1,ce=e=>e;function ae(e,t=ce,n){(import.meta.env?import.meta.env.MODE:void 0)!=="production"&&n&&!A&&(console.warn("[DEPRECATED] Use `createWithEqualityFn` instead of `create` or use `useStoreWithEqualityFn` instead of `useStore`. They can be imported from 'zustand/traditional'. https://github.com/pmndrs/zustand/discussions/1937"),A=!0);let o=ie(e.subscribe,e.getState,e.getServerState||e.getInitialState,t,n);return se(o),o}var M=e=>{(import.meta.env?import.meta.env.MODE:void 0)!=="production"&&typeof e!="function"&&console.warn("[DEPRECATED] Passing a vanilla store will be unsupported in a future version. Instead use `import { useStore } from 'zustand'`.");let t=typeof e=="function"?w(e):e,n=(o,r)=>ae(t,o,r);return Object.assign(n,t),n},le=e=>e?M(e):M,he=e=>((import.meta.env?import.meta.env.MODE:void 0)!=="production"&&console.warn("[DEPRECATED] Default export is deprecated. Instead use `import { create } from 'zustand'`."),le(e));export{le as create,w as createStore,he as default,ae as useStore};
/*! Bundled license information:

use-sync-external-store/cjs/use-sync-external-store-shim.production.min.js:
  (**
   * @license React
   * use-sync-external-store-shim.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.production.min.js:
  (**
   * @license React
   * use-sync-external-store-shim/with-selector.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
//# sourceMappingURL=zustand.bundle.mjs.map