---
name: Boucle
description: A full-bleed quiet map under one Liquid Glass panel that composes a running or cycling route and shows its relief.
colors:
  tint: "#ff2d55"
  tint-deep: "#c8103c"
  tint-soft: "rgba(255, 45, 85, 0.13)"
  tint-dark: "#ff375f"
  tint-deep-dark: "#ff6f8c"
  on-tint: "#ffffff"
  location-blue: "#0a84ff"
  warn-amber: "#ff9f0a"
  ok-green: "#248a3d"
  ok-green-dark: "#30d158"
  label: "#1c1c1e"
  label-2: "rgba(60, 60, 67, 0.72)"
  label-3: "rgba(60, 60, 67, 0.46)"
  label-dark: "#f5f5f7"
  separator: "rgba(60, 60, 67, 0.17)"
  fill: "rgba(120, 120, 128, 0.2)"
  fill-2: "rgba(120, 120, 128, 0.12)"
  fill-group: "rgba(255, 255, 255, 0.58)"
  glass-panel: "rgba(250, 250, 249, 0.76)"
  glass-ctl: "rgba(255, 255, 255, 0.62)"
  glass-panel-dark: "rgba(32, 32, 35, 0.68)"
  glass-ctl-dark: "rgba(44, 44, 48, 0.6)"
  map-land: "#f2f1ed"
  map-land-dark: "#1e1f21"
  map-wood: "#cbe2bf"
  map-park: "#d5ebc6"
  map-fields: "#f0ebdb"
  map-water: "#a9d2f0"
  env-forest: "#3f7a33"
  env-water: "#3990d0"
  env-park: "#5c9933"
  env-fields: "#a2872f"
  env-urban: "#8e8a80"
  surf-paved: "#8e8e93"
  surf-compacted: "#c49a5a"
  surf-dirt: "#8a6438"
  slope-flat: "#ff7a96"
  slope-gentle: "#ff2d55"
  slope-moderate: "#de1446"
  slope-steep: "#b00d38"
  slope-severe: "#7c0a2a"
typography:
  display-figure:
    fontFamily: "ui-rounded, 'SF Pro Rounded', -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.035em"
    fontFeature: "tnum"
  headline-figure:
    fontFamily: "ui-rounded, 'SF Pro Rounded', -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 650
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontFeature: "tnum"
  stat-figure:
    fontFamily: "ui-rounded, 'SF Pro Rounded', -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro', system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro', system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro', system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.3
  body-strong:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro', system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.005em"
  footnote:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro', system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.35
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro', system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  hairline: "3px"
  field: "12px"
  banner: "16px"
  group: "18px"
  card: "22px"
  controls-pill: "24px"
  dock: "26px"
  panel: "28px"
  sheet-top: "30px"
  sheet-bottom: "40px"
  capsule: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  panel-width: "384px"
  touch-min: "44px"
components:
  button-primary:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.on-tint}"
    typography: "{typography.title}"
    rounded: "{rounded.capsule}"
    padding: "0 22px"
    height: "52px"
    width: "100%"
  button-pill:
    backgroundColor: "{colors.fill-2}"
    textColor: "{colors.label}"
    rounded: "{rounded.capsule}"
    padding: "0 16px"
    height: "44px"
  button-pill-on:
    backgroundColor: "{colors.tint-soft}"
    textColor: "{colors.tint}"
  button-round-glass:
    backgroundColor: "{colors.glass-ctl}"
    textColor: "{colors.label}"
    rounded: "{rounded.capsule}"
    size: "44px"
  button-text:
    textColor: "{colors.tint}"
    padding: "0 4px"
    height: "44px"
  segmented:
    backgroundColor: "{colors.fill-2}"
    rounded: "{rounded.capsule}"
    padding: "3px"
    height: "34px"
  chip-environment:
    backgroundColor: "{colors.fill-2}"
    textColor: "{colors.label}"
    rounded: "{rounded.capsule}"
    padding: "0 14px 0 10px"
    height: "38px"
  card-proposal:
    backgroundColor: "{colors.fill-group}"
    rounded: "{rounded.card}"
    padding: "10px 14px 10px 10px"
  list-group:
    backgroundColor: "{colors.fill-group}"
    rounded: "{rounded.group}"
    padding: "6px 14px"
    height: "50px"
  field-search:
    backgroundColor: "{colors.fill-2}"
    textColor: "{colors.label}"
    rounded: "{rounded.capsule}"
    padding: "0 14px"
    height: "44px"
  banner:
    backgroundColor: "{colors.fill-2}"
    textColor: "{colors.label}"
    rounded: "{rounded.banner}"
    padding: "11px 14px"
  panel-glass:
    backgroundColor: "{colors.glass-panel}"
    rounded: "{rounded.panel}"
    padding: "14px 16px 16px"
    width: "{spacing.panel-width}"
