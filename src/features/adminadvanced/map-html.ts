// The office map's page: Leaflet + OpenStreetMap tiles, the same map the website draws (OsmMap,
// dash.html:3634). It runs inside a WebView on a phone (map-frame.tsx) and an iframe on web
// (map-frame.web.tsx), and talks to the screen with small JSON messages:
//
//   screen → map  { type: 'state', fences, pin, me, colors, fit }   redraw (fit = refit the view)
//   map → screen  { type: 'ready' } · { type: 'pick', lat, lng } · { type: 'error', message }
//
// Leaflet comes from the DASH website's own copy (/public_assets/vendor/leaflet/), else from unpkg.

import { DASH_URL } from '@/config';

export type MapFence = { id: string; name: string; lat: number; lng: number; radius_m: number; selected?: boolean };
export type MapPin = { lat: number; lng: number; radius_m: number };
export type MapMe = { lat: number; lng: number; accuracy: number };
export type MapColors = { fence: string; pin: string; me: string; ink: string; surface: string };
export type MapState = { type: 'state'; fences: MapFence[]; pin: MapPin | null; me: MapMe | null; colors: MapColors; fit: boolean };
export type MapEvent = { type: 'ready' } | { type: 'pick'; lat: number; lng: number } | { type: 'error'; message: string };

export const LEAFLET_VERSION = '1.9.4';

export function mapHtml() {
  const own = `${DASH_URL}/public_assets/vendor/leaflet/`;
  const cdn = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/`;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body,#m{height:100%;margin:0;padding:0;background:transparent}
.leaflet-container{font:12px/1.4 -apple-system,system-ui,sans-serif}
#e{display:none;position:absolute;inset:0;align-items:center;justify-content:center;padding:16px;text-align:center;font:14px system-ui,sans-serif;color:#8a8a8a}</style>
</head><body><div id="m"></div><div id="e"></div>
<script>
(function(){
  var OWN=${JSON.stringify(own)}, CDN=${JSON.stringify(cdn)};
  function send(m){var s=JSON.stringify(m);
    if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s);} else if(window.parent&&window.parent!==window){window.parent.postMessage({__dashMap:true,data:s},'*');}}
  function css(href){var l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l);}
  function js(src,ok,bad){var s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=bad;document.head.appendChild(s);}
  var map=null, layer=null, pending=null;
  function draw(st){
    if(!map){pending=st;return;}
    var L=window.L, c=st.colors||{};
    layer.clearLayers(); var all=[];
    (st.fences||[]).forEach(function(f){
      var col=f.selected?(c.pin||'#c33b02'):(c.fence||'#c33b02');
      var circ=L.circle([f.lat,f.lng],{radius:f.radius_m,color:col,weight:f.selected?3:2,fillColor:col,fillOpacity:f.selected?.08:.14,dashArray:f.selected?'6 6':null}).bindTooltip(f.name+' · '+f.radius_m+' m');
      layer.addLayer(circ); all.push(circ);
      layer.addLayer(L.circleMarker([f.lat,f.lng],{radius:4,color:col,fillColor:col,fillOpacity:1}));
    });
    if(st.me){var a=L.circle([st.me.lat,st.me.lng],{radius:Math.max(st.me.accuracy||0,5),color:c.me||'#2563eb',weight:1,fillColor:c.me||'#2563eb',fillOpacity:.12});
      layer.addLayer(a); all.push(a);
      layer.addLayer(L.circleMarker([st.me.lat,st.me.lng],{radius:7,color:'#fff',weight:2,fillColor:c.me||'#2563eb',fillOpacity:1}).bindTooltip('You'));}
    if(st.pin){var p=L.circle([st.pin.lat,st.pin.lng],{radius:st.pin.radius_m||100,color:c.pin||'#c33b02',weight:2,fillColor:c.pin||'#c33b02',fillOpacity:.18});
      layer.addLayer(p); all.push(p);
      layer.addLayer(L.circleMarker([st.pin.lat,st.pin.lng],{radius:7,color:'#fff',weight:2,fillColor:c.pin||'#c33b02',fillOpacity:1}));}
    if(st.fit&&all.length){try{map.fitBounds(L.featureGroup(all).getBounds().pad(.25),{maxZoom:17,animate:false});}catch(e){}}
  }
  window.__dashMap=function(m){if(m&&m.type==='state')draw(m);};
  window.addEventListener('message',function(e){var d=e.data;try{if(typeof d==='string')d=JSON.parse(d);}catch(x){return;} if(d&&d.type==='state')draw(d);});
  document.addEventListener('message',function(e){try{var d=JSON.parse(e.data);if(d&&d.type==='state')draw(d);}catch(x){}});
  function start(){
    var L=window.L;
    map=L.map('m',{zoomControl:true,attributionControl:true}).setView([17.385,78.4867],12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
    layer=L.layerGroup().addTo(map);
    map.on('click',function(e){send({type:'pick',lat:e.latlng.lat,lng:e.latlng.lng});});
    send({type:'ready'});
    if(pending){var p=pending;pending=null;draw(p);}
  }
  function fail(){var e=document.getElementById('e');e.style.display='flex';e.textContent='The map could not load. Check your internet connection.';send({type:'error',message:'The map could not load.'});}
  css(OWN+'leaflet.css');
  js(OWN+'leaflet.js',start,function(){css(CDN+'leaflet.css');js(CDN+'leaflet.js',start,fail);});
})();
</script></body></html>`;
}
