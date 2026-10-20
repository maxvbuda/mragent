/**
 * The project Mr. Agent is writing. Shared by the laptop screen in the 3D room
 * and by the Code app inside the Mac simulator.
 */
export const PROJECT = 'mr-agent-os';

export const SNIPPETS = [
  {
    path: 'src/nav/astar.ts',
    lang: 'ts',
    test: ['$ npm test -- nav', ' PASS  src/nav/astar.test.ts', '  ✓ finds the shortest way to the matcha machine (4 ms)', '  ✓ walks around the desk, not through it (2 ms)', '  ✓ never steps on the cat (1 ms)', 'Tests: 3 passed, 3 total'],
    commit: 'nav: A* with octile heuristic and corner smoothing',
    code: `import { Grid, Cell } from './grid';

/** A* over the room grid. Returns world points, smoothed. */
export function findPath(grid: Grid, from: Cell, to: Cell): Cell[] {
  const open = new MinHeap<Cell>((a, b) => a.f - b.f);
  const came = new Map<number, Cell>();
  const g = new Float32Array(grid.size).fill(Infinity);

  g[grid.id(from)] = 0;
  open.push({ ...from, f: octile(from, to) });

  while (open.size) {
    const cur = open.pop()!;
    if (cur.x === to.x && cur.y === to.y) return smooth(grid, rebuild(came, cur));

    for (const n of grid.neighbours(cur)) {
      const step = n.x !== cur.x && n.y !== cur.y ? Math.SQRT2 : 1;
      const cost = g[grid.id(cur)] + step * grid.weight(n);
      if (cost >= g[grid.id(n)]) continue;
      g[grid.id(n)] = cost;
      came.set(grid.id(n), cur);
      open.push({ ...n, f: cost + octile(n, to) });
    }
  }
  return []; // boxed in by furniture. Time for a matcha.
}

const octile = (a: Cell, b: Cell) => {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
};
`,
  },
  {
    path: 'firmware/matcha.rs',
    lang: 'rs',
    test: ['$ cargo test --release', '   Compiling matcha v0.4.2', '    Finished release [optimized] in 0.31s', 'running 4 tests', 'test brew::pressure_is_nine_bar ... ok', 'test brew::never_decaf ... ok', 'test mug::handle_stays_attached ... ok', 'test result: ok. 4 passed; 0 failed'],
    commit: 'matcha: PID loop holds 9 bar, refuse decaf',
    code: `use crate::hw::{Boiler, Pump, Valve};

pub struct Brew {
    target_bar: f32,
    pid: Pid,
}

impl Brew {
    pub fn matcha() -> Self {
        Self { target_bar: 9.0, pid: Pid::new(0.8, 0.12, 0.04) }
    }

    pub fn run(&mut self, boiler: &mut Boiler, pump: &mut Pump) -> Result<Shot, BrewError> {
        boiler.heat_to(93.5)?;
        let mut shot = Shot::default();
        while shot.ml < 36.0 {
            let bar = pump.pressure();
            let duty = self.pid.step(self.target_bar - bar, 0.01);
            pump.set_duty(duty.clamp(0.0, 1.0));
            shot.ml += pump.flow_ml_per_s() * 0.01;
            shot.seconds += 0.01;
        }
        if shot.seconds < 22.0 {
            return Err(BrewError::Underextracted(shot));
        }
        Ok(shot)
    }
}
`,
  },
  {
    path: 'src/body/gait.py',
    lang: 'py',
    test: ['$ pytest tests/test_gait.py -q', '.....                                         [100%]', '5 passed in 0.42s'],
    commit: 'gait: plant feet during stance, lift 7.5 cm in swing',
    code: `import numpy as np
from dataclasses import dataclass


@dataclass
class Foot:
    side: int          # +1 right, -1 left
    planted: bool = True


def foot_offset(phase: float, stride: np.ndarray, lift: float = 0.075):
    """Where a foot sits relative to the hips at a point in the step cycle."""
    if phase < 0.5:                       # stance: glued to the floor
        t = phase / 0.5
        return stride * (0.5 - t), 0.0
    t = (phase - 0.5) / 0.5               # swing: arc forward
    s = t * t * (3 - 2 * t)
    return stride * (s - 0.5), lift * np.sin(np.pi * t)


def solve_leg(hip, ankle, thigh=0.29, shin=0.33):
    d = np.clip(np.linalg.norm(ankle - hip), 1e-3, thigh + shin - 1e-4)
    knee = np.arccos((thigh**2 + shin**2 - d**2) / (2 * thigh * shin))
    return np.pi - knee
`,
  },
  {
    path: 'src/ui/Face.tsx',
    lang: 'ts',
    test: ['$ npm run test:ui', ' ✓ Face renders happy eyes when tests pass', ' ✓ blinks every 2–6 s (fake timers)', ' ✓ hearts when someone says thank you', ' 3 passed (310 ms)'],
    commit: 'ui: expressive eyes, blink scheduler, gaze tracking',
    code: `import { useEffect, useState } from 'react';

type Mood = 'normal' | 'focused' | 'happy' | 'love' | 'thinking';

export function Face({ mood, gaze }: { mood: Mood; gaze: [number, number] }) {
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    let id: number;
    const schedule = () => {
      id = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 120);
        schedule();
      }, 2000 + Math.random() * 4000);
    };
    schedule();
    return () => clearTimeout(id);
  }, []);

  const [gx, gy] = gaze;
  return (
    <svg viewBox="0 0 512 256" className={\`face face--\${mood}\`}>
      <Eye x={160 + gx * 34} y={128 - gy * 22} closed={blink} mood={mood} />
      <Eye x={352 + gx * 34} y={128 - gy * 22} closed={blink} mood={mood} />
    </svg>
  );
}
`,
  },
  {
    path: 'src/agent/planner.ts',
    lang: 'ts',
    test: ['$ npm test -- planner', ' PASS  src/agent/planner.test.ts', '  ✓ schedules a matcha when energy < 30% (3 ms)', '  ✓ lets humans use the Mac when they ask nicely (1 ms)', '  ✓ never ships on a Friday afternoon (1 ms)', 'Tests: 3 passed, 3 total'],
    commit: 'agent: utility-based planner for breaks',
    code: `export interface Activity {
  name: 'code' | 'matcha' | 'stretch' | 'window' | 'books' | 'plant';
  utility(state: AgentState): number;
}

export const activities: Activity[] = [
  { name: 'code', utility: (s) => 0.6 + s.focus * 0.4 - s.fatigue * 0.5 },
  { name: 'matcha', utility: (s) => (1 - s.energy) * 1.4 },
  { name: 'stretch', utility: (s) => s.minutesSeated / 90 },
  { name: 'window', utility: (s) => s.fatigue * 0.6 + (s.isSunset ? 0.4 : 0) },
  { name: 'books', utility: (s) => s.stuckOnBug ? 0.9 : 0.1 },
  { name: 'plant', utility: (s) => s.hoursSinceWatered / 48 },
];

export function nextActivity(state: AgentState): Activity {
  const scored = activities.map((a) => ({ a, u: a.utility(state) + Math.random() * 0.15 }));
  scored.sort((x, y) => y.u - x.u);
  return scored[0].a;
}
`,
  },
  {
    path: 'shaders/visor.glsl',
    lang: 'glsl',
    test: ['$ glslangValidator shaders/visor.glsl', 'shaders/visor.glsl: OK', '$ npm run bench:gpu', '  visor pass: 0.04 ms @ 6K (M7 Ultra Max, 4096-core GPU)'],
    commit: 'shaders: scanlines and glass fresnel on the visor',
    code: `uniform sampler2D faceTex;
uniform float time;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;

void main() {
  vec3 face = texture2D(faceTex, vUv).rgb;
  float scan = 0.94 + 0.06 * sin(vUv.y * 900.0 + time * 4.0);
  float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 3.0);
  vec3 glass = mix(vec3(0.01, 0.015, 0.02), vec3(0.6, 0.8, 1.0), fresnel * 0.5);
  gl_FragColor = vec4(glass + face * scan * 2.4, 1.0);
}
`,
  },
];

