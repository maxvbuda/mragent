# Mr. Agent

A 3D robot who codes at his desk, wanders around his room, and lets you use his Mac.
Every 3D part (the robot, his desk, chair, MacBook, mug, plants, bookshelf, coffee
machine and lamp) was modelled in **FreeCAD** through its MCP server. The scene is
rendered with three.js, and the Mac is a full macOS-style simulator built in HTML.

## Starting it

- Double-click **Start Mr Agent.command**, or
- run `npm install` once, then `npm run dev` and open <http://localhost:5180>.

## In the room

| Do this | What happens |
|---|---|
| Click the MacBook (or **M**) | The camera flies into the screen and you get his Mac. He gets up and takes a break. |
| Click the robot (or **H**) | He waves and says hi |
| **C** · **S** · **W** · **D** | Coffee run · stretch · look out the window · dance break |
| **T** | Time of day: real clock, morning, afternoon, sunset, night |
| **F** · **R** · **V** | Follow him with the camera · reset the view · sound on/off |
| Drag / scroll | Orbit / zoom |

On his own he types (fingers press real keys, he makes typos and fixes them, runs
tests, commits), sips coffee, and every so often gets up for a coffee run to the
espresso machine, a stretch, the window, the bookshelf or the plant. He paths
around furniture with A\* and his feet stay planted while he walks.

## On his Mac

Boot chime, login (any password), menu bar, Dock with magnification, draggable
and resizable windows, Spotlight (⌃Space), Mission Control (⌃↑), Launchpad (F4),
app switcher (⌥Tab), Control Center, Notification Center, screenshots (⌃⇧3) and
a persistent file system.

Apps: Finder, Safari, Messages, Music, Photos, Notes, Calendar, Weather, Code,
Terminal, Activity Monitor, System Settings, Calculator, TextEdit, Preview,
Minesweeper, Snake, Benchmark, and About This Mac (1,024-core M7 Ultra Max, 8 TB
memory, 1 PB SSD).

Browsers reserve ⌘W/⌘Q/⌘N/⌘M, so the Mac uses Control (⌃) for those instead.

Some of it reaches back into the room:
- **Code** shows the file he's typing, live.
- **Music** makes him dance.
- **Settings → Mr. Agent** changes the time of day and his typing speed, and sends him on breaks.
- **Messages** lets you chat with him.

## Rebuilding the models

`cad/build_models.py` builds every part in FreeCAD and writes `public/models.json`
(meshes with real surface normals, plus the room layout). Run it inside FreeCAD,
for example through the FreeCAD MCP:

```python
p = "/path/to/Mragent/cad/build_models.py"
exec(compile(open(p).read(), p, "exec"), {"__file__": p, "__name__": "mragent"})
```

It also saves `cad/mr_agent.FCStd` with everything posed at the desk.

## Files

- `cad/build_models.py`: the FreeCAD model of the robot and room
- `src/scene/robot.js`: rig, two-bone IK for arms and legs, gait, fingers, pistons, neck cables
- `src/scene/brain.js`: what he does and when
- `src/scene/face.js`: the eyes on his visor
- `src/scene/screen.js`, `code.js`: the laptop display and the code he writes
- `src/scene/props.js`, `world.js`: room, props, lighting, day/night, post-processing
- `src/scene/nav.js`: A\* pathfinding
- `src/audio.js`: all sounds and the lo-fi music, synthesised with WebAudio
- `src/mac/`: the Mac: `os.js` (window manager, Dock, menus, overlays), `vfs.js`, `apps/`
