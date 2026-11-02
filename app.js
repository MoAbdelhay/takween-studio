// ============================================================================
// TAKWEEN — design & engineering services, rendered in light
//
// Each service is a point-cloud sculpture (~45–60k points) whose HOME positions
// are sampled parametrically:
//   I    plan   — an AutoCAD drawing sheet: walls, door swings, dimensions
//   II   tower  — a wireframe building: slabs, mullions, podium, crown
//   III  combo  — a flat plan extruding upward into stacked floor plates
//   IV   chart  — a 3D bar chart with a trend line on a base grid
//   V    globe  — a lat/long wireframe globe wearing a </> glyph
//
// Points live in one big BufferGeometry; a per-vertex "assembly" uniform
// (0 = scattered dust, 1 = fully assembled) lerps each grain between a drifting
// dust cloud and its home. Scroll drives assembly per service; a curl-noise
// field (evaluated in the vertex shader) makes the dust breathe and lets the
// cursor stir it. Hold-to-focus tightens + brightens the whole cloud.
//
// No external models. Everything is math.
// ============================================================================

import * as THREE from 'three';

const canvas   = document.getElementById('scene');
const fallback = document.getElementById('fallback');
const focusRing= document.getElementById('focusRing');
const hallIdx  = document.getElementById('hallIdx');
const scrollCue= document.getElementById('scrollCue');
const live     = document.getElementById('live');
const reduce   = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- WebGL capability check -> graceful fallback -------------------------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  const gl = renderer.getContext();
  if (!gl) throw new Error('no gl');
} catch (e) {
  canvas.hidden = true;
  fallback.hidden = false;
  console.warn('TAKWEEN: WebGL unavailable, showing fallback.');
}

if (renderer) boot();