// ------------------------------------------------------------------ tiny highlighter
const KW = {
  ts: 'import export from const let var function return if else for while of in new type interface class extends implements async await continue break true false null undefined default as',
  rs: 'use pub struct impl fn let mut while if else return for in match self Self Ok Err Some None crate mod enum',
  py: 'import from def return if else elif for while in class with as True False None not and or lambda pass',
  glsl: 'uniform varying void float vec2 vec3 vec4 sampler2D return if else for',
};
const KWSETS = Object.fromEntries(Object.entries(KW).map(([k, v]) => [k, new Set(v.split(' '))]));

export function tokenize(line, lang) {
  const out = [];
  const kws = KWSETS[lang] || KWSETS.ts;
  const commentStart = lang === 'py' ? '#' : '//';
  const indent = line.length - line.trimStart().length;
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    const docLine = lang !== 'py' && i === indent && /^(\/\*|\*)/.test(rest);
    if (rest.startsWith(commentStart) || docLine) {
      out.push(['comment', rest]);
      break;
    }
    if (lang === 'py' && rest.startsWith('"""')) { out.push(['string', rest]); break; }
    const ch = line[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < line.length && line[j] !== ch) j += line[j] === '\\' ? 2 : 1;
      out.push(['string', line.slice(i, j + 1)]);
      i = j + 1;
      continue;
    }
    const num = /^\d[\d_.]*(f32|f64)?/.exec(rest);
    if (num && !/\w/.test(line[i - 1] || '')) { out.push(['number', num[0]]); i += num[0].length; continue; }
    const id = /^[A-Za-z_][\w]*/.exec(rest);
    if (id) {
      const w = id[0];
      const after = line[i + w.length];
      let kind = 'ident';
      if (kws.has(w)) kind = 'keyword';
      else if (after === '(' || after === '!') kind = 'func';
      else if (/^[A-Z]/.test(w)) kind = 'type';
      else if (line[i - 1] === '.') kind = 'prop';
      out.push([kind, w]);
      i += w.length;
      continue;
    }
    out.push(['punct', ch]);
    i++;
  }
  return out;
}

export const THEME = {
  bg: '#14161c', panel: '#101217', side: '#0d0f13', line: '#1b1e26', gutter: '#4b5263', text: '#d7dce6',
  keyword: '#c792ea', string: '#a5e075', number: '#f78c6c', comment: '#5c6779', func: '#82aaff', type: '#ffcb6b',
  prop: '#89ddff', ident: '#d7dce6', punct: '#9aa5b8', accent: '#49e3ff', ok: '#5dff8a', warn: '#ffcb6b',
};
