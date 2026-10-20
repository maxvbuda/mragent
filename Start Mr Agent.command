#!/bin/bash
# Double-click to start Mr. Agent. Keep this window open while you use it.
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
npx vite --port 5180 --open