---

# Design System: Boucle

## Overview

**Creative North Star: "The Map Under Glass"**

The full-bleed map is the product. Everything else is a single sheet of lightly frosted glass laid over it: a bottom sheet with detents on iPhone, a floating 384 px column on the left on Mac. The world is Apple's own: iOS 26 / macOS Tahoe Liquid Glass, with a specular rim, concentric corners, capsules everywhere a control can be a capsule, SF Pro from the system stack and SF Pro Rounded for figures. The map underneath is custom and deliberately quiet (warm grey land, sage woods, pale blue water, pale wheat fields, a soft hillshade) so that the one saturated thing on screen is the route.

Colour is rationed. One tint, Apple pink, carries every action and the route itself; the route then breaks that pink into a five-step slope ramp from light rose to deep garnet, so the line on the map and the elevation profile below it speak the same language. Environment colours (forest, water, park, fields, town) are borrowed from the map's own fills and deepened until they read as data, then reused in chips and breakdown bars. Location is the one other hue: system blue, reserved for "where I am".

Density is native-app, not web page: 44 px minimum targets, 16 px panel gutters, grouped lists with inset hairlines, big rounded figures for distance and climb. On iPhone the interface is deliberately compact (Romain found the first version too big): quiet 13 px labels, figures as the only large type, a medium detent that stops right under the climb slider, and the map first. Motion is short and physical: a 200 ms exponential ease-out for state, real damped springs (CSS `linear()` curves) for the sheet, thumbs, switches and chips, digits that roll like a counter when a figure changes, a light haptic tick where the platform allows it, and one orchestrated moment: when routes are found the iPhone sheet drops to a one-line summary, the base map recedes behind a veil and the route draws itself along it.

**Key Characteristics:**
- One glass surface over a full-bleed map; never a page.
- A single pink tint for actions and the route; everything else is system greys.
- Relief encoded in colour: the slope ramp on both the map line and the profile.
- Environment colours taken from the map's own fills, deepened to at least 3:1.
- SF Pro for text, SF Pro Rounded with tabular figures for every number that matters.
- Capsules, circles and concentric radii; no sharp corners on controls.
- Phosphor icons in regular weight, fill weight for the selected state.

## Colors

A quiet, warm-neutral map and iOS system greys, with one pink tint that also becomes the relief ramp.

### Primary
- **Apple Pink** (`tint`, dark `tint-dark`): the only action colour. Primary capsule, switch on-state, slider fill, selected card ring, pressed map controls, text buttons, caret, focus ring (75% mix), and the route casing's inner line. In dark mode it shifts to the system's dark pink.
- **Garnet Pink** (`tint-deep`, dark `tint-deep-dark`): text on the soft pink wash, for example the "Meilleur accord" tag. In dark mode it becomes lighter, not deeper, to keep contrast on glass.
- **Pink Wash** (`tint-soft`): selection highlight, "on" pills, pressed action circles, and the best-match tag background.

### Secondary
- **Location Blue** (`location-blue`): the locate button glyph and the "Ma position" search result disc. Never used for actions.

