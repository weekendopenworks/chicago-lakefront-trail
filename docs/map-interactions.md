# Map interactions

The homepage map is a tall illustrated atlas. Scrolling moves south along the trail, and the view follows the shoreline horizontally. A drag pans in both directions; zoom ranges from 0.5× to 4×. Place markers stay on their source coordinates at every zoom level, with fixed-size touch targets and labels.

## Input

| Input | Behavior |
| --- | --- |
| Touch | One finger pans; flicks keep gliding and slow down naturally, and a touch stops a glide without selecting a place. Two fingers pinch-zoom around their midpoint. Double-tap on empty map zooms in. |
| Mouse | Drag pans exactly. The wheel scrolls along the trail. Double-click zooms in; Shift+double-click zooms out. Ctrl+wheel zooms at the pointer. |
| Trackpad | Two-finger vertical swipes scroll; sideways swipes pan without triggering browser back/forward. Pinch zooms the map at the pointer rather than the whole page. |
| Keyboard | Tab moves between places, and the map follows the focused place. `+`/`−` zoom, ←/→ pan, ↑/↓, Page Up/Down and Space scroll. Escape closes details and the filter menu. |
| Buttons | `+`/`−` zoom in half steps with a short eased animation. The desktop trail overview provides N to restore the opening view and reset zoom and pan, and S to move to the southern trail end. Both keep the selected filter. The overview is hidden on narrow screens and touch devices; swipe or scroll to move along the trail. |

With reduced motion requested, zoom and jumps become instant, and momentum glides are disabled.

New navigation takes priority over unfinished motion. Selecting a place, changing history, jumping to a trail end, touching the details panel, or leaving the window stops the previous map animation. Catching a glide does not select a place, even if the finger rests before lifting. Markers entering the viewport keep their readable size throughout touch, wheel and button zoom.

## Place details

On desktop, selecting a place opens a non-modal details panel on the right; the map stays usable beside it. A draggable scrollbar appears when the content overflows.

On phones and touch devices, details fill the screen. The native modal dialog hides the map and keeps keyboard focus inside the discovery. Visitors scroll and pinch-zoom with the browser's normal gestures. The popup scrollbar stays visible whenever content overflows. The X closes details; a deliberate rightward swipe from the left-edge handle also returns to the map. Swipes elsewhere keep their normal reading behavior. The handle hides while browser zoom is magnified, and a second finger or interrupted gesture cancels dismissal. Browser zoom stays enabled; the interface does not resize itself around the zoomed visual viewport.

Scrolling inside details never moves the map, including at the top and bottom edges. Closing details keeps the camera still. Focus returns to the opening control when focus was inside the panel; otherwise it stays where the visitor left it. A place label selects that place just like its dot. Mobile navigation, filter, zoom and close controls have at least 44-pixel-high touch targets.

Opening a place updates the URL (`?place=<id>`), and Back/Forward move between places. A plain map position is shareable as `?at=<latitude>`.

## Loading and failures

Map tiles load lazily near the viewport, with lightweight previews underneath. Failed data, tiles and photos show a retry option, and the place list at `/places/` remains available without JavaScript.

## Tests

`npm run check:zoom` drives trusted Chromium touch input: pinches, interrupted gestures, browser zoom and panel scrolling at both edges. `npm run check:browser` covers cards, photos, filters, history and every marker hotspot at both zoom extremes. `npm run check:engines` repeats the main flows in Chromium, Firefox and WebKit at seven viewport sizes. `npm run check:motion` covers animated navigation, wheel/keyboard input and touch momentum; `npm run check:popups` checks fullscreen details, scrolling, focus, history, rotation and the desktop side panel. `npm run check:performance` measures pinch, button zoom, wheel zoom or glide frame timing under CPU slowdown. See [development](development.md) for setup and limitations. Emulation does not replace testing on physical phones and in Safari on Apple devices.
