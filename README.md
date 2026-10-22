# Mr. Agent

A 3D robot who codes at his desk, wanders around his whole house, lets you use his Mac,
listens to you (Qwen3-1.7B running in your browser), and breaks apart if you punch him.
Kuma, the robot from agent-bot-3d, lives in the living room and suffers through Windows.
Every 3D part (the robot, his office, and the kitchen, living room, bedroom, bathroom,
workshop and garden around it) was modelled in **FreeCAD** through its MCP server. The scene is
rendered with three.js, and the Mac is a full macOS-style simulator built in HTML.

## Starting it

- Double-click **Start Mr Agent.command**, or
- run `npm install` once, then `npm run dev` and open <http://localhost:5180>.

## In the house

The office is in the middle. Around it are a kitchen with a dining table, a living
room, a hallway with the front door, a bedroom with a charging bed, a bathroom and a
workshop. Walls between you and what you're looking at drop down automatically
(Sims-style). The room buttons at the top, or **0–7**, fly the camera to each room.

| Do this | What happens |
|---|---|
| Click the MacBook (or **M**) | The camera flies into the screen and you get his Mac. He gets up and takes a break. |
| **/** or the 💬 button | Talk to him. Qwen decides what you mean and whether he'll do it |
| **W A S D** (+ Shift) | Walk him around yourself, relative to the camera (Shift hurries) |
| Click the robot (or **H**) | He waves and says hi |
| **I** | See inside his brain: x-ray head, live thoughts, memory |
| **P**, then click him | Punch mode: he flinches, then his chest plate, backpack, an arm and finally his head come off |
| **U** | Repair: the parts fly back on and he reboots |
| Click Kuma's monitor | Use Kuma's Windows PC |
| **C** · **Y** · **O** · **N** | Matcha run · stretch · look out the window · dance break |
| **G** · **B** · **K** · **Z** | Watch TV on the sofa · raid the fridge · tinker in the workshop · nap |
| **X** | Walls: cutaway, down or up |
| **0–8** | Whole house, a room, or the garden |
| **E** | RoboMart: order something for Mr. Agent or Kuma |
| **T** | Time of day: real clock, morning, afternoon, sunset, night |
| **F** · **R** · **V** | Follow him with the camera · reset the view · sound on/off |
| Drag / scroll | Orbit / zoom |

On his own he types (fingers press real keys, he makes typos and fixes them, runs
tests, commits), sips matcha, and every so often gets up: a matcha run, a stretch,
the window, the bookshelf, the plant, TV on the sofa, a battery can from the fridge,
tinkering at the workbench (with sparks), checking himself in the bathroom mirror,
watching the 3D printer, or peeking out of the front door. At night he goes to bed
and charges until morning. He paths through the doorways with A\* and his feet stay
planted while he walks.

## Outside and ordering things

The house stands on a plinth in a garden, 0.3 m above the lawn. Both robots can walk out of the front door: it opens as they
get close, and they step down the porch steps. Outside there's a garden bench, a mailbox, a lawn,
the backyard and a side yard. **8** (or 🌳 Garden) flies the camera outside. Ask either robot to
go outside in the chat. Kuma stands up from his gaming chair, walks out and sits on the bench, and
heads back after a while.

**🛒 RoboMart (E)** lets you order things for Mr. Agent or Kuma, from the shop or by asking in chat
("order Kuma a Linux USB"). A delivery drone modelled in FreeCAD flies in, drops a parcel on the
porch and rings the bell. Whoever it's for walks out, picks it up, carries it inside, sets it down
and unboxes it, and the item flies to its place:

| Item | What happens |
|---|---|
| 🍵 Matcha tin | Mug and battery refilled |
| 🦆 Rubber duck · 🪴 plant · 🏆 trophy | Go on the desk |
| 🍕 Pizza | Goes on the dining table (they can't eat it) |
| 🔋 Battery pack | Full charge |
| 🎈 Balloons | Float by the desk, music starts, Mr. Agent dances |
| ⌨️ RGB keyboard | Kuma types faster |
| 🐧 Linux USB | Kuma's PC runs Linux for 90 s of peace, until Windows Update "restores" Windows |
| 💻 MacBook Air | Kuma is overjoyed and Windows stops nagging for a while |
| 🧰 Spare parts kit | Repairs a broken Mr. Agent (Kuma will do it if it's his) |

## Talking to him

The chat panel runs **Qwen3-1.7B** (`Qwen3-1.7B-q4f16_1-MLC`) locally through
[WebLLM](https://github.com/mlc-ai/web-llm) on WebGPU, in a Web Worker. The weights (about 1 GB)
only load when you first open the chat, and the model unloads itself after 10 idle minutes to
give the memory back. The browser caches the download, so it reloads in seconds. Each message goes to the model with what he's doing right now, how
damaged he is and how often he's been punched. The model answers in schema-constrained JSON:
a reply, an action (walk to any room or spot, make matcha, watch TV, nap, dance, come
over, visit Kuma, let you drive…) and a mood. He refuses rude, harmful or impossible
requests. Without WebGPU, or while the weights are still downloading, a rule-based parser
stands in. Set `localStorage['mragent.qwen'] = 'off'` to never load the model.

In the chat the AI is called **MrAgent**, and it doesn't know how it was built: replies
that mention FreeCAD or CAD are cut out.

**Inside his brain (I, or 🧠 Brain).** His head turns to glass and shows a brain modelled in
FreeCAD (two lobes, folds, glowing neurons and a stem), which lights up and pulses while he
thinks. A panel shows his vitals and what he's doing, his private inner monologue streaming in
token by token as the AI writes it, the decision he made, exactly what his mind was told and
the raw JSON it wrote back, and a memory log of everything he's done and been through. Switch the chat to Kuma and the panel shows Kuma's brain instead: his grumpy thoughts, how his PC is doing, his patience, and a memory of every blue screen and pop-up.

**Kuma has his own AI** (the 🐻 Kuma tab, or click him). He uses the same model with his own
personality: grumpy, sarcastic, worn down by Windows and jealous of Mr. Agent's Mac. He's told
how his PC is doing (updating, blue-screened, how many crashes today) and what Mr. Agent
is up to. He can't leave his chair, but he can slam the desk, cheer, lean back, get back to
work, restart his PC, or call Mr. Agent over to help.

## Breaking him

The torso is a hollow FreeCAD shell with a separate chest plate. Behind the plate are the
parts you see once it's knocked off: a spine, a glowing reactor core in a gimbal cage,
battery cells, circuit boards with chips, shoulder servos and a loom of red, blue,
yellow and black wires. Loose parts tumble with simple rigid-body physics: gravity,
contact at the corners of each part's box, bounce and friction. Exposed wires spark and
smoke, and his visor cracks and glitches. After the last hit he collapses. Repair puts
everything back.

## Kuma and the Windows PC

Kuma's robot code is copied unchanged from agent-bot-3d into `src/kuma/`. He sits at an RGB gaming
desk, with a tower PC and a gaming chair modelled in FreeCAD, and types on his keyboard.
The PC forces updates, blue-screens, and nags him about Edge, OneDrive and Copilot, and he
reacts to each one: waiting with his hands behind his head, or slamming the desk.
Click the monitor for the full Windows 11 parody:
- a "Let's finish setting up your device" screen with no way to say no
- a Start menu full of ads, and Widgets full of clickbait
- a File Explorer that is slow on purpose
- Edge begging you not to download Chrome
- Settings that won't let you personalise without activation, and default apps set one file type at a time
- Control Panel sending you back to Settings
- a Store that throws error 0x80070005
- Teams that never loads, plus Copilot, Command Prompt, Task Manager, Notepad with "✨ Rewrite", and Candy Crush
- Updates and blue screens that close your windows
- Recall, which saves "snapshots" of everything, including your password, and can't really be turned off
- Paint whose AI features cost credits you don't have
- Get Help, which loops back to "have you tried restarting?"
- the new Outlook with ads in the inbox and no way back
- a Calculator that needs a 412 MB update before it adds numbers
- Photos whose "memories" are blue screens
- a print queue of 47 documents for a printer Kuma doesn't own
- Registry Editor values that TrustedInstaller won't let you change
- PC Health Check saying the PC can't run Windows 11 while it's running Windows 11
- Disk Cleanup that frees 0 bytes
- Windows Security quarantining Kuma's own code
- Xbox sign-in errors
- deleted Edge shortcuts that come back, and Candy Crush reinstalling itself after updates
- a lock screen whose PIN only works on the third try
- an "All apps" list
- more pop-ups, each with its own reaction from Kuma

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

## Keeping it light

- The AI model loads only when you open the chat and unloads after 10 idle minutes.
- It draws at most 60 frames a second, and 30 while the window isn't focused.
- Shadows are refreshed every other frame.
- Screens, faces and the TV skip redrawing while they're off-screen or the Mac or Windows simulator is open.
- Parts smaller than about 4 cm don't cast shadows.
- Mr. Agent's repeated finger parts are drawn as one instanced batch, and meshes that share a bone and a material are merged.
- Debris and sparks stop simulating once they settle.

None of this changes how anything looks. Together they cut draw calls per frame by about a quarter.

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

- `cad/build_models.py`: the FreeCAD model of the robot and office
- `cad/house.py`: the floor plan and every piece of furniture in the rest of the house
- `cad/extras.py`: the robot's insides and chest plate, and Kuma's desk, PC and chair
- `src/ai/`: Qwen via WebLLM (`agent.js`, `worker.js`) and the rule-based fallback
- `src/scene/damage.js`: punches, flying parts, sparks, smoke, repair
- `src/kuma/`: Kuma's robot (from agent-bot-3d) and `kuma.js`, which poses him at his desk
- `src/win/`: Kuma's Windows PC: `pc.js` (state machine + monitor image), `os.js` + `win.css` (the simulator)
- `src/scene/robot.js`: rig, two-bone IK for arms and legs, gait, fingers, pistons, neck cables
- `src/scene/brain.js`: what he does and when
- `src/scene/face.js`: the eyes on his visor
- `src/scene/screen.js`, `code.js`: the laptop display and the code he writes
- `src/scene/props.js`: the office props
- `src/scene/house.js`: floors, walls with cutaway, furniture, TV, fridge, garden and sky
- `src/scene/world.js`: lighting, day/night, post-processing
- `src/scene/nav.js`: A\* pathfinding
- `src/audio.js`: all sounds and the lo-fi music, synthesised with WebAudio
- `src/mac/`: the Mac: `os.js` (window manager, Dock, menus, overlays), `vfs.js`, `apps/`