### Tertiary
- **Slope Ramp** (`slope-flat` to `slope-severe`): five classes labelled "Moins de 2 %", "2 à 5 %", "5 à 8 %", "8 à 12 %", "Plus de 12 %". Used for the selected route line on the map, the elevation profile fill, and its legend. Single hue, value carries steepness.
- **Environment series** (`env-forest`, `env-water`, `env-park`, `env-fields`, `env-urban`): the hue of the matching map fill, deepened to at least 3:1 against the panel (WCAG 1.4.11). Forest is darker than park so the two stay distinct. Used for chip icons, selected chip wash and ring, breakdown bars and dots. Dark mode has its own lighter set.
- **Surface series** (`surf-paved`, `surf-compacted`, `surf-dirt`): the ground-type breakdown ("Bitume", "Stabilisé", "Terre, sentier").
- **Status** (`ok-green`, `warn-amber`): green for a satisfied criterion check mark; amber for the off-route warning in live follow.

### Neutral
- **Label / Label 2 / Label 3** (`label`, `label-2`, `label-3`): iOS system label values; primary text, secondary text and metadata, tertiary icons and placeholders.
- **Separator** (`separator`): 0.5 px hairlines between rows, stats and the sheet footer.
- **Fill / Fill 2** (`fill`, `fill-2`): resting background of pills, chips, segmented controls, search field and round nav buttons (fill 2); pressed states, tracks and the sheet handle (fill).
- **Group Fill** (`fill-group`): white-ish wash for grouped lists and proposal cards inside the glass.
- **Panel Glass / Control Glass** (`glass-panel`, `glass-ctl`, dark variants): the two glass tints; panel is denser for reading, control is lighter for floating buttons.
- **Map Land / Wood / Park / Fields / Water** (`map-*`): the quiet basemap palette; a matching dark set lives in the map style.

### Named Rules
**The One Tint Rule.** Pink means "act" or "the route". If an element is neither, it is grey. Location blue and the data series are the only other hues, and they never style a button background.

**The Map Supplies the Data Colours Rule.** A data series colour must be the hue of its map fill, deepened in value until it reaches 3:1 against the panel. Do not invent a palette for charts.

## Typography

**Display Font:** SF Pro Rounded via `ui-rounded` (with system sans fallback), for figures only
**Body Font:** SF Pro via `-apple-system` (with system-ui, Helvetica Neue, Arial)

**Character:** The platform's own voice. SF Pro handles all words at native sizes; SF Pro Rounded with tabular figures turns distance, climb and time into the visual anchors of every view. The root size is fixed at 16 px on every device (Dynamic Type made the iPhone layout too large); iPhone sizes are set in the compact overrides below 860 px.

### Hierarchy
- **Display figure** (rounded, 700, 3rem, line-height 1, -0.035em): the remaining distance in live follow.
- **Headline figure** (rounded, 650, 2.125rem, line-height 1; iPhone 700, 1.625rem): distance and climb values above their sliders in the composer; the unit sits beside it at 1rem 600 in Label 2 (iPhone 0.8125rem).
- **Summary figure** (rounded, 700, 1.25rem, line-height 1, iPhone only): the one-line route summary in the folded sheet (distance, D+, duration), units at 0.75rem 600 in Label 2.
- **Stat figure** (rounded, 650, 1.625rem, line-height 1.1): the three-column stats of a route (Distance, Dénivelé +, Durée estimée), units in a 0.875rem 600 `small`.
- **Headline** (700, 1.375rem, -0.02em, balanced wrap): the route name in detail and the "Boucle" brand line (750).
- **Title** (650, 1.0625rem, -0.01em): centred navigation titles ("3 propositions"), empty-state titles, and the primary capsule label (600).
- **Body strong** (600, 0.9375rem): field labels ("Milieu", "Forme", "Sol", "Options"), card names, place values, pills (590). On iPhone field labels drop to 0.8125rem in Label 2 so the figures carry the hierarchy.
- **Body** (400, 1rem, line-height 1.3): default text and the search input (1.0625rem).
- **Footnote** (400, 0.8125rem, line-height 1.35, Label 2): hints, card metadata, row subtitles, breakdown legends.
- **Caption** (500, 0.75rem): stat labels, segmented labels under sport icons, tags, action labels, fit indicators.

### Named Rules
**The Rounded Numbers Rule.** Any figure the user decides on or runs against is set in SF Pro Rounded with tabular numerals. Words are never set in the rounded face, except the "3D" map toggle.