function boot() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x0b0a0c, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b0a0c, 0.045);

  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 7.4);

  // =========================================================================
  //  SAMPLING HELPERS — every sculpture is built from lines, rings and boxes
  // =========================================================================

  // points along a 3D segment with jitter radius `th`
  function seg3(pts, x0,y0,z0, x1,y1,z1, n, th = 0.012) {
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      pts.push(
        x0 + (x1-x0)*t + (Math.random()-0.5)*th,
        y0 + (y1-y0)*t + (Math.random()-0.5)*th,
        z0 + (z1-z0)*t + (Math.random()-0.5)*th
      );
    }
  }

  // rectangle outline in the XY plane at depth z
  function rectXY(pts, x0,y0,x1,y1, z, n, th) {
    const w = Math.abs(x1-x0), h = Math.abs(y1-y0), P = 2*(w+h) || 1;
    const nw = Math.round(n*w/P), nh = Math.round(n*h/P);
    seg3(pts, x0,y0,z, x1,y0,z, nw, th);
    seg3(pts, x0,y1,z, x1,y1,z, nw, th);
    seg3(pts, x0,y0,z, x0,y1,z, nh, th);
    seg3(pts, x1,y0,z, x1,y1,z, nh, th);
  }

  // rectangle outline in the XZ plane at height y
  function rectXZ(pts, x0,z0,x1,z1, y, n, th) {
    const w = Math.abs(x1-x0), d = Math.abs(z1-z0), P = 2*(w+d) || 1;
    const nw = Math.round(n*w/P), nd = Math.round(n*d/P);
    seg3(pts, x0,y,z0, x1,y,z0, nw, th);
    seg3(pts, x0,y,z1, x1,y,z1, nw, th);
    seg3(pts, x0,y,z0, x0,y,z1, nd, th);
    seg3(pts, x1,y,z0, x1,y,z1, nd, th);
  }

  // arc in the XY plane at depth z
  function arcXY(pts, cx,cy, r, a0,a1, z, n, th = 0.010) {
    for (let i = 0; i < n; i++) {
      const a = a0 + Math.random()*(a1-a0);
      pts.push(
        cx + Math.cos(a)*r + (Math.random()-0.5)*th,
        cy + Math.sin(a)*r + (Math.random()-0.5)*th,
        z + (Math.random()-0.5)*th
      );
    }
  }

  function toCloud(pts) { return { pos: new Float32Array(pts), n: pts.length/3 }; }

  // =========================================================================
  //  HERO — the brand name itself, rasterised to a canvas and sampled into
  //  ~46k grains of light. Regenerated in the right script when the language
  //  toggles (TAKWEEN ⇄ تكوين).
  // =========================================================================
  const HERO_N = 46000;
  function wordmark(text, fontSpec, spacing) {
    const cw = 1100, ch = 300;
    const cnv = document.createElement('canvas');
    cnv.width = cw; cnv.height = ch;
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    try { ctx.letterSpacing = spacing; } catch (e) {}
    ctx.font = fontSpec;
    ctx.fillText(text, cw/2, ch/2);
    const img = ctx.getImageData(0, 0, cw, ch).data;
    const filled = [];
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++)
        if (img[(y*cw + x)*4 + 3] > 110) filled.push(x, y);
    const pts = [];
    const m = filled.length/2 || 1;
    const S = 5.2/cw;                       // world units per canvas pixel
    for (let i = 0; i < HERO_N; i++) {
      const k = (Math.random()*m) | 0;
      const X = (filled[k*2]   - cw/2) * S + (Math.random()-0.5)*0.013;
      const Y = -(filled[k*2+1] - ch/2) * S + (Math.random()-0.5)*0.013;
      // a gentle standing wave in depth so the flat glyphs catch parallax
      pts.push(X, Y, Math.sin(X*1.6)*0.07 + (Math.random()-0.5)*0.09);
    }
    return toCloud(pts);
  }
  const heroFont = l => l === 'ar' ? '700 205px "Cairo", sans-serif' : '500 172px "Space Grotesk", sans-serif';
  const heroText = l => l === 'ar' ? 'تكوين' : 'TAKWEEN';
  const heroSpacing = l => l === 'ar' ? '0px' : '14px';
  const pageLang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';

  // =========================================================================
  //  I. PLAN — an AutoCAD sheet: border, title block, walls, doors, dimensions
  //  Drawn in the XY plane (a sheet held up to the light), thin in Z.
  // =========================================================================
  function plan() {
    const pts = [];
    const Z = 0.03;                                   // sheet "paper" thickness
    const line = (x0,y0,x1,y1,n,th=0.010) => seg3(pts, x0,y0,(Math.random()-0.5)*Z, x1,y1,(Math.random()-0.5)*Z, n, th);

    // drawing sheet frame (double border, like a real title sheet)
    rectXY(pts, -1.62,-1.12, 1.62,1.12, 0, 7500, 0.008);
    rectXY(pts, -1.56,-1.06, 1.56,1.06, 0, 4500, 0.006);
    // title block, bottom-right
    rectXY(pts, 0.70,-1.06, 1.56,-0.76, 0, 2000, 0.006);
    line(0.70,-0.91, 1.56,-0.91, 600, 0.005);
    line(1.13,-0.91, 1.13,-0.76, 350, 0.005);

    // outer walls — double line, the heaviest ink on the sheet
    rectXY(pts, -1.25,-0.60, 1.25,0.72, 0, 9500, 0.011);
    rectXY(pts, -1.20,-0.55, 1.20,0.67, 0, 6500, 0.008);

    // interior partitions (with door openings)
    line(-0.15,-0.55, -0.15,0.10, 2400, 0.011);       // vertical, lower run
    line(-0.15,0.42, -0.15,0.67, 1000, 0.011);        // vertical, above the door
    line(-1.20,0.16, -0.55,0.16, 2100, 0.011);        // horizontal, left run
    line(-0.25,0.16, -0.15,0.16, 450, 0.011);
    line(0.55,-0.55, 0.55,-0.12, 1600, 0.011);        // vertical, right room

    // door swings — quarter-circle arcs, the signature of a floor plan
    arcXY(pts, -0.15,0.42, 0.32, -Math.PI/2, 0, 0, 1300);
    arcXY(pts, -0.55,0.16, 0.30, 0, Math.PI/2, 0, 1100);
    arcXY(pts, 0.55,-0.12, 0.30, Math.PI/2, Math.PI, 0, 1100);
    arcXY(pts, 0.20,-0.60, 0.34, Math.PI/2, Math.PI, 0, 1200); // entry door in outer wall

    // stair run, bottom-left — parallel treads
    for (let s = 0; s < 6; s++)
      line(-1.20, -0.48+s*0.075, -0.86, -0.48+s*0.075, 300, 0.006);
    line(-1.03,-0.48, -1.03,-0.10, 350, 0.005);       // stair centreline

    // a fixture: kitchen counter, top-right room
    rectXY(pts, 0.70,0.38, 1.20,0.55, 0, 900, 0.006);
    arcXY(pts, 0.95,0.465, 0.055, 0, Math.PI*2, 0, 350, 0.006); // sink

    // dimension strings with end ticks — below and to the left of the plan
    line(-1.25,-0.84, 1.25,-0.84, 1400, 0.005);
    for (const dx of [-1.25, -0.15, 1.25]) line(dx,-0.88, dx,-0.80, 220, 0.005);
    line(-1.40,-0.60, -1.40,0.72, 900, 0.005);
    for (const dy of [-0.60, 0.16, 0.72]) line(-1.44,dy, -1.36,dy, 200, 0.005);

    // column grid bubbles along the top edge
    for (const gx of [-1.25, -0.15, 0.55, 1.25]) {
      line(gx,0.72, gx,0.90, 180, 0.004);
      arcXY(pts, gx,0.96, 0.055, 0, Math.PI*2, 0, 320, 0.005);
    }

    // a light scatter of "pencil dust" over the sheet so it reads as a surface
    for (let i = 0; i < 2500; i++)
      pts.push((Math.random()-0.5)*3.1, (Math.random()-0.5)*2.1, (Math.random()-0.5)*Z);

    return toCloud(pts);
  }

  // =========================================================================
  //  II. TOWER — wireframe building: podium, floor slabs, mullions, crown
  // =========================================================================
  function tower() {
    const pts = [];
    const vline = (x,z,y0,y1,n,th=0.010) => seg3(pts, x,y0,z, x,y1,z, n, th);

    // podium — wide base, three slab rings + corner columns
    const P = { x0:-1.05, z0:-0.75, x1:1.05, z1:0.75, y0:-1.75, y1:-1.15 };
    for (const y of [P.y0, (P.y0+P.y1)/2, P.y1])
      rectXZ(pts, P.x0,P.z0, P.x1,P.z1, y, 2600, 0.010);
    for (const [cx,cz] of [[P.x0,P.z0],[P.x0,P.z1],[P.x1,P.z0],[P.x1,P.z1]])
      vline(cx, cz, P.y0, P.y1, 500);

    // tower shaft — 12 floor slabs
    const T = { x0:-0.52, z0:-0.38, x1:0.52, z1:0.38, y0:-1.15, y1:1.55 };
    const floors = 12;
    for (let f = 0; f <= floors; f++) {
      const y = T.y0 + (T.y1-T.y0) * f/floors;
      rectXZ(pts, T.x0,T.z0, T.x1,T.z1, y, 1750, 0.009);
    }
    // corner columns, heavier
    for (const [cx,cz] of [[T.x0,T.z0],[T.x0,T.z1],[T.x1,T.z0],[T.x1,T.z1]])
      vline(cx, cz, T.y0, T.y1, 1300, 0.013);
    // facade mullions — vertical lines along each face
    const mull = 350;
    for (let i = 1; i < 6; i++) {                     // long faces (X direction)
      const x = T.x0 + (T.x1-T.x0)*i/6;
      vline(x, T.z0, T.y0, T.y1, mull, 0.006);
      vline(x, T.z1, T.y0, T.y1, mull, 0.006);
    }
    for (let i = 1; i < 4; i++) {                     // short faces (Z direction)
      const z = T.z0 + (T.z1-T.z0)*i/4;
      vline(T.x0, z, T.y0, T.y1, mull, 0.006);
      vline(T.x1, z, T.y0, T.y1, mull, 0.006);
    }

    // crown — set-back top volume + spire
    const C = { x0:-0.30, z0:-0.22, x1:0.30, z1:0.22, y0:1.55, y1:1.95 };
    for (const y of [C.y0, C.y1])
      rectXZ(pts, C.x0,C.z0, C.x1,C.z1, y, 1100, 0.008);
    for (const [cx,cz] of [[C.x0,C.z0],[C.x0,C.z1],[C.x1,C.z0],[C.x1,C.z1]])
      vline(cx, cz, C.y0, C.y1, 300);
    vline(0, 0, C.y1, C.y1+0.35, 450, 0.008);         // spire

    // ground line — a wide plaza ring so the tower stands on something
    for (let i = 0; i < 2600; i++) {
      const a = Math.random()*Math.PI*2, r = 1.45 + Math.random()*0.9;
      pts.push(Math.cos(a)*r, P.y0 - 0.04 - Math.random()*0.05, Math.sin(a)*r*0.8);
    }

    return toCloud(pts);
  }

  // =========================================================================
  //  III. COMBO — the 2D plan lying flat, extruding up into stacked 3D plates
  //  The pitch of the package, drawn literally: drawing becomes building.
  // =========================================================================
  function combo() {
    const pts = [];
    const yPlan = -1.55;
    const W = { x0:-1.05, z0:-0.72, x1:1.05, z1:0.72 };

    // the flat plan on the ground (XZ plane): walls + partitions + door arcs
    const flat = (x0,z0,x1,z1,n,th=0.010) => seg3(pts, x0,yPlan,z0, x1,yPlan,z1, n, th);
    rectXZ(pts, W.x0,W.z0, W.x1,W.z1, yPlan, 7000, 0.011);
    rectXZ(pts, W.x0+0.05,W.z0+0.05, W.x1-0.05,W.z1-0.05, yPlan, 4600, 0.008);
    flat(-0.12,W.z0, -0.12,0.05, 1500, 0.011);        // partitions
    flat(-0.12,0.32, -0.12,W.z1, 900, 0.011);
    flat(W.x0,0.12, -0.45,0.12, 1500, 0.011);
    flat(0.48,W.z0, 0.48,-0.10, 1100, 0.011);
    // door arcs, drawn flat
    for (let i = 0; i < 1000; i++) {
      const a = Math.random()*Math.PI/2;
      pts.push(-0.12 + Math.cos(a)*0.27, yPlan + (Math.random()-0.5)*0.02, 0.32 - Math.sin(a)*0.27);
    }
    // dimension string beside the flat plan
    seg3(pts, W.x0,yPlan,W.z1+0.22, W.x1,yPlan,W.z1+0.22, 900, 0.005);
    seg3(pts, W.x0,yPlan,W.z1+0.16, W.x0,yPlan,W.z1+0.28, 150, 0.005);
    seg3(pts, W.x1,yPlan,W.z1+0.16, W.x1,yPlan,W.z1+0.28, 150, 0.005);

    // extrusion — the same footprint rising as floor plates
    const plates = [-0.65, 0.15, 0.95, 1.75];
    for (const y of plates)
      rectXZ(pts, W.x0,W.z0, W.x1,W.z1, y, 3400, 0.009);
    // roof plate gets its partitions back — the loop closes, plan meets model
    seg3(pts, -0.12,1.75,W.z0, -0.12,1.75,W.z1, 900, 0.009);
    seg3(pts, W.x0,1.75,0.12, W.x1,1.75,0.12, 1100, 0.009);

    // corner risers connecting ground plan to plates
    for (const [cx,cz] of [[W.x0,W.z0],[W.x0,W.z1],[W.x1,W.z0],[W.x1,W.z1]])
      seg3(pts, cx,yPlan,cz, cx,plates[plates.length-1],cz, 1600, 0.011);

    // dashed projection lines rising from the partitions (sampled with gaps)
    const dashed = (x,z,n) => {
      for (let i = 0; i < n; i++) {
        const t = Math.random();
        if (Math.floor(t*14) % 2) continue;           // skip every other band
        pts.push(x + (Math.random()-0.5)*0.006, yPlan + (1.75-yPlan)*t, z + (Math.random()-0.5)*0.006);
      }
    };
    dashed(-0.12, W.z0, 1400); dashed(-0.12, W.z1, 1400);
    dashed(0.48, W.z0, 1200);  dashed(W.x0, 0.12, 1200); dashed(W.x1, 0.12, 1200);

    return toCloud(pts);
  }

  // =========================================================================
  //  IV. CHART — 3D bar chart on a gridded base, trend line across the tops
  // =========================================================================
  function chart() {
    const pts = [];
    const yBase = -1.45;

    // base grid
    for (let i = 0; i <= 8; i++) {
      const x = -1.5 + i*(3.0/8);
      seg3(pts, x,yBase,-0.85, x,yBase,0.85, 450, 0.005);
    }
    for (let i = 0; i <= 4; i++) {
      const z = -0.85 + i*(1.7/4);
      seg3(pts, -1.5,yBase,z, 1.5,yBase,z, 750, 0.005);
    }

    // Y axis with tick marks
    seg3(pts, -1.5,yBase,-0.85, -1.5,yBase+3.1,-0.85, 1100, 0.007);
    for (let i = 1; i <= 6; i++) {
      const y = yBase + i*0.5;
      seg3(pts, -1.56,y,-0.85, -1.44,y,-0.85, 130, 0.005);
    }

    // bars — hollow wireframe boxes with dense top rims (reads as glass bars)
    const bars = [
      { x: -1.15, h: 0.85 }, { x: -0.70, h: 1.45 }, { x: -0.25, h: 1.10 },
      { x:  0.20, h: 1.95 }, { x:  0.65, h: 1.60 }, { x:  1.10, h: 2.45 },
    ];
    const hw = 0.16, hd = 0.30;
    for (const b of bars) {
      const yTop = yBase + b.h;
      // vertical edges
      for (const [ex,ez] of [[b.x-hw,-hd],[b.x-hw,hd],[b.x+hw,-hd],[b.x+hw,hd]])
        seg3(pts, ex,yBase,ez, ex,yTop,ez, Math.round(700*b.h/2.45)+250, 0.009);
      // top rim, dense — the data point itself
      rectXZ(pts, b.x-hw,-hd, b.x+hw,hd, yTop, 1500, 0.010);
      // faint fill on the front face
      for (let i = 0; i < 900; i++)
        pts.push(b.x + (Math.random()-0.5)*hw*2, yBase + Math.random()*b.h, hd + (Math.random()-0.5)*0.01);
      // base ring
      rectXZ(pts, b.x-hw,-hd, b.x+hw,hd, yBase, 500, 0.008);
    }

    // trend line arcing across bar tops, with a bright node above each bar
    for (let i = 0; i < bars.length-1; i++) {
      const a = bars[i], b = bars[i+1];
      seg3(pts, a.x, yBase+a.h+0.22, 0, b.x, yBase+b.h+0.22, 0, 900, 0.012);
    }
    for (const b of bars)
      for (let i = 0; i < 420; i++) {
        const th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1), r = 0.055*Math.cbrt(Math.random());
        pts.push(b.x + r*Math.sin(ph)*Math.cos(th), yBase+b.h+0.22 + r*Math.cos(ph), r*Math.sin(ph)*Math.sin(th));
      }

    return toCloud(pts);
  }

  // =========================================================================
  //  V. GLOBE — lat/long wireframe sphere, tilted orbit ring, </> glyph
  // =========================================================================
  function globe() {
    const pts = [];
    const R = 1.25;

    // latitude rings
    for (let lat = -75; lat <= 75; lat += 15) {
      const phi = lat * Math.PI/180;
      const r = R * Math.cos(phi), y = R * Math.sin(phi);
      const n = Math.max(300, Math.round(2400 * r/R));
      for (let i = 0; i < n; i++) {
        const a = Math.random()*Math.PI*2;
        pts.push(Math.cos(a)*r + (Math.random()-0.5)*0.008, y + (Math.random()-0.5)*0.008, Math.sin(a)*r + (Math.random()-0.5)*0.008);
      }
    }
    // longitude rings
    for (let lon = 0; lon < 180; lon += 22.5) {
      const la = lon * Math.PI/180;
      for (let i = 0; i < 1500; i++) {
        const a = Math.random()*Math.PI*2;
        const x = Math.cos(a)*R, y = Math.sin(a)*R;
        pts.push(x*Math.cos(la) + (Math.random()-0.5)*0.008, y + (Math.random()-0.5)*0.008, x*Math.sin(la) + (Math.random()-0.5)*0.008);
      }
    }
    // sparse surface shimmer
    for (let i = 0; i < 3500; i++) {
      const th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1);
      pts.push(R*Math.sin(ph)*Math.cos(th), R*Math.cos(ph), R*Math.sin(ph)*Math.sin(th));
    }

    // tilted orbit ring + satellite clump
    const tilt = 0.5;
    for (let i = 0; i < 2800; i++) {
      const a = Math.random()*Math.PI*2, r = 1.72 + (Math.random()-0.5)*0.02;
      const x = Math.cos(a)*r, z = Math.sin(a)*r;
      pts.push(x, z*Math.sin(tilt) + (Math.random()-0.5)*0.01, z*Math.cos(tilt));
    }
    { // the satellite — a small dense knot on the orbit
      const a = 0.8, r = 1.72, x = Math.cos(a)*r, z = Math.sin(a)*r;
      for (let i = 0; i < 500; i++) {
        const rr = 0.06*Math.cbrt(Math.random()), th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1);
        pts.push(x + rr*Math.sin(ph)*Math.cos(th), z*Math.sin(tilt) + rr*Math.cos(ph), z*Math.cos(tilt) + rr*Math.sin(ph)*Math.sin(th));
      }
    }

    // the </> glyph floating just in front of the sphere
    const G = 0.72, gz = 1.42, th = 0.030;
    const stroke = (x0,y0,x1,y1,n) => seg3(pts, x0*G,y0*G,gz, x1*G,y1*G,gz, n, th);
    stroke(-0.22, 0.34, -0.58, 0.00, 1300);           // <
    stroke(-0.58, 0.00, -0.22,-0.34, 1300);
    stroke( 0.14, 0.40, -0.14,-0.40, 1500);           // /
    stroke( 0.22, 0.34,  0.58, 0.00, 1300);           // >
    stroke( 0.58, 0.00,  0.22,-0.34, 1300);

    return toCloud(pts);
  }

  // normalise a cloud to sit centred, scaled to target height
  function normalize(cloud, targetH = 3.0) {
    const { pos, n } = cloud;
    let minY=Infinity,maxY=-Infinity,cx=0,cz=0;
    for (let i=0;i<n;i++){ const y=pos[i*3+1]; if(y<minY)minY=y; if(y>maxY)maxY=y; cx+=pos[i*3]; cz+=pos[i*3+2]; }
    cx/=n; cz/=n;
    const h = maxY-minY || 1; const s = targetH/h; const midY=(minY+maxY)/2;
    for (let i=0;i<n;i++){
      pos[i*3]   = (pos[i*3]-cx)*s;
      pos[i*3+1] = (pos[i*3+1]-midY)*s;
      pos[i*3+2] = (pos[i*3+2]-cz)*s;
    }
    return cloud;
  }

  // =========================================================================
  //  BUILD SERVICES — all share ONE points object; we swap the active home set.
  //  rot: 'spin' turns continuously; 'sway' oscillates (flat artifacts would
  //  read edge-on if they spun full circle).
  // =========================================================================
  const exhibits = [
    { key:'intro', hero: true,  lift: 1.22, rot:{ mode:'sway', amp:0.14, speed:0.22 }, tint:[0.84,1.00,0.95] },
    { key:'globe', gen: globe, h: 3.00, lift: 0, rot:{ mode:'spin', speed:0.14 },           tint:[0.82,0.87,1.00] },
    { key:'plan',  gen: plan,  h: 2.45, lift: 0, rot:{ mode:'sway', amp:0.30, speed:0.30 }, tint:[0.78,0.88,1.00] },
    { key:'tower', gen: tower, h: 3.20, lift: 0, rot:{ mode:'spin', speed:0.10 },           tint:[0.95,0.90,0.80] },
    { key:'combo', gen: combo, h: 3.10, lift: 0, rot:{ mode:'spin', speed:0.08 },           tint:[0.96,0.86,0.72] },
    { key:'chart', gen: chart, h: 2.90, lift: 0, rot:{ mode:'sway', amp:0.42, speed:0.26 }, tint:[0.76,0.96,0.86] },
  ];
  const TOTAL = exhibits.length - 1;          // services only; intro is 00

  // the hero wordmark is already centred and sized by the canvas sampling —
  // normalising it by height would blow the width out, so it skips normalize()
  const clouds = exhibits.map(e => e.hero
    ? wordmark(heroText(pageLang()), heroFont(pageLang()), heroSpacing(pageLang()))
    : normalize(e.gen(), e.h));
  const MAXN = Math.max(...clouds.map(c=>c.n));

  // per-vertex attributes:
  //  aHome  — target home position of the CURRENTLY active service
  //  aDust  — a stable random dust position (where the grain rests when scattered)
  //  aSeed  — random 0..1 for phase / size variation
  const geo = new THREE.BufferGeometry();
  const aHome = new Float32Array(MAXN*3);
  const aDust = new Float32Array(MAXN*3);
  const aSeed = new Float32Array(MAXN);
  for (let i=0;i<MAXN;i++){
    const r = 3.4 + Math.random()*3.2;
    const th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1);
    aDust[i*3]   = r*Math.sin(ph)*Math.cos(th);
    aDust[i*3+1] = r*Math.cos(ph)*0.7;
    aDust[i*3+2] = r*Math.sin(ph)*Math.sin(th);
    aSeed[i] = Math.random();
  }
  geo.setAttribute('aHome', new THREE.BufferAttribute(aHome, 3));
  geo.setAttribute('aDust', new THREE.BufferAttribute(aDust, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXN*3), 3)); // unused but required
  geo.setDrawRange(0, clouds[0].n);

  // load a cloud's home positions into aHome (fill unused with dust so they vanish)
  function loadHome(idx) {
    const c = clouds[idx];
    aHome.set(c.pos.subarray(0, c.n*3));
    for (let i=c.n;i<MAXN;i++){ aHome[i*3]=aDust[i*3]; aHome[i*3+1]=aDust[i*3+1]; aHome[i*3+2]=aDust[i*3+2]; }
    geo.attributes.aHome.needsUpdate = true;
    geo.setDrawRange(0, MAXN);
  }

  // ---- shader material -----------------------------------------------------
  const uniforms = {
    uTime:     { value: 0 },
    uAssembly: { value: 0 },        // 0 dust .. 1 assembled
    uFocus:    { value: 0 },        // 0 .. 1 hold-to-focus
    uMouse:    { value: new THREE.Vector3(999,999,0) },
    uSwirl:    { value: 0 },        // stir strength (mouse velocity)
    uTint:     { value: new THREE.Color(0xefe7d6) },
    uPixelRatio:{ value: Math.min(devicePixelRatio,2) },
    uSize:     { value: 2.2 },
    uRotY:     { value: 0 },
  };

  const vert = /* glsl */`
    uniform float uTime, uAssembly, uFocus, uSwirl, uPixelRatio, uSize, uRotY;
    uniform vec3  uMouse;
    attribute vec3 aHome;
    attribute vec3 aDust;
    attribute float aSeed;
    varying float vBright;
    varying float vSeed;

    // cheap curl-ish noise from layered sines (no texture needed)
    vec3 curl(vec3 p, float t){
      float x = sin(p.y*1.3 + t*0.5) + cos(p.z*1.1 - t*0.4);
      float y = sin(p.z*1.2 - t*0.45) + cos(p.x*1.4 + t*0.5);
      float z = sin(p.x*1.1 + t*0.4) + cos(p.y*1.3 - t*0.5);
      return vec3(x,y,z);
    }

    mat3 rotY(float a){ float c=cos(a),s=sin(a); return mat3(c,0,s, 0,1,0, -s,0,c); }

    void main(){
      vSeed = aSeed;
      float t = uTime;

      float assembled = clamp(uAssembly, 0.0, 1.0);
      float stagger = smoothstep(0.0, 1.0, (assembled - aSeed*0.35) / 0.65);
      vec3 home = aHome;
      vec3 dust = aDust;

      // dust drifts on the curl field continuously
      vec3 drift = curl(dust*0.35 + vec3(0.0, t*0.05, 0.0), t) * 0.22;
      dust += drift * (1.0 - stagger);

      vec3 pos = mix(dust, home, stagger);

      // rotate the assembled sculpture slowly on its plinth
      pos = rotY(uRotY) * pos;

      // ---- mouse stir: swirl points near the cursor's projected point ----
      vec3 toM = pos - uMouse;
      float d = length(toM.xy);
      float infl = exp(-d*d*0.35) * uSwirl;
      vec3 swirlDir = normalize(vec3(-toM.y, toM.x, 0.0) + 1e-4);
      pos += swirlDir * infl * 0.9;
      pos += curl(pos*0.5, t*1.3) * infl * 0.4;

      // ---- focus: pull toward home + tighten jitter ----
      pos = mix(pos, rotY(uRotY)*home, uFocus * stagger * 0.5);

      // subtle living shimmer even when assembled
      pos += curl(home*0.8 + aSeed*10.0, t*0.6) * 0.012 * stagger;

      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mv;

      float size = uSize * (0.6 + aSeed*0.8);
      size *= (1.0 + uFocus*0.8) * (0.5 + stagger*0.7) * (1.0 + infl*0.6);
      float depth = max(-mv.z, 0.1);
      gl_PointSize = clamp(size * uPixelRatio * (14.0 / depth), 1.0, 64.0);

      vBright = (0.35 + stagger*0.65) * (0.8 + uFocus*0.9) * (1.0 + infl*1.2);
    }
  `;

  const frag = /* glsl */`
    precision highp float;
    uniform vec3 uTint;
    uniform float uFocus;
    varying float vBright;
    varying float vSeed;
    void main(){
      vec2 c = gl_PointCoord - 0.5;
      float d = length(c);
      if (d > 0.5) discard;
      float alpha = smoothstep(0.5, 0.0, d);
      alpha *= alpha;

      vec3 col = uTint * vBright;
      col = mix(col, vec3(0.38,0.93,0.83), uFocus*0.25*(1.0-vSeed*0.5));
      float a = alpha * clamp(vBright*0.55, 0.0, 1.0);
      gl_FragColor = vec4(col, a);
    }
  `;

  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  // Real positions live in aHome/aDust (computed in the shader), so the
  // auto bounding sphere would frustum-cull the cloud. Always draw it.
  points.frustumCulled = false;
  scene.add(points);

  // On narrow viewports the plaque fills the lower screen; lift the sculpture
  // into the clear upper band above the card.
  const isNarrow = () => innerWidth <= 720;
  // vertical offset per exhibit: the hero wordmark floats in the upper band,
  // the sculptures sit centred (or lifted above the card on narrow screens).
  // points.position.y eases toward this in the render loop.
  // the Arabic intro has no headline, so its copy block is shorter:
  // drop the wordmark closer to it instead of leaving a gap
  const AR_HERO_LIFT = 0.78;
  const heroScale = (idx) => (idx === 0 && pageLang() === 'ar') ? AR_HERO_LIFT : 1;
  const liftFor = (idx) => (isNarrow() ? 1.35 : 0) + exhibits[idx].lift * heroScale(idx) * (isNarrow() ? 0.45 : 1);
  function layoutOffset() {
    plinth.position.set(0, isNarrow() ? 1.35 : 0, 0);
  }

  // faint amber floor glow disc (plinth light)
  const plinthGeo = new THREE.BufferGeometry();
  const PL = 2400; const plp = new Float32Array(PL*3);
  for (let i=0;i<PL;i++){ const a=Math.random()*Math.PI*2, r=1.6+Math.random()*1.4;
    plp[i*3]=Math.cos(a)*r; plp[i*3+1]=-2.0-Math.random()*0.1; plp[i*3+2]=Math.sin(a)*r; }
  plinthGeo.setAttribute('position', new THREE.BufferAttribute(plp,3));
  const plinth = new THREE.Points(plinthGeo, new THREE.PointsMaterial({
    color: 0x45d6c0, size: 0.03, transparent:true, opacity:0.28,
    blending: THREE.AdditiveBlending, depthWrite:false }));
  scene.add(plinth);

  loadHome(0);
  layoutOffset();
  points.position.y = liftFor(0);

  // rebuild the hero once the real webfonts arrive, and when the language flips
  function regenHero(lang) {
    const spec = heroFont(lang), txt = heroText(lang);
    document.fonts.load(spec, txt).catch(() => []).then(() => {
      clouds[0] = wordmark(txt, spec, heroSpacing(lang));
      if (currentExhibit === 0) loadHome(0);
    });
  }
  document.fonts.ready.then(() => regenHero(pageLang()));
  window.addEventListener('takween:lang', e => regenHero(e.detail));

  // =========================================================================
  //  SCROLL → which service, and its assembly amount
  // =========================================================================
  const panels = [...document.querySelectorAll('.panel')];
  // intro included: it hosts the hero wordmark at index 0
  const scrollPanels = [...document.querySelectorAll('.panel-intro, .panel-exhibit')];

  let currentExhibit = 0;
  let targetAssembly = 0;
  let targetTint = new THREE.Color().setRGB(...exhibits[0].tint);

  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) en.target.classList.add('in-view');
    });
  }, { threshold: 0.28 });
  panels.forEach(p => io.observe(p));

  let scrolled = false;
  addEventListener('scroll', () => {
    if (!scrolled && scrollY > 40) { scrolled = true; scrollCue.classList.add('hidden'); }
    updateScrollState();
  }, { passive: true });

  function updateScrollState() {
    const mid = scrollY + innerHeight/2;
    let best = -1, bestIdx = currentExhibit;
    scrollPanels.forEach((p, i) => {
      const top = p.offsetTop, h = p.offsetHeight;
      const center = top + h/2;
      const dist = Math.abs(center - mid);
      const norm = 1 - Math.min(dist / (h*0.62), 1);
      if (norm > best) { best = norm; bestIdx = i; }
    });
    if (bestIdx !== currentExhibit && best > 0.02) {
      currentExhibit = bestIdx;
      loadHome(bestIdx);
      const ex = exhibits[bestIdx];
      targetTint = new THREE.Color().setRGB(...ex.tint);
      if (bestIdx > 0) live.textContent = `Now viewing Service ${bestIdx}: ${ex.key}`;
    }
    // counter reflects whatever is materialised right now (00 = hero / between)
    const label = bestIdx === 0 ? '00' : `0${bestIdx}`;
    hallIdx.textContent = best > 0.22 ? `${label} / 0${TOTAL}` : `00 / 0${TOTAL}`;
    targetAssembly = Math.pow(Math.max(best,0), 0.7);
  }

  // =========================================================================
  //  MOUSE — stir the dust; project cursor to a plane at z=0
  // =========================================================================
  const ndc = new THREE.Vector2(0, 0);
  const stirPoint = new THREE.Vector3(999,999,0);   // parked off-screen; swirl is off

  function onMove(cx, cy) {
    // track the cursor only for the gentle camera parallax + focus-ring position;
    // the point-swirl "ripple" is disabled (uSwirl held at 0 in the render loop)
    const nx = (cx/innerWidth)*2 - 1, ny = -(cy/innerHeight)*2 + 1;
    ndc.set(nx, ny);
    focusRing.style.setProperty('--fx', `${(cx/innerWidth)*100}%`);
    focusRing.style.setProperty('--fy', `${(cy/innerHeight)*100}%`);
  }
  addEventListener('pointermove', e => onMove(e.clientX, e.clientY), { passive: true });

  // hold-to-focus
  let focusHeld = false;
  const setFocus = (v) => { focusHeld = v; document.body.classList.toggle('focusing', v); };
  addEventListener('pointerdown', e => { if (e.button===0) setFocus(true); });
  addEventListener('pointerup',   () => setFocus(false));
  addEventListener('pointercancel', () => setFocus(false));
  addEventListener('keydown', e => { if (e.code==='Space' && !e.repeat) { e.preventDefault(); setFocus(true); }});
  addEventListener('keyup',   e => { if (e.code==='Space') setFocus(false); });

  // =========================================================================
  //  RENDER LOOP
  // =========================================================================
  let asm = 0, foc = 0, spinAngle = 0;
  const clock = new THREE.Clock();
  let running = true;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) { clock.getDelta(); tick(); }
  });

  updateScrollState();

  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    asm += (targetAssembly - asm) * Math.min(dt*3.2, 1);
    foc += ((focusHeld ? 1 : 0) - foc) * Math.min(dt*4.5, 1);

    // rotation per service: flat sheets sway, volumes spin
    const rot = exhibits[currentExhibit].rot;
    let rotTarget;
    if (rot.mode === 'sway') {
      rotTarget = reduce ? 0 : Math.sin(t*rot.speed) * rot.amp;
      spinAngle += (rotTarget - spinAngle) * Math.min(dt*2, 1);
    } else {
      spinAngle += dt * (reduce ? 0 : (rot.speed + foc*0.05));
    }

    uniforms.uTime.value = t;
    uniforms.uAssembly.value = reduce ? Math.max(asm, targetAssembly) : asm;
    uniforms.uFocus.value = foc;
    uniforms.uSwirl.value = 0;   // mouse-stir ripple disabled
    uniforms.uMouse.value.copy(stirPoint);
    uniforms.uRotY.value = spinAngle;
    uniforms.uTint.value.lerp(targetTint, Math.min(dt*2.5,1));
    uniforms.uSize.value = 2.2;

    // ease the cloud toward its exhibit's vertical berth
    points.position.y += (liftFor(currentExhibit) - points.position.y) * Math.min(dt*2.5, 1);

    // gentle camera breathing + parallax toward cursor
    const px = (ndc.x||0), py = (ndc.y||0);
    camera.position.x += (px*0.5 - camera.position.x) * Math.min(dt*1.6,1);
    camera.position.y += (py*0.35 - camera.position.y) * Math.min(dt*1.6,1);
    camera.lookAt(0,0,0);

    plinth.material.opacity = 0.18 + foc*0.22 + asm*0.1;

    renderer.render(scene, camera);
  }
  tick();

  // =========================================================================
  //  RESIZE
  // =========================================================================
  addEventListener('resize', () => {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    uniforms.uPixelRatio.value = Math.min(devicePixelRatio,2);
    layoutOffset();
  });

  console.log('TAKWEEN studio online —', MAXN, 'points/frame; service', exhibits[0].key);
}
