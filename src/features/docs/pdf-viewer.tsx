// One page of a PDF on screen, through pdf.js 3.11.174 inside a WebFrame (the website's PdfPageViewer,
// dash.html:32408, and the same CDN build it loads). The draft never leaves the phone: the base64 is put
// into the page itself, never at a URL. Used to:
//   - place sign spots: a tap posts {page, x, y} as 0..1 fractions of the page — exactly what
//     vendor_agreements.js stores — and the spots are drawn back as numbered "Sign here" tags whose top-left
//     corner sits on the spot (where the signature's top-left goes, buildSignedAgreementPdf :32540);
//   - build a signed copy: every page rendered at 2×, the signatures drawn on their spots with the
//     website's labels, each page posted back as a JPEG (StampBuilder below).

import { type RefObject, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

import type { SignPosition } from '@/api/vendor';
import { WebFrame, type WebFrameHandle, type WebFrameMessage } from '@/features/docs/web-frame';
import { palette, radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

import { Banner, IconButton, Skeleton, Text } from '@/ui';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';

/** Strip a data URL to its base64. */
export const b64Of = (dataUrl: string) => String(dataUrl || '').replace(/^data:[^;,]*;base64,/, '');

/** The page's script: the bridge, pdf.js boot, render, taps, markers and the stamped build. */
function viewerHtml(b64: string, tappable: boolean) {
  // JSON.stringify keeps the string safe inside <script>; "</" is split so it can never close the tag.
  const data = JSON.stringify(b64).replace(/<\//g, '<\\/');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;padding:0;background:transparent;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
#wrap{position:relative;width:100%}
#c{display:block;width:100%;background:#fff;border-radius:12px;${tappable ? 'cursor:crosshair;' : ''}}
#layer{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none}
.m{position:absolute;font:600 11px -apple-system,Roboto,Arial,sans-serif;padding:3px 7px;border-radius:7px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.m.v{background:#ecfdf3;color:#166534;border:1.5px solid #16a34a}
.m.i{background:#fff1ea;color:#9a3412;border:1.5px solid #c33b02}
.m:before{content:'';position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:50%;background:currentColor}
#msg{font:13px -apple-system,Roboto,Arial,sans-serif;color:#b91c1c;padding:12px}
</style>
<script src="${PDFJS}/pdf.min.js"></script></head><body><div id="wrap"><canvas id="c"></canvas><div id="layer"></div></div><div id="msg"></div>
<script>
var B64=${data};var TAP=${tappable ? 'true' : 'false'};
var pdf=null,cur=1,markers=[],busy=false,want=null;
function send(m){var s=JSON.stringify(m);if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s);}else{parent.postMessage(s,'*');}}
function fail(t){document.getElementById('msg').textContent=t;send({type:'error',message:t});}
function bytes(){var raw=atob(B64);var out=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
async function boot(){
  if(!window.pdfjsLib)return fail('The PDF viewer could not load. Check the internet connection and try again.');
  pdfjsLib.GlobalWorkerOptions.workerSrc='${PDFJS}/pdf.worker.min.js';
  try{pdf=await pdfjsLib.getDocument({data:bytes()}).promise;}catch(e){return fail('This PDF could not be opened.');}
  send({type:'ready',pages:pdf.numPages});
  show(1);
}
async function show(n){
  if(!pdf)return;
  if(busy){want=n;return;}
  busy=true;
  try{
    cur=Math.min(Math.max(1,n|0),pdf.numPages);
    var page=await pdf.getPage(cur);
    var w=document.getElementById('wrap').clientWidth||360;
    var base=page.getViewport({scale:1});
    var dpr=Math.min(window.devicePixelRatio||1,2.5);
    var vp=page.getViewport({scale:(w/base.width)*dpr});
    var c=document.getElementById('c');c.width=Math.floor(vp.width);c.height=Math.floor(vp.height);
    await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
    draw();
    send({type:'page',page:cur,pages:pdf.numPages,ratio:base.height/base.width});
  }catch(e){fail('This page could not be shown.');}
  busy=false;
  if(want!==null){var p=want;want=null;if(p!==cur)show(p);}
}
function draw(){
  var layer=document.getElementById('layer');layer.innerHTML='';
  markers.forEach(function(m,i){
    if(m.page!==cur)return;
    var d=document.createElement('div');d.className='m '+(m.signer==='internal'?'i':'v');
    d.style.left=(m.x*100)+'%';d.style.top=(m.y*100)+'%';
    d.textContent=(i+1)+'. '+(m.label||'Sign here');
    layer.appendChild(d);
  });
}
document.getElementById('c').addEventListener('click',function(e){
  if(!TAP||!pdf)return;
  var r=e.target.getBoundingClientRect();
  var x=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width));
  var y=Math.min(1,Math.max(0,(e.clientY-r.top)/r.height));
  send({type:'tap',page:cur,x:Math.round(x*10000)/10000,y:Math.round(y*10000)/10000});
});
function img(src){return new Promise(function(ok){if(!src)return ok(null);var i=new Image();i.onload=function(){ok(i);};i.onerror=function(){ok(null);};i.src=src;});}
async function build(cmd){
  if(!pdf)return send({type:'buildError',message:'The agreement is still loading.'});
  try{
    var v=await img(cmd.vendorSig),n=await img(cmd.internalSig);
    var pos=cmd.positions||[];
    for(var pn=1;pn<=pdf.numPages;pn++){
      var page=await pdf.getPage(pn);
      var base=page.getViewport({scale:1});
      var vp=page.getViewport({scale:Math.min(2,1400/base.width)});
      var c=document.createElement('canvas');c.width=Math.floor(vp.width);c.height=Math.floor(vp.height);
      var ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
      await page.render({canvasContext:ctx,viewport:vp}).promise;
      pos.filter(function(p){return p.page===pn;}).forEach(function(p){
        var im=p.signer==='internal'?n:v;if(!im)return;
        var iw=Math.min(c.width*0.22,340);var ih=iw*((im.naturalHeight/im.naturalWidth)||0.45);
        var x=p.x*c.width,y=p.y*c.height;ctx.drawImage(im,x,y,iw,ih);
        var label=p.signer==='internal'?cmd.internalLabel:cmd.vendorLabel;
        if(label){ctx.font=Math.round(c.width*0.011)+'px Arial';ctx.fillStyle=p.signer==='internal'?'#9a3412':'#15803d';ctx.fillText('\\u2713 '+label,x,y+ih+16);}
      });
      send({type:'built',page:pn,pages:pdf.numPages,w:c.width,h:c.height,data:c.toDataURL('image/jpeg',0.85)});
    }
    send({type:'builtAll'});
  }catch(e){send({type:'buildError',message:'The signed copy could not be made.'});}
}
window.__cmd=function(c){if(!c)return;if(c.type==='page')show(c.page);else if(c.type==='markers'){markers=c.markers||[];draw();}else if(c.type==='build')build(c);};
function onMsg(e){try{var c=typeof e.data==='string'?JSON.parse(e.data):e.data;if(c&&c.__dash)window.__cmd(c);}catch(x){}}
window.addEventListener('message',onMsg);document.addEventListener('message',onMsg);
var rt=null;window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(function(){show(cur);},150);});
boot();
</script></body></html>`;
}

export type Marker = SignPosition & { label?: string };

/**
 * The page viewer. Controlled page; `markers` are every spot (all pages) — only this page's are drawn,
 * numbered by their place in the full list so "Spot 2" in the list below matches the tag.
 */
export function PdfPageView({
  b64,
  page,
  markers,
  onTap,
  onPages,
  frameRef,
  onFrameMessage,
}: {
  b64: string;
  page: number;
  markers?: Marker[];
  onTap?: (p: { page: number; x: number; y: number }) => void;
  onPages?: (n: number) => void;
  /** Lets a caller send its own commands (the stamped build). */
  frameRef?: RefObject<WebFrameHandle | null>;
  onFrameMessage?: (m: WebFrameMessage) => void;
}) {
  const own = useRef<WebFrameHandle>(null);
  const ref = frameRef ?? own;
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [html] = useState(() => viewerHtml(b64, !!onTap));

  // Keep the page and the tags in step with the props once the viewer is up.
  const markerJson = JSON.stringify(markers ?? []);
  useEffect(() => {
    if (ready) ref.current?.send({ type: 'page', page });
  }, [ready, page, ref]);
  useEffect(() => {
    if (ready) ref.current?.send({ type: 'markers', markers: JSON.parse(markerJson) });
  }, [ready, markerJson, ref]);

  const onMessage = (m: WebFrameMessage) => {
    if (m.type === 'ready') {
      setReady(true);
      onPages?.(Number(m.pages) || 1);
    } else if (m.type === 'page') {
      setShown(Number(m.page) || 1);
      const r = Number(m.ratio);
      if (Number.isFinite(r) && r > 0.2 && r < 5) setRatio(r);
    } else if (m.type === 'tap') {
      onTap?.({ page: Number(m.page) || 1, x: Number(m.x) || 0, y: Number(m.y) || 0 });
    } else if (m.type === 'error') {
      setError(String(m.message || 'This PDF could not be shown.'));
    }
    onFrameMessage?.(m);
  };

  const height = width ? Math.round(width * ratio) : 0;
  return (
    <View style={styles.wrap} onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      {error ? <Banner tone="danger" title="Couldn’t show the PDF" message={error} /> : null}
      {width ? (
        <View style={[styles.page, { height }]}>
          <WebFrame ref={ref} html={html} height={height} onMessage={onMessage} title={onTap ? 'Agreement page. Tap where the signature goes.' : 'Agreement page'} />
          {!shown && !error ? (
            <View style={styles.loading} pointerEvents="none">
              <Skeleton height={height} radius={radius.sm} />
              <Text variant="label" muted style={styles.loadingText}>
                Opening the PDF…
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Prev / next page under the viewer. */
export function PagePager({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) {
  if (pages <= 1) return null;
  return (
    <View style={styles.pager}>
      <IconButton accessibilityLabel="Previous page" disabled={page <= 1} onPress={() => onPage(Math.max(1, page - 1))}>
        <ChevronLeft color={page <= 1 ? palette.textFaint : palette.text} size={22} />
      </IconButton>
      <Text variant="label" muted>
        Page {page} of {pages}
      </Text>
      <IconButton accessibilityLabel="Next page" disabled={page >= pages} onPress={() => onPage(Math.min(pages, page + 1))}>
        <ChevronRight color={page >= pages ? palette.textFaint : palette.text} size={22} />
      </IconButton>
    </View>
  );
}

const styles = themedStyles(() => ({
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md },
  wrap: { gap: space.xs, width: '100%' },
  page: { borderRadius: radius.sm, overflow: 'hidden', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline },
  loading: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  loadingText: { position: 'absolute' },
}));