**The Native Ramp Rule.** Sizes stay on the iOS text-style ladder (0.75, 0.8125, 0.9375, 1.0625, 1.375 rem). Hierarchy comes from weight steps (500, 600, 650, 700) and Label 2 greys, never from capitals or tracking.

## Layout

One screen. The map is fixed full-bleed behind everything; glass floats above it.

- **iPhone (below 860 px):** a top bar 8 px under the safe area with the 46 px start-point capsule ("Ma position") and a 46 px round glass library button; a vertical glass pill of map controls on the right, 12 px in; and a bottom sheet inset 8 px from the edges with an 18 px drag handle, a scrolling body (4 px 16px 16px, in an inner wrapper so the sheet can fold to its header) and a footer pinned above the home indicator holding the primary capsule. Detents: folded (header and footer only, body faded out), medium (fitted to the content up to the element marked `data-fold`: the climb slider while composing, the elevation profile in results; at most 66% of the screen) and full. Proposals scroll horizontally as snap cards at full width minus 44 px so the next one peeks.
- **Route focus (iPhone):** when proposals arrive, or a saved route opens, the sheet folds to a one-line summary (back, summary figures, dots for the proposals, regenerate) above "Suivre ce parcours", and the map fits the whole route in the space left. Tapping the summary unfolds the sheet; swiping it sideways changes proposal.
- **Mac (860 px and up):** the same content in a floating glass column, 384 px wide, inset 12 px on top, left and bottom. Proposals stack vertically. Once a route is selected the elevation profile floats as a glass dock at the bottom of the map, from 408 px to 72 px off the right edge, max 980 px wide.
- **Rhythm:** 4 / 8 / 12 / 16 px. 16 px panel gutters and gap between composer blocks; 10 px inside a block; 8 px between chips and capsules in a row; 12 px between icon and text in rows and cards.
- **Targets:** 44 px minimum for every control; primary capsule and top-bar buttons 52 px; action circles 48 px.
- **Safe areas:** top and bottom insets come from `env(safe-area-inset-*)`; the sheet footer pads to the home indicator.

## Elevation & Depth

Depth is material, not stacking. There are two planes: the map, and glass over it. Glass is a translucent tint, a backdrop blur with boosted saturation, a 1 px specular rim drawn as a gradient border (bright at the top-left and bottom-right corners, clear along the sides), a radial sheen in the upper left, an inner top highlight and inner bottom shade, and a soft, long, negative-spread shadow tinted warm (dark mode uses black). Content inside glass is flat: cards and groups use the group fill and no shadows. Under Reduce Transparency the glass tints become nearly opaque (0.97 to 0.98 alpha).

### Shadow Vocabulary
- **Panel glass** (`box-shadow: 0 16px 44px -18px rgba(28, 26, 22, 0.38), 0 3px 10px -4px rgba(28, 26, 22, 0.14)`): the sheet, Mac column, profile dock, search overlay and follow HUD. Blur 30px, saturate 1.8.
- **Control glass** (`box-shadow: 0 8px 22px -10px rgba(28, 26, 22, 0.4), 0 2px 5px -2px rgba(28, 26, 22, 0.14)`): floating round buttons, the map control pill, toasts, the scrub tooltip, the attribution button. Blur 14px, saturate 1.9.
- **Tinted lift** (`box-shadow: 0 12px 26px -12px color-mix(in srgb, var(--tint) 80%, transparent)`): only under the primary capsule, with an inner top highlight.
- **Thumb** (`box-shadow: 0 3px 8px rgba(0,0,0,0.12), 0 1px 1px rgba(0,0,0,0.04)`): segmented thumb, slider and switch knobs.

### Named Rules
**The Two Planes Rule.** Only surfaces that float directly over the map are glass. Nothing inside a glass panel gets its own glass or shadow; it uses fills.

## Shapes

Capsules and circles for every control (999px, 50%). Containers use concentric radii that shrink as they nest: sheet 30 px top / 40 px bottom on iPhone (matching the device corner), Mac column 28 px, profile dock 26 px, map control pill 24 px, proposal cards 22 px, grouped lists 18 to 20 px, banners 16 px, inline name field and route thumbnails 12 px, tracks and bars 3 to 4 px. Borders are almost absent: 0.5 px separators, an inset 2 px pink ring for the selected card, an inset 1.5 px series-colour ring for a selected chip. The route on the map is a round-capped line on a white (dark: near-black) casing; the start point is a pink disc in a white ring; the must-visit place is a white diamond (17 px square turned 45°, 4 px radius) with a 3.5 px pink inner ring; the destination a near-black disc with a checkered square; kilometre markers are small white circles with a pink ring and number.

## Components

### Buttons
Tactile and quiet: every press scales down on a spring.
- **Shape:** full capsule (999px) or circle.
- **Primary capsule:** full-width, 52 px tall, Apple Pink with a radial highlight in the upper left, white 600 label at 1.0625rem, tinted lift shadow. One per view, pinned in the sheet footer ("Créer la boucle", "Suivre ce parcours"). While generating, an inner bar fills left to right as progress and a 52 px grey cancel circle sits beside it. Press: scale 0.97, brightness 0.94. Disabled: 55% opacity.
- **Pill:** 44 px, Fill 2, 590 weight; "on" state turns pink text on the pink wash. Press: scale 0.95 to Fill.
- **Round glass:** 44 px circle of control glass over the map (52 px in the top bar); pressed state (`aria-pressed`) tints the glyph pink. Map controls use the location blue glyph at rest.
- **Round grey:** 36 to 40 px circles on Fill 2 inside the panel for back, regenerate and rename.
- **Action circles:** 48 px Fill 2 circles with a pink glyph and a 0.75rem label below ("Enregistrer", "GPX", "Partager", "Inverser"), four in a row.
- **Text button:** pink 500 label, 44 px tall, no background.

### Chips
- **Environment chip:** 38 px capsule on Fill 2 with a series-coloured icon and 0.9375rem 500 label. Selected: an 18% wash of the series colour, inset 1.5 px ring at 85%, weight 600, icon switches to the fill weight.
- **Fit chips and tags:** small capsules on Fill 2 (0.75 to 0.8125rem); a satisfied criterion gets a green check; "Meilleur accord" uses Garnet Pink on the Pink Wash.

### Segmented control
A Fill 2 capsule with a 3 px inset and a white (dark: grey) sliding thumb on a bouncy spring (480 ms, about 5% overshoot). The tall variant for sport stacks a Phosphor icon over a caption ("Course", "Trail", "Vélo", "Gravel") on Mac and sets them side by side in a 38 px control on iPhone; the selected icon turns pink and filled while its label stays Label. iPhone segments are 30 px tall at 0.8125rem.

### Sliders and switches
- **Slider:** 6 px track (iPhone 4 px), pink fill to the value, Fill beyond; a 28 px white knob (iPhone 24 px) that, while dragged, grows to 1.28x and turns to clear glass with a bright inner rim. "Off" state ("Indifférent") greys the whole track. Each step crossed (1 km, or 5 km on a bike; 50 m of climb, 100 m on a bike) plays a haptic tick, and the ends a stronger tap.
- **Switch:** iOS 51 x 31 px, Fill when off, pink when on, 27 px white knob on a bouncy spring. On iPhone the options use the system switch itself (`<input type="checkbox" switch>`, tinted pink), which is also the only control Safari lets vibrate since iOS 26.5.

### Cards / Containers
- **Proposal card:** 22 px radius, Group Fill, no shadow, 10 / 14 px padding, a 12 px-radius route thumbnail drawn in Label 3 (pink when selected) on the left, name (2 lines max), metadata, fit row. Selected: inset 2 px pink ring.
- **Grouped list:** Group Fill, 18 to 20 px radius, 50 px rows, 0.5 px separators inset to clear the leading icon.
- **Banner:** 16 px radius, Fill 2; error variant uses a 14% pink wash and a pink icon.

### Inputs / Fields
- **Search field:** 44 px capsule on Fill 2 with a leading magnifier in Label 2, text at 1.0625rem, placeholder Label 3, pink caret.
- **Place capsule:** 52 px capsule with a 36 px pink disc icon (destination: Label disc), small Label 2 title over a 600 value; floating over the map it becomes control glass.
- **Stops:** the places after the start, in route order: "Passer par" (the must-visit place: a 26 px pink-wash disc with a filled diamond, pink 600 label "Passer par un lieu" and a Label 2 "facultatif"; once set, a place capsule with a 36 px grey remove circle) then "Destination" for "Vers un lieu", with a footnote on clicking the map. On Mac they sit in the column header under the start capsule so they are never scrolled away; on iPhone they follow the shape control.
- **Focus:** a 2.5 px outline of 75% pink, 2 px offset, everywhere; the slider moves it onto the knob as a 3 px ring.

### Navigation
Inside the panel: on Mac a brand row (pink squircle logo, "Boucle" at 1.375rem 750) with two small transparent pills ("Créer", "Mes parcours"), the active one on Fill 2. Sub-views use a centred title between 40 px round grey buttons. On iPhone the library is reached from the round glass button in the top bar, with a pink count badge.

### Rolling figures
Every figure the user watches change (slider values, the route summary and stats, the remaining distance in live follow) is a `RollingNumber`: each digit is a 0 to 9 strip clipped to one line that springs to its new value, digits are aligned from the right so units never jump, and a new leading digit slides in. Screen readers get the plain value. Reduce Motion turns the roll into an instant change.

### Haptics
`haptic()` plays a tick (sliders, sheet snaps, proposal change), a tap (segments, chips, actions, a point placed on the map) or a double success / warning (routes found, creation failed). Android uses the Vibration API. Safari on iPhone has none: a hidden system switch toggled from code gave the tick on iOS 17.4 to 26.4, and Apple stopped it in 26.5, so on current iPhones only the real option switches vibrate.

### Elevation profile (signature)
The line carries the relief. The selected route draws itself along the map with a cubic ease-out over 700 to 1400 ms, coloured segment by segment on the slope ramp, while a veil of the land colour (42% light, 34% dark, 700 ms) fades the base map behind it; kilometre markers scale from 7 to 9.5 px with the zoom. The profile below fills its area with the same ramp at 90% opacity under a Label-coloured edge at 55%, with dashed 2/3 grid lines and 11 px axis labels. Dragging or hovering it moves a white knob with a 3 px pink stroke and a glass tooltip capsule (km, altitude, grade) along the curve, and a matching glass lens moves along the route on the map.

### Live follow HUD
A panel-glass card under the status bar (max 520 px, 28 px radius) with the remaining distance in the display figure, side stats in Label 2 with 650 values, and a 6 px progress track in pink. A glass "stop" capsule with pink text and a blue locate circle float at the bottom.

## Do's and Don'ts

### Do:
- **Do** keep the map full-bleed and put every control on glass above it: panel glass for reading surfaces, control glass for floating buttons.
- **Do** use Apple Pink for the one primary action per view, for the route, and for selected states; leave everything else in system greys.
- **Do** colour any new data series from the map fill it describes, deepened to at least 3:1 against the panel, with a darker value when two series share a hue family.
- **Do** set decision and progress figures in SF Pro Rounded with tabular numerals; units smaller, in Label 2.
- **Do** keep controls at 44 px or more, as capsules or circles, and press-scale them on the spring curve (`cubic-bezier(0.22, 1, 0.36, 1)`).
- **Do** animate state with the 200 ms exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`) and collapse all motion to instant changes under Reduce Motion (the route appears whole, camera moves jump).
- **Do** use Phosphor regular weight icons, switching to the fill weight for the selected state.
- **Do** make glass nearly opaque under Reduce Transparency.

### Don't:
- **Don't** add a second accent colour or use location blue for anything but position.
- **Don't** put glass or shadows on elements inside a glass panel; nested content uses Fill 2 and Group Fill.
- **Don't** introduce uppercase or letter-spaced labels in the interface; tracked capitals belong only to the basemap's neighbourhood names.
- **Don't** use sharp corners or rectangular buttons; concentric radii only.
- **Don't** colour the route or the profile outside the five-step slope ramp.
- **Don't** let the map style grow louder: land stays warm grey, fills stay pale, so the route remains the only saturated line.
