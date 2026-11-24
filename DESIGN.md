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
  space: "#000000"
  space-glow: "#0b1324"
  globe-ocean-dark: "#000f2d"
  globe-land-dark: "#287365"
  globe-ice-dark: "#6c80a2"
  globe-ocean-light: "#4a82ce"
  globe-land-light: "#9bcda1"
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

## Fil rouge (direction artistique, 22/11/2026)

À relire avant chaque écran, chaque bloc, chaque retouche. Source : les 5 images de Romain, gardées sur le Mac dans `references/` (hors dépôt) : calendrier en verre sur une route de montagne, app Panora sur fond de montagne, pastilles de réservation en verre chaud, widgets santé « Next Period / Temperature », onboarding en verre avec choix à émojis. Tout nouvel écran se juge contre elles.

1. **Le monde, c'est le paysage.** Chaque écran sans tracé à lire (accueil, connexion, Communauté, Mes parcours, profils, réglages sur iPhone) se pose sur une photo de paysage plein cadre (20 en rotation, `public/scenes/`), jamais sur un fond uni. Là où un parcours doit se lire (Créer, propositions, détail, suivi), la carte prend le relais **sans changer de monde** : carte « Paysage » aux tons des photos (terres mousse, forêts profondes, eau sarcelle, relief éclairé chaud, noms en blanc), bords voilés de la teinte de la photo du moment, ciel 3D de la même teinte, même verre fumé et texte blanc. La photo se dissout dans la carte en perdant sa netteté. Le plan clair reste un choix, pour le plein soleil.
2. **Des blocs de verre posés sur la photo.** Verre fumé teinté par la photo (flou 30 px, voile sombre de 30 à 44 %), liseré clair d'un demi-pixel, rayon de 26 à 32 px (pastilles entièrement rondes), ombre longue et douce. Jamais de bloc dans un bloc. Sur Mac, une colonne centrée de 460 px ; sur iPhone, pleine largeur, 16 px de marge.
3. **La composition des widgets santé.** En tête, un grand bloc récapitulatif : étiquette en haut à gauche, détail en haut à droite, un chiffre héros, un trait fin, puis une petite visualisation des 28 derniers jours. Ensuite des petits blocs deux par ligne (étiquette + chiffre), qui servent aussi d'onglets. Puis le contenu, en blocs larges.
4. **Les chiffres parlent.** Grands, en graisse 600, arrondis et tabulaires, unité petite à côté. Étiquettes d'un ou deux mots, en blanc à 70 %. Aucun petit texte explicatif.
5. **La couleur vient de la photo.** Le rose #FF2D55 seulement pour l'action principale et ce qui est choisi ; les couleurs des sports seulement dans les graphiques et les pastilles de légende. Sélection : pastille blanche pleine au texte sombre (comme « Weekly »), ou liseré blanc de 2 px autour d'un bloc.
6. **Des graphiques fins.** Barres par jour sur 28 jours (aujourd'hui cerclé), courbe douce avec un point lumineux, piste en pointillés, légende en pastilles de couleur.
7. **Icônes et émojis.** Icônes au trait fin (Phosphor regular) pour les actions ; un émoji par étiquette pour situer (🗓️ ⏱️ 📍 ❤️ 👣 🔥) ; boutons ronds en verre (flèche, réglage, +).
8. **Les contrôles.** Action principale : pastille rose pleine (blanche pleine sur une photo très sombre, comme « Continue ») ; liens texte en blanc sur la photo ; choix en lignes de verre avec émoji et coche ; onglets en capsule de verre où une pastille glisse.
9. **Le mouvement.** La photo dérive lentement et se fond toutes les 5 minutes ; les blocs montent en cascade avec un léger ressort ; le panneau glisse au centre sur Mac ; la bulle de l'onglet choisi s'étire vers son nouvel onglet puis se resserre (comme Deezer), et tout bouton de verre gonfle sous le doigt. Rien ne clignote.
10. **Le centre de l'écran d'abord (iPhone).** Une seule ligne en bas : la capsule des onglets et la bulle rose « Faire une boucle » ; le contenu défile dessous. Pas de poignée ni de titre sur les onglets principaux : le premier bloc est tout en haut. Résumé replié d'un parcours sur une ligne, ▶ pour suivre. Météo en une pastille. Au lancement, une vue d'ensemble, jamais un gros plan sur la position.
11. **Une seule grammaire.** Un nouvel écran reprend d'abord les blocs existants (`.cards`, `.card.wide`, `.tabcard`, `.photo-card`, `ActivityBars`) ; s'il en faut un nouveau, il rejoint ce fichier.

**Avant de livrer :** photo derrière ? Seulement des blocs de verre ? Un chiffre héros par bloc ? Des étiquettes d'un ou deux mots ? Le rose réservé à l'action ? Lisible sur la photo la plus claire (s8, s17) comme sur la plus sombre (s9, s20) ?


## Overview

**Creative North Star: "The Map Under Glass"**

The full-bleed map is the product. Everything else is a single sheet of lightly frosted glass laid over it: a bottom sheet with detents on iPhone, a floating 384 px column on the left on Mac. The world is Apple's own: iOS 26 / macOS Tahoe Liquid Glass, with a specular rim, concentric corners, capsules everywhere a control can be a capsule, SF Pro from the system stack and SF Pro Rounded for figures. The map underneath is custom and deliberately quiet (warm grey land, sage woods, pale blue water, pale wheat fields, a soft hillshade) so that the one saturated thing on screen is the route.

Colour is rationed. One tint, Apple pink, carries every action and the route itself; the route then breaks that pink into a five-step slope ramp from light rose to deep garnet, so the line on the map and the elevation profile below it speak the same language. Environment colours (forest, water, park, fields, town) are borrowed from the map's own fills and deepened until they read as data, then reused in chips and breakdown bars. Location is the one other hue: system blue, reserved for "where I am".

Density is native-app, not web page: 44 px minimum targets, 16 px panel gutters, grouped lists with inset hairlines, big rounded figures for distance and climb. On iPhone the interface is deliberately compact (Romain found the first version too big): quiet 13 px labels, figures as the only large type, a medium detent that stops right under the climb slider, and the map first. Motion is short and physical: a 200 ms exponential ease-out for state, real damped springs (CSS `linear()` curves) for the sheet, thumbs, switches and chips, digits that roll like a counter when a figure changes, a light haptic tick where the platform allows it, and one orchestrated moment, "the trace": when routes are found the iPhone sheet drops to a one-line summary, the base map recedes behind a veil and a lit pen draws the route, with the profile and the figures following the same pen (see Motion).

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
- **Space** (`space`, `space-glow`): the black around the globe seen from afar, in both appearances, with a faint blue glow behind the planet.
- **Globe** (`globe-*`): the drawn Earth, sampled from Apple Plans in dark mode: navy oceans, teal-green land, olive deserts, blue-grey ice; a brighter atlas palette in light mode.

### Tertiary
- **Slope Ramp** (`slope-flat` to `slope-severe`): flat (under 2 %) in light rose, then climbs from 2, 5, 8 and 12 % in pink to deep garnet. Used for the selected route line on the map, the elevation profile fill, the climb markers and their legend. Value carries steepness.
- **Descent Ramp** (`#9F9CF5`, `#7B77EA`, `#5A55D8`, `#3C37B4`): descents from 2, 5, 8 and 12 % in lavender to indigo, so D− reads apart from D+ at a glance (before, descents were drawn as flat). Indigo stays clear of the water blue and the location blue.
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
**The One Tint Rule.** Pink means "act" or "the route". If an element is neither, it is grey. Location blue, the descent indigo and the data series are the only other hues, and they never style a button background.

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
- **Map controls (zoom):** on Mac only, a second glass pill under the main one holds + and −, as in Apple Plans; − repeated leads to the whole Earth.
- **Map controls:** one vertical control-glass pill on the right (12 px in; 72 px under the safe area on iPhone, 12 px from the top on Mac): map type, locate, 3D, then the compass when the map is rotated. The data attribution "i" sits 12 px under the pill, whatever its height (the pill publishes its bottom edge in `--ctrls-bottom`). The map type opens a panel-glass card to the left of the pill, 24 px radius, with two 96 x 64 thumbnails (14 px radius): "Plan" drawn in the map palette with a pink loop, "Satellite" a real IGN tile around the start. The selected one gets an inset 2.5 px pink ring and a pink label; a 0.6875rem footnote under them says where the photos come from.
- **Mac (860 px and up):** the same content in a floating glass column, 384 px wide, inset 12 px on top, left and bottom. Proposals stack vertically. Once a route is selected the elevation profile floats as a glass dock at the bottom of the map, from 408 px to 72 px off the right edge, max 980 px wide, with the slope legend (a nine-step bar from steep descent to steep climb) in its header.
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

**The Space Is Night Rule.** Around the globe, space is always dark, in light mode too, like Plans. The glass over it simply picks up the dark through its blur.

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
- **Slider:** 6 px track (iPhone 4 px), pink fill to the value, Fill beyond; a 28 px white knob (iPhone 24 px) that, while dragged, grows to 1.28x and turns to clear glass with a bright inner rim. "Off" state ("Indifférent") greys the whole track. Each step crossed (1 km, or 5 km on a bike; 50 m of climb, 100 m on a bike) plays a haptic tick where the platform allows it and always a visible one: the knob swells to 1.42x with a pink halo for 200 ms; the ends swell to 1.55x on a spring.
- **Switch:** iOS 51 x 31 px, Fill when off, pink when on, 27 px white knob on a bouncy spring. On iPhone the options use the system switch itself (`<input type="checkbox" switch>`, tinted pink), which is also the only control Safari lets vibrate since iOS 26.5.

### Cards / Containers
- **Proposal card:** 22 px radius, Group Fill, no shadow, 10 / 14 px padding, a 12 px-radius route thumbnail drawn in Label 3 (pink when selected) on the left, name (2 lines max), metadata, fit row. Selected: inset 2 px pink ring.
- **Placeholder card:** while the other proposals are still being found, a card of the same size holds their place under the first one: a dashed Label 3 circle where the thumbnail goes, "Autres propositions…" in Label 2 and two Fill 2 bars, a faint sheen sweeping it every 1.3 s. The real cards take its place; nothing jumps. Hidden from assistive tech; a polite status announces the search instead.
- **Grouped list:** Group Fill, 18 to 20 px radius, 50 px rows, 0.5 px separators inset to clear the leading icon.
- **Banner:** 16 px radius, Fill 2; error variant uses a 14% pink wash and a pink icon.

### Inputs / Fields
- **Search field:** 44 px capsule on Fill 2 with a leading magnifier in Label 2, text at 1.0625rem, placeholder Label 3, pink caret.
- **Place capsule:** 52 px capsule with a 36 px pink disc icon (destination: Label disc), small Label 2 title over a 600 value; floating over the map it becomes control glass.
- **Stops:** the places after the start, in route order: "Passer par" (the must-visit place: a 26 px pink-wash disc with a filled diamond, pink 600 label "Passer par un lieu" and a Label 2 "facultatif"; once set, a place capsule with a 36 px grey remove circle) then "Destination" for "Vers un lieu", with a footnote on clicking the map. On Mac they sit in the column header under the start capsule so they are never scrolled away; on iPhone they follow the shape control.
- **Focus:** a 2.5 px outline of 75% pink, 2 px offset, everywhere; the slider moves it onto the knob as a 3 px ring.

### Navigation
Inside the panel: on Mac a brand row (pink squircle logo, "Boucle" at 1.375rem 750) with two small transparent pills ("Créer", "Mes parcours"), the active one on Fill 2. Sub-views use a centred title between 40 px round grey buttons. On iPhone the library is reached from the round glass button in the top bar, with a pink count badge.

### 3D city
The "3D" map button (it reads "2D" while active, as in Apple Plans, and flips on a spring) raises the terrain (1.4x) and the buildings. Buildings are `fill-extrusion` volumes from the OpenMapTiles building layer at their real height (OSM levels), coloured in three material tones by height, never in pink: houses under 10 m in warm sand (`#E4D6BD`, dark `#423D35`), apartment buildings from 10 to 30 m in warm grey (`#D2CEC7`, dark `#4B4C53`), towers from 30 m in slate (`#AFB8C9`, dark `#5C6782`; at night taller is lighter). Volumes grow with the zoom between 13 and 13.8 so the city rises as the camera tilts (60° and at least zoom 14.8 while composing; a whole-route refit at 52° when a route is shown), and fade in over 650 ms. A soft south-west light shades the façades, and a sky with horizon fog fills the top of a tilted map. A glass legend capsule ("Maison · Immeuble · Tour") appears only while volumes are visible: above the sheet on iPhone, at the top-left of the map on Mac.

### Globe
Zoomed out, the map is the Earth seen from space, drawn like Apple Plans (MapLibre globe projection, flat from zoom 12). The planet is NASA Blue Marble (relief and sea floors) recoloured pixel by pixel in the browser (`src/lib/earth.ts`, a `terre://` tile protocol): water follows depth from abyss to shelf, land follows its brightness from dense forest to desert, ice its whiteness, in the `globe-*` palettes. The last rows of the polar tiles fade to one colour, so the pole caps MapLibre stretches beyond 85° stay smooth instead of fanning out. On it, as in Plans: continents in letter-spaced grey capitals, oceans in blue italic on three lines, the biggest cities with a small ring (a curated list for the whole planet, tile data from zoom 3), seas from zoom 2.6, country names from zoom 2.6 as the continents fade, and the equator (thin line), tropics and polar circles (dotted) with italic names. Names fade before they reach the edge of the globe (the visible horizon is computed from the camera perspective), so nothing spills into space. It reads as a ball, not a disc: a circle laid exactly over the globe (same centre and apparent radius, perspective included, between the map and its markers) darkens the limb (up to 34% in dark mode, 28% in light) and draws the atmosphere, a 1 px blue rim with a 10 px and a 40 px glow; it fades in from 1.7 zoom levels above the whole-planet view and out when the map tilts. MapLibre's atmosphere adds its own even glow, the sun placed behind the viewer from afar. Seen from afar, the basemap's ground and water take the drawn Earth's flat colours (`EARTH_FLAT`), so while the NASA images load the planet is already whole and calm, never patchy; the images of the whole-planet view are fetched as soon as a zoom-out passes zoom 8 (kept 3 days by the browser). It all fades into the quiet basemap between zoom 4.2 and 5.6.

The whole planet always has the same size, about 90% of the short side of the visible part of the map, centred in it (above the sheet on iPhone, right of the column on Mac). MapLibre enlarges the globe as the centre moves towards a pole, so this zoom is computed from the centre latitude and the camera perspective. Arriving at the Earth is one gesture: a zoom-out that ends at country scale (within 4.2 zoom levels of the whole-planet view: zoom 6.1 on a laptop, 6.8 on an ultra-wide screen, 4.5 on iPhone) carries on by itself to the whole planet, north up and flat, easing in and out over 1.1 to 2.3 s; if the map is still moving when the gesture ends, the glide waits for it to stop. A mouse wheel notch zooms 0.38 level (MapLibre's default, 0.15, took dozens of notches to leave a city), and the wheel is followed directly on the map element, because MapLibre does not pass a mouse wheel's event to the zooms it starts. Zooming further out overshoots a little (0.3 zoom) and springs back in 480 ms. Around the planet, space is black in both appearances, with a faint `space-glow` behind it and two tiles of faint stars (389 and 557 px, so the repeat never shows). A far jump (a place more than 40 km away, or anything from the globe) flies over the planet with a computed duration up to 3.6 s; near moves keep their 850 to 900 ms glide.

### Plan and Satellite
Satellite lays IGN aerial photos (France, up to 20 cm per pixel) over the plan's fills and under its paths and names; the NASA photo of the Earth, untouched apart from its smoothed pole caps, covers the rest of the world from afar. Roads drop to 38% so the photos carry them, paths and tracks turn white and cream so trails stay readable under trees, every place name becomes white with a 62% black halo, and the focus veil becomes a 30% shadow instead of a land-coloured wash. In 3D the photos drape over the relief and the building volumes drop to 62% opacity so the photographed roofs show through. The choice is remembered.

### Scale and way back
- **Scale:** appears top-left of the map while a gesture zooms (pinch, wheel, keys), never during automatic camera moves, and fades 1.5 s after: "0" and a round length ("200 m", "2 km") in 11 px rounded tabular figures over a 4 px bar in two halves (near-black and white) with a white rim. Measured at the centre of the visible area; hidden on the globe, where one scale would lie. White figures on a dark halo over photos and space.
- **Way back:** when the start (composing) or the shown route (results) has left the visible area, or the camera is too far out to read it, a control-glass capsule appears just above the sheet (Mac: bottom centre of the map, above the profile dock): pink 600 label "Revenir au départ" with a start-dot glyph, or "Revenir au parcours" with the path icon. It springs in and frames the start's area or the whole route again.

### Conditions
"Si tu pars maintenant" in the route detail: a grouped list of two rows, weather at the start (Open-Meteo: "13 °C · Bruine", "Vent d’ouest à 24 km/h") and daylight at the estimated return ("Retour vers 17 h 52, au crépuscule", "Coucher du soleil à 17 h 27"). Sun times are computed on the device. The leading icon is Label 2, and turns warning amber when the run starts or ends in the dark. Not shown for a run already done (history). While composing, the "Rues éclairées" option reads "Nuit à 18 h 02 ce soir" or "Il fait nuit en ce moment".

### Rolling figures
Every figure the user watches change (slider values, the route summary and stats, the remaining distance in live follow) is a `RollingNumber`: each digit is a 0 to 9 strip clipped to one line that springs to its new value, digits are aligned from the right so units never jump, and a new leading digit slides in. Screen readers get the plain value. Reduce Motion turns the roll into an instant change.

### Haptics
`haptic()` plays a tick (sliders, sheet snaps, proposal change), a tap (segments, chips, actions, a point placed on the map) or a double success / warning (route traced, favourite or outing added, creation failed). Android uses the Vibration API. Safari on iPhone has none; its system switch (`<input type="checkbox" switch>`) plays the tick when it toggles. iOS 17.4 to 26.4 let code toggle a hidden one; since 26.5 only a real touch on a switch or on its label counts. So every button carries `use:tactile`: an invisible label laid over it, tied to the hidden switch. The finger touches the label, the switch toggles and iOS ticks, then the click bubbles to the button as usual (keyboard and VoiceOver activation stay on the button; disabled buttons let the touch through without a tick). Option rows are real switches. A slider being dragged cannot tick on a current iPhone: its feedback is the knob bump.

### Motion
One authored moment, the rest feedback and continuity. Shared timing lives in `src/lib/motion.ts`.
- **The trace (focal):** when routes are found, a pen (white core ringed in pink, soft pink glow) draws the chosen route from the start over 1.1 to 2 s (longer routes take longer), on a curve that starts softly, runs, and lands softly (two 2.4-power arcs joined at 40% with equal speed). A blurred pink halo lights the drawn part, then fades over 1.1 s. Kilometre markers appear as the pen reaches them, climb pills when it passes their middle, the other proposals fade in at 82% of the trace. The elevation profile is clipped to the same progress with its own pen dot, and the figures (distance, climb, duration) count up with it on their rolling digits: the counter is the route. When the pen lands, the start (or the arrival of a one-way route) swells once and a pink ring leaves it, with the success haptic. Choosing another proposal swaps the route at once.
- **3D:** the camera tilts while swinging 14° and back to the original heading (pendulum, two sine eases), the relief rises from flat to its exaggeration in 1.4 s (MapLibre reads `terrain.exaggeration` at every frame, nothing reloads), and buildings fade in from 260 ms. Back to 2D is faster: relief sinks in 0.48 s, camera eases flat in 0.65 s. The compass stays hidden during the swing.
- **Plan and Satellite:** images crossfade (photos in over 0.64 s, out in 0.42 s); road and label colours follow the style's 300 ms transitions.
- **Searching:** a sonar: two pink rings leave the start every 1.7 s and fade at the edge of the explored zone, which breathes slowly; a light sheen sweeps the busy button. A refusal makes the button shake once ("no" with the head) as the error slides in. The first good proposal is shown as soon as it exists (usually within 1 to 3 s): the sonar stops, the trace starts, and the others join quietly. Their lines fade in on the map (at 82% of the trace, or right away if it is done) and their cards replace the placeholder; the route being traced is never restarted. The "Autres propositions" button spins until the search ends.
- **Feedback:** chips and segment icons pop on a spring; Favorite and Done send a ring and a glow from their icon; proposals arrive one after another from blur to sharp, their mini routes drawing themselves; lists (library, search results) cascade in 40 ms steps; banners slide in.
- **Reduce Motion:** no pen, no swing, no rising relief, no sonar (the zone just lights up); crossfades and colour changes stay, as they carry state.

### Home and first launch
- **First launch:** the map, veiled (78% paper, 18 px blur), and one question at the bottom: the app icon whose loop draws itself, "Boucle" in 36 px bold, one line of promise, then Créer un compte (tinted capsule), Se connecter (fill pill) and a quiet "Plus tard" (App Store rule: route creation never requires an account). The account flow (email, code, profile) happens in the same card.
- **Home:** the map alone. Three controls float at the bottom, centred: Mes parcours (52 px glass circle), Faire une boucle (58 px tinted capsule, the logo loop turning in once), Communauté (glass circle, or the member's avatar). On iPhone the map pill keeps only Me localiser; on Mac the Plans controls stay. No reach circle until the settings are open.
- **Settings sheet:** rises from the bottom edge with the sheet spring (640 ms) to nearly the full screen, almost opaque (94% paper), a chevron-down to fold it back; its sections arrive one after another (50 ms apart, 18 px rise). Every selection taps (segments, chips, switches, slider steps). On Mac the column slides in from the left instead.

### Community
Strava's social layer in Boucle's vocabulary: no new visual language, the same grouped lists, pills and capsules.
- **Navigation:** a third tab (Créer · Communauté · Mes parcours) on its own full-width segmented row under the brand on Mac; on iPhone a glass round button (three people) next to the library button. The community header carries the member's avatar (or a person icon when signed out) on the right.
- **Feed item:** a row in the grouped list: avatar (initial on a habitat hue, stable per member), first name, level, city and relative date; then the route glyph (54 px), name (2 lines), stats, distance from you; a footer with the heart (count) and comments (count), and "Repris N fois" on the right. The heart fills pink and pops on a spring when liked.
- **Feed modes:** segmented Autour de toi · Abonnements · Populaires, then sport chips (pink tint when on). Feed routes are drawn on the map as thin pink lines over a casing; touching one opens it.
- **Loading:** a skeleton of the list (dashed glyph circles and bars) pulsing softly; never a spinner in the content.
- **Empty states teach:** what to do next and one button to do it (create a route, see nearby).
- **Account flow, in the panel, never a modal:** email → 6-digit code (large tabular digits, one-time-code autofill) → profile form. The action that asked for an account resumes after it (like, comment, follow, publish).
- **Route detail (community):** author row with a Suivre pill above the title, description, actions J'aime (filled heart, count) · Favori · Fait · GPX · Partager · Réutiliser, then Signaler / Masquer as small secondary text buttons, and comments as Group Fill bubbles with a composer (pink round send button).
- **Publish and report:** forms that replace the panel content with a close button; publish shows the route glyph, name, description and the "Masquer mon départ" switch (on by default).
- **Profile:** 64 px avatar, name, level and city, sports in pink icons, four counts in one grouped strip, Suivre / Modifier le profil, the member's routes, and for oneself the account group (sign out, privacy, terms) with an in-page two-step account deletion in system red.

### Climbs and descents
Notable climbs and descents ("Côtes et descentes") are found on the profile: high and low points with a 4 m hysteresis, flat ends trimmed, kept from 12 m of gain, 120 m of length and a 2 % average, at most eight, in route order. Each one is a small glass capsule on the map at its midpoint (a 18 px disc in its slope colour with a trend arrow, then "+28 m · 4 %" in rounded 11 px tabular figures), a row in the results ("Montée raide", "km 0,3 · 0,7 km à 4 % · max 7,8 %", "+28 m"), and, once touched, a halo of its colour under the route, a camera fit on it, a tinted band with its gain over the profile and a dark ring on its capsule. During live follow, the HUD announces the current or next one within 1.5 km ("Descente dans 170 m : 0,5 km à 3 %"). In 3D the terrain exaggeration follows the route's relief (2.4x under 40 m of range down to 1.3x in mountains) and the hillshade strengthens, so the hills of a flat city still read.

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
- **Don't** let the map style grow louder: land stays warm grey, fills stay pale, so the route remains the only saturated line. The drawn globe is the one exception, and it has faded out (zoom 5.4) long before a route can be read.

## Photo Scenes (21/11/2026)

Two worlds now share the app. **The map** stays wherever there is a route to see (composing on Mac, proposals, detail, live follow, the Community feed). **Landscape photography** fills the screens without a route: the welcome screen, the iPhone composer (the photo follows the sport: golden forest path for running, peaks above a sea of clouds for trail, a green road in the mist for road cycling, layered hills for gravel), Mes parcours and profiles. Photos are Unsplash (free licence), shipped in `public/scenes/`, cached at runtime, faded in over their dominant tone and drifting very slowly (48 s, off under Reduce Motion), with a soft top and bottom veil.

On a photo, everything switches to **smoked glass**: the `.on-photo` token set (white labels, translucent white fills, dark glass at 0.3 to 0.44 alpha, brighter specular rim, longer black shadow), in both appearances. The iPhone composer drops its sheet entirely: each group (sport and sliders, Milieu, Forme, Sol, Options) is its own 28 px `.photo-card` of real glass over the sharp photo. Active pills turn solid pink on photos (the pink wash lacks contrast there).

**Summary blocks**: short, factual widgets with native emoji and small bar charts, never explanations. The "Aujourd'hui" widget floats on the map (iPhone home, Mac composer): weather emoji and temperature, sunrise or sunset, wind, then this week's distance with seven day bars (today in pink). Mes parcours opens on a month summary (main sport emoji, km, outings, time, favourites) with eight weekly bars. Profile stats carry emoji (🗺️ 👥 ❤️). Route fit checks start with an emoji (📏 ⛰️ 🌲 💧 📍).

### Update 22/11/2026: rotation, icon tabs, fluidity
- Twenty HD photos (`public/scenes/s1..s20`, `-m` portrait 1290 x 2600 for phones, `-l` 2560 px landscape for large screens) rotate every five minutes, the same everywhere at the same moment (`sceneAt`), cross-faded over 1.2 s; the next one is fetched and decoded 40 s ahead. The backdrop stays mounted once shown and only fades (460 ms), so going from a map screen to a photo screen never reloads anything.
- Sections are icons only (path, users, bookmark, avatar). iPhone: a floating Liquid Glass capsule tab bar with a pink pill sliding under the active icon on a bouncy spring. Mac: the logo (its loop draws itself) and the same icon segmented control on one row; the app name is gone.
- Tab changes cross-fade through View Transitions (240 ms). The Community feed and the current photo are prepared at idle, so the first open is instant.
- The "Aujourd'hui" widget keeps only weather, light and wind.

## Update 22/11/2026 (accounts)

- **First launch on Mac:** only the welcome card floats on the photo; the composer panel is not rendered until the welcome closes, then slides in as usual.
- **Password:** creating an account is still e-mail, then a 6-digit code (it proves the address), then the profile, which now ends with a password field (eye toggle, `PasswordField.svelte`, 8 characters minimum). Signing in is e-mail and password on one card; "Mot de passe oublié" sends a code and asks for the new password on the same card. The password can be changed in Modifier, Compte, Mot de passe. A visually hidden username field carries the e-mail so password managers file the credential correctly.
- **Rotation:** 20 landscapes (lakes, forest bridge, golden valley, sea at dusk, desert road, misty hills, Dolomites, Milky Way…), each with its dominant tone, so the five-minute cycle repeats every 100 minutes.

## Update 22/11/2026 (Communauté on the photo)

- **Communauté** now follows Mes parcours exactly (fil rouge): on the photo, a wide summary block (feed title, place or follow count, sport emoji + route count hero, members on the right, hairline, 28-day bars of published kilometres with the sport legend), then three tab blocks on one row (Autour, Suivis, Populaires: label alone on top, emoji beside the big count, white 2 px ring when chosen), sport chips as glass pills (chosen = solid white pill, dark text), then one glass block per route (`.c-li.glass.photo-card`, `content-visibility: auto`). Empty and error states are wide glass blocks with the dashed loop. The three feeds are kept in memory per sport filter (`community.feedCounts`), so tab counts are real and switching is instant.
- **Sign-in** always sits on the photo, as a glass block (`.sheet-card`). From the Profil tab it belongs to that tab: Profil stays lit, the title reads "Profil", no close button. On iPhone, any photo screen keeps the panel at full height, even when a tab change asks for half.

## Update 22/11/2026 (carte Paysage)

- **Map type "Paysage" is the default** (`MapType = 'paysage' | 'plan' | 'satellite'`, flag `planClair`): `buildStyle(theme, paysage)` swaps in the PAYSAGE palette (dusk landscape seen from above: land #28312C, wood #1C3324, park #284530, water #18404F, minor roads #515B55, major #77827B, motorway gold #B89F6C, cream paths #D9CEB0, white labels on a 0.8 dark halo, warm hillshade at 0.46, 0.62 in 3D). It behaves as the dark theme for everything else (globe, route casing, markers). Satellite sits on the Paysage base; going to or from the light Plan rebuilds the style.
- **One glass everywhere:** with Paysage or Satellite, `html` carries `.on-photo`, so every control over the map (composer panel, proposals, elevation dock, controls, tab bar, Today card) uses the smoked glass and white text of the photo screens; the light Plan brings the light interface back. Browser theme colour follows (#28312C).
- **The photo of the moment reaches the map** (`scene.svelte.ts`, `sceneNow`): an `.atmo` veil tints the top (58 %), bottom (42 %) and corners of the map with the current photo's tone, cross-fading through the registered `--tone` property when the photo changes; in 3D, sky, horizon and fog are mixed from that tone.
- **Dissolve:** the backdrop photo blurs (18 px) as it fades into the map and comes back into focus when a photo screen opens.

## Update 22/11/2026 (iPhone, centre de l'écran)

- **Tab roots on photo** (Communauté, Mes parcours, my profile, Profil sign-in) are full-screen `Panel.fullscreen` (no grabber, `headless`): first block right under the status bar, content scrolling under the floating tab bar (`--tabs-h` bottom padding). Sheets and the composer keep their header (close, title) but are full-screen too.
- **Tab bar**: one floating row, `.dock` = glass capsule with the four tabs + the pink liquid-glass bubble "Faire une boucle" (62 px, folds to zero width in results/detail). The selected-tab lens is lighter glass (gradient, inner highlights, backdrop brightness 1.12); on tab change it stretches (scale 1.36 × 1.12) then settles with a spring; it swells under the finger.
- **Results on iPhone**: the folded sheet is one row (‹, distance · D+ · time with dots, ↻, pink ▶ "Suivre ce parcours"); no footer button. Folded height = header only (a vanished footer's stale height no longer leaves an empty grey band).
- **Today** on iPhone is a one-line pill (sky, temperature, place). **Launch** opens at zoom 12 around the start, never zooming in on the position. **Auth** fields carry their name inside ("Adresse mail", "Mot de passe", "Code à 6 chiffres"), compact header.
- **Liquid glass**: on photo and Paysage, glass gets thickness (inner top glow, inner bottom shade, hairline), photo cards brighten what they cover (brightness 1.05) with a faint text shadow, icons get a soft drop shadow, round glass buttons swell (1.12) under the finger instead of shrinking. The map veil is a little lighter (top 50 %, bottom 35 %, corners 25 %).

## Update 22/11/2026 (lentille Deezer)

- **Tab lens copied from Deezer** (frame by frame from Romain's screen recording, `src/lib/lens.ts`): at rest the selected tab is a pill darker than the bar (`rgba(0,0,0,0.34)`), its icon filled in the accent pink, its label white. On change, the pill turns into a clear glass lens taller than the bar (×1.36 high), bright rim, iridescent edges (pink left, blue right), that magnifies the tabs under it (×1.24, a live copy kept aligned through affine keyframes since Safari cannot refract the backdrop); it travels stretched (up to ×1.62 wide) and retracts into the pill at the new tab, ~560 ms. Same lens on the Mac header tabs; pressing the lit tab swells the lens in place. Both bars carry their own `view-transition-name` and skip the page cross-fade, so the lens stays visible.
- **iPhone tab bar** now has Deezer's short labels under the icons (Créer, Communauté, Parcours, Profil); 54 px tabs, 66 px pink bubble.
- **Crisp icons**: no drop-shadow on icons anywhere (it read as blurred and clipped).
- **Bottom strip**: iOS 26 can leave an unpainted band under the tab bar (WebKit bug with fixed layouts and the home-indicator inset); the page background and browser theme colour now take the tone of the bottom of the screen (Paysage mixed with the photo of the moment), so the band melts into the screen instead of showing as a grey rectangle.

## Update 22/11/2026 (menu fixe, verre réparé)

- **Mac menu fixed at top centre** (`header.menu`, glass capsule: logo, four tabs, iPhone): the same place on every tab; panels start under it (`top: 76px`), the Today card too; map framing keeps 100 px at the top.
- **The glass blur was broken** (cards looked like flat tint, hard to read): two causes, both now fixed and worth remembering.
  1. A permanent `view-transition-name` on a container makes it a backdrop root in Chromium/WebKit: its glass children no longer see the photo behind. Names (`panel`, `tabbar`, `menu-mac`) are now set only under `html.vt`, i.e. during a tab change.
  2. Entrance animations that fade `opacity` with `animation-fill-mode: both` stay "in effect" forever and isolate the element: all of them now use `backwards` (same look, released at the end).
- **Legibility**: photo-card glass `rgba(10,12,14,0.4)`, no backdrop brightening, `--label-2` at 82 % white, a slightly stronger text shadow.
- **Lens fluidity**: transform and opacity only (no layout per frame), 400 ms, starts on pointer down, lighter backdrop blur (4 px); the resting pill no longer slides under the lens.
- **Living photos**: Ken Burns drift 28 s alternate (scale 1.02 → 1.13 with a 3 % pan) and, on Mac, a gentle parallax away from the pointer (up to 18 × 12 px).


## Update 22/11/2026 (santé, règles graduées, lieux, mouvement)

- **Photos in perfect quality**: 20 Unsplash photos re-downloaded from their originals (sources in `public/scenes/SOURCES.md`), 4096 × 2731 for wide screens and 1440 × 3120 for iPhone, JPEG 86 / 84 (AVIF and WebP band in smooth skies). Seven replaced: four were too small (2 200 to 3 169 px), one was a portrait photo, two were near-duplicates. The size is chosen from the real pixels of the screen; the drift zooms 6 % at most inside a 6 % margin, so nothing is ever upscaled beyond the source, even on a 3440 px ultra-wide screen. New URLs (`?v=2`) and a new offline cache (`scenes-2`), the old one is deleted.
- **Tab lens, Deezer-exact** (`src/lib/lens.ts`): one continuous spring motion sampled at 120 Hz into compositor keyframes (no per-segment easing, no stop-and-go). The lens lifts on touch (70 ms), travels on a spring (ω 32, ζ 0.8) stretched by its speed, waits while the finger is down, and settles into the pill on release (190 ms). On iPhone the finger can slide along the bar: the lens follows and picks the tab under the finger. The page changes at once during the travel, without a cross-fade (no View Transition on tab change); the new blocks rise in cascade. On Mac the column slides to the centre by a transform-only FLIP.
- **Créer on Mac**: the left column takes the full window height (top 12 px) when the window is at least 1 190 px wide (the centred menu no longer overlaps it).
- **Graduated rulers** replace the distance and D+ sliders (`Ruler.svelte`): the value is large above, the ruler slides under a fixed pink mark, both ends fade into a progressive blur. Fine, discreet ticks every step (0.1 km for running, 0.5 km trail, 1 km bike; 10 m of D+); only the numbered ticks are white and tall (no medium white tick between two units). Drag with momentum (a slow, precise drag has none), tap to jump, trackpad swipe on Mac, arrow keys; a tick haptic at each numbered mark.
- **No more "Sol"** section: the surface follows the sport.
- **Places to highlight** (`ZonesCard.svelte`, under the weather card): a compact glass capsule of five icons only, no scrolling (track, park, water, forest, fountain; names on hover and for screen readers). An icon lights the matching map features (vector tiles, instant): vivid fill under the labels and a glowing outline; small places (athletics tracks, drinking fountains) get a round pin whose halo opens when chosen, and a small white badge counts how many are on screen. If they only exist closer in, the map zooms in.
- **Health on the profile**: a widget like Apple Health (ring of steps towards 10 000 filling up, the count rising, the week in bars with today in pink, then walking distance, active energy and exercise), then four small blocks (7-day average, resting heart rate, VO2 max, 28 days). Without data, a wide "Apple Santé" card leads to the link sheet (key, shortcut, send).
- **Motion system** (fil rouge): what appears rises and settles on a spring (`.rise`), what opens from a button pops from it (`.pop`), charts grow from their base (`.grow-x`, `.grow-y`), numbers count up (`CountUp.svelte`: profile, Mes parcours, Communauté, weather). Always `animation-fill-mode: backwards` (see the glass pitfall above), transform and opacity only, staggered by `--i`.

## Update 22/11/2026 (mode Dessin)

- **Draw the route** (`DrawPad.svelte`, in the Forme block, loops only): a row « Dessiner le parcours » folded by default; touching it unfolds a square dotted notebook. Draw with a finger or the mouse; strokes chain in order (links dashed), the last one returns to the start (white dot ringed in pink). Four ready shapes (round, square, heart, star) draw themselves in one stroke; undo, clear. Unfolded with a drawing, the CTA becomes « Tracer mon dessin », D+ and Milieu are greyed (`inert`), waypoints are hidden.
- **Engine** (`src/lib/art.ts`, `drawing.ts`): the streets around the start are read from the map's vector tiles into a distance field (exact Euclidean transform); the drawing is posed hundreds of ways (start point anywhere on the stroke, ±15°, ±6 % size) on the device, the best poses go to Valhalla map matching (`trace_route`, one request each), broken pieces are linked, parasitic out-and-backs removed (never the drawing's tips), the size is corrected to the requested distance. Resemblance = coverage × precision at 1.5 % of the drawing's size (85–96 % for a good rendering, about 75 % when a part is missing).
- **Results**: cards named after the shape (« Cœur par … »), « ✏️ Ressemblance au dessin » in the fits, the drawing as posed shown as a white dotted line under the route on the map.
- **Milieu on one line**: five equal tiles, icon above a short name (Forêt, Eau, Parcs, Campagne, Ville).

## Update 23/11/2026 (dessin fidèle, meilleur endroit, idées, lieux mis au point)

- **Drawing engine rework** (`src/lib/art.ts`): where map matching breaks (river without bridge, closed grounds), the links now run through points of the drawing itself instead of the shortest path, so no part of the drawing is ever skipped; the size ratio is learnt only from faithful routes (a broken route used to make the next drawing bigger and bigger). Measured on Nantes: hearts, stars and squares 85–95 %, a 100 km heart by bike 88–93 %.
- **Where to draw** (in the notebook): the departure row (« Changer » to pick home instead of the current position), a ruler « Lieu du dessin » from « Au départ » up to 15 km (40 km by bike): the drawing is posed thousands of ways over that whole area (coarse map at zoom 12, then refined at zoom 13) and goes where the streets fit it best. « Y aller depuis le départ » puts the access leg at the start of the route; the map shows where the drawing starts (white dot ringed in pink), the fits say « 🧭 Accès … compris » or « 📍 Le dessin commence à … ».
- **Ideas from a sentence**: a chat bubble at the top of the notebook (« Un diamant, 2027, un chat… »): ideas appear as thumbnails, from a built-in library (≈ 40 single-stroke shapes, a stroke font for letters and years) and, once its key is set, from Claude (`supabase/functions/dessin`, 20 requests per member per day, ✨ badge).
- **Places, accurate and focused** (`src/lib/zones.ts`): six icons (tracks, parks, water, forests, fountains, toilets). Athletics tracks are recognised by their shape in the tiles (oval ring 80–230 m long, ≥ 70 % fill), which drops race courses, karting, BMX and roller tracks; parks are public parks only. Lighting a kind dims the map behind (veil), flies to the nearest place with a beating halo, and a bubble under the bar gives its name, distance and ‹ › to the next ones. Tracks are drawn like real tracks (green infield, brick ring about 10 m wide, white lane lines); small places get round pins with their icon.

## Update 23/11/2026 (pistes partout, fiche d'un lieu, Mes lieux)

- **Every track, at every zoom** (`src/lib/tracks.ts`, `public/data/pistes.json`): athletics tracks of France and its neighbours come from a one-off OpenStreetMap index (`scripts/pistes-telecharger.sh` then `scripts/pistes.mjs`: shape test, other sports dropped, stadium name nearby). Far away they gather in orange clusters with a white count (tap: zoom in), then become round pins, then from zoom 12.5 each track is **redrawn as seen from the sky** at its real size and orientation: brick ring, white lane lines (from z15), finish line, green infield with a football pitch (contour, halfway line, centre circle, boxes), a soft orange glow. Outside the index, tiles are still read (zoom ≥ 11).
- **Lighting a kind** shows the nearest ones at a glance (map fitted to the reference point and the 5 nearest, the nearest beats); the bubble under the bar names it — tapping it, or ‹ ›, opens it.
- **Place card** (`PlaceCard.svelte`, smoked glass like the bar): two photos side by side, 128 px high, 22 px corners — the IGN aerial view (a track rotated to lie horizontal) and a ground photo aimed at the place (Panoramax 360° photos cropped toward the place, or a matching Wikimedia Commons photo), small « Vue du ciel » / « Sur place » tags, tap to enlarge with the author's credit. Name, what is known (« Piste d'athlétisme · 400 m · 8 couloirs · synthétique · à 0,7 km »), then the pink pill « Partir d'ici » and a glass « Enregistrer » that turns into a white « Enregistré ». Above the tab bar on iPhone, bottom-centre of the map on Mac; the map frames the place above it.
- **Mes lieux** (`saved.svelte.ts`, `SaveSheet.svelte`, Mes parcours › 📍 Lieux): like Google Maps saved lists. Lists are glass chips with emoji and count (chosen: solid white); default lists Mes adresses 🏠, Favoris ❤️, À essayer 🚩, plus one's own. « Ajouter Domicile / Travail / École » rows until they exist. The save sheet: big emoji on a white disc, name field, suggested names, a 7 × 2 emoji grid, the lists as glass rows with a check, « Nouvelle liste » inline. Saved places show on the map as white discs with their emoji (name from zoom 12.5) and come first in the departure search.

## Update 23/11/2026 (checkpoint fil rouge)

- **One gutter** (`--gutter`, 16 px on iPhone, 12 px on Mac): weather and places widgets, map controls, place card and buildings legend now line up with the tab bar on both sides.
- **Modal glass** (`.glass.modal-glass`): the search and the save sheet use a denser smoked glass (86 %) over a darker scrim, so the screen below no longer reads through; the place card fades out under the save sheet, and « Revenir au départ » hides while a card is open.
- **Tab blocks** of Mes parcours now follow Communauté exactly: the label alone on top, the emoji beside the big count, 13 px padding, three per row.
- Vertical rhythm on the map: 8 px between the weather pill, the places bar and the focus bubble.
- iPhone tabs switch on finger-up (`lens.ts`), and a new version installs on launch or when the app goes to the background, never on a tab change.
- **Profile stat blocks** follow the same pattern as the tab blocks (label alone, emoji beside the count); « Sports » keeps its emojis as the value.
- **iPhone panel over the map** (proposals, detail): denser smoked glass (74 %) when open, so the pink route no longer reads through the text; folded on one line it stays light.
- A route opened from the feed starts at the top of the panel (the list's scroll position used to carry over and hide the author under the header). The hidden haptic switch gives focus back to the tapped button.

## Update 23/11/2026 (iPhone épuré, façon Instagram)

- **Tab bar: icons only** (25 px, the lit one in its dark pill), no labels; bar 62 px, pink loop bubble 62 px. It sits low, 22 px above the bottom of the screen like Instagram.
- **iOS 26 home-screen band** (WebKit 301108): while the page is shorter than the screen, the installed app gets a viewport short by the status bar, and everything fixed at the bottom stops above an empty band. Fix in `app.css`: under `@media (display-mode: standalone)`, `html { min-height: min(100lvh, calc(100% + env(safe-area-inset-top))) }`. (A first attempt measuring the band in JS did nothing and was removed.)
- **Map home on iPhone**: no weather pill (the weather stays on Mac and in the proposals); the places bar is the first thing at the top, aligned with the locate button (safe area + 8 px). The focus bubble is gone: lighting a kind opens the nearest place's card over the overview, with « 1/12 » and ‹ › to step through.
- **Enregistrer un lieu**: a round glass button with a pin-plus under the map controls, in Créer on iPhone and Mac; it opens the search in save mode (address, my position, point on the map).
- **Map credits without the (i) button**: a discreet « © OpenStreetMap » text just above the tab bar or the panel (bottom-right on Mac); tapping it unfolds every credit (licences require them).
- Lighter top and bottom veil on the map (40 % / 27 %, shorter).
- **Phone blocks a bit more compact** in Communauté, Mes parcours and Profil: 12 × 14 px padding, 24 px corners, 12 px labels, hero figures 2.375 rem, tab figures 1.75 rem. Signed out, « Rejoins la Communauté » sits in the middle of the screen.
- **Tab bar, 5 icons**: the four tabs plus « Enregistrer un lieu » (pin-plus), an action that opens the save search from the Créer map. On iPhone the map's right column is now locate + 3D (the map-type switch stays on Mac); the pin-plus moved to the tab bar (Mac keeps it under the map controls).
- Top of the iPhone screens a little lower, clear of the blur iOS puts under the status bar: places bar and map buttons at safe area + 14 px, first block of the photo screens at safe area + 22 px.

## Update 23/11/2026 (Mac : la carte d'abord)

- **The Mac menu** keeps only the four sections and « Enregistrer un lieu » (pin-plus, right end): no app logo on the left, no iPhone/QR button (the QR card stays inside the settings).
- **Settings closed by default on Mac**: Créer shows the map alone, with the weather and places widgets at the left gutter and a pink pill « Créer un parcours » (52 px, path icon) centred at the bottom of the map. It opens the settings column on the left; a ✕ in its header closes it. A place card opens above the pill.

## Update 23/11/2026 (fiche Enregistrer épurée, connexion par Santé)

- **Save sheet reduced to name + lists**: no emoji grid, no suggested names. A full-width name field (address below it), then the lists as glass rows. Each list's emoji disc carries a small white pencil badge; tapping it unfolds a 6 × 2 emoji strip under that row (the chosen one on a white disc) and changes the list's emoji. A saved place now shows its list's emoji everywhere (map pin, Mes lieux, search).
- **Saved places fade out when zoomed out**: hidden below zoom 9.6 (wider than a metropolitan area), fading back in up to 10.4.
- **Lighter top veil on the map**: 24 % of the photo tone over the top 12 % (was 40 % over 15 %); the bottom veil is unchanged.
- **Sign in with Health (phone app only)**: in the account sheet, above the e-mail field, a white pill « Continuer avec Apple Santé » (Android: « Continuer avec Health Connect ») with a red heart, then « ou avec ton adresse mail » between two hairlines. The system Health sheet opens; once allowed, a phone account opens with no e-mail or password, and the profile step skips the password. In Compte, such an account shows « Compte de ce téléphone, ouvert avec Santé » instead of password and sign-out.

## Update 24/11/2026 (suivi en direct, écran verrouillé, magnétisme, dessins)

- **Live tracking screen, like Strava's recording screen**: the map on top, one dense glass panel at the bottom (`modal-glass`, 32 px corners, gutter margins, 520 px max on Mac). A 4 px pink progress line along its top edge; hero row with the distance done (2.75 rem, rolling digits, « faits sur 10,2 km ») on the left and the moving time (chrono 27:41, « en mouvement ») on the right; then a 3 × 2 grid of small tiles (fill-2, 18 px corners, 12 px label, 1.25 rem value): Allure (Vitesse on a bike), Moyenne, Restant, D+ fait / total, Arrivée (clock), Fait % (Max on a bike). Two pills at the bottom: Pause / Reprendre (turns pink when paused, the chrono blinks grey) and Terminer (pink text). Recenter button floats just above the panel on the right.
- **Top bubble during tracking** (glass pill, centred under the status bar): GPS searching (blinking blue dot), off-route warning (orange, distance in m or km), or the coming climb « Montée dans 300 m · 0,7 km à 4 % ».
- **Lock screen** (phone app only): Android shows a silent ongoing notification (pink accent, loop icon) with « 3,42 km · 5:12 /km », « Reste 6,6 km · arrivée 18:42 », the ticking chrono, a progress bar and Pause / Terminer buttons. iPhone gets a Live Activity: title line with runner glyph and arrival time, distance and chrono in 34 pt rounded bold, metric and remaining distance, pink progress bar; Dynamic Island shows the distance (compact) and distance + chrono (expanded).
- **Magnetism when placing a point** (start, waypoint, finish, place to save): within 34 px of a highlighted place (fountain, toilets, track, park, saved place), the hover pin springs onto it (220 ms spring, bigger halo) and the label names it (« Passer par : Fontaine d'eau potable »); the click places the point exactly there, with that name.
- **Drawing ideas**: 124 single-line silhouettes taken from Phosphor fill icons (outer contour plus large details), so « vache » draws a cow head, « fusée » a rocket; plurals, synonyms and one-letter typos match. Writing the word in letters is only the fallback.

## Update 24/11/2026 (ouverture, Santé en détail, fluidité)

- **Launch intro** (index.html, shown from the very first frame, before the code loads): dark green-black radial background with a soft pink glow; the app icon's loop traces itself in pink (24 segments fading in one after another), a white dot with a pink halo runs along it from the start marker, then « Boucle » rises in bold rounded type. When the map has drawn its first complete image (at least 1.5 s after launch, at most 3.5 s) the loop zooms through the screen while the intro fades out onto the app. Only opacity and transform animations, so the GPU plays it smoothly even while the app's code runs. Reduced motion: the loop and the word, static, with a simple fade.
- **Health in detail**: every Health block opens a sheet (dense smoked glass, like « Enregistrer ») with a chip row for the metric (Pas, Marche et course, Énergie, Exercice, Sorties, Fréquence au repos, VO2 max), a 7 / 28 days switch, the hero figure (daily average, latest measure, or the day touched on the chart), the change vs the week before (green when better), a bar chart (cumulative metrics, today in the metric's colour, dashed average, dotted goal) or a line chart (levels), three tiles (total / best day / goal reached, or average / best / range) and the day-by-day list (or the list of workouts with pace and source).
- **Smoothness**: the photo backdrop now appears with a fade and a slight zoom (an animated full-screen blur made the iPhone stutter); its slow drift pauses while scrolling so the glass blocks above it don't recompute their blur every frame; proposals arrive with a fade and slight scale instead of an animated blur.
- **Smoothness, second pass**: the map renders at the screen's pixel ratio but never above 2 (an iPhone at 3× drew 2.25 times more pixels for no visible gain on a moving map) nor above 8.3 million pixels (very large Retina screens); the photo's drift stops as soon as you act (scroll, touch, click, wheel, keyboard, screen change) and resumes 1.5 s later, so the glass blocks above it don't re-blur every frame during a gesture; long Mes parcours lists skip drawing rows outside the screen.

## Update 24/11/2026 (ouverture façon « sortie enregistrée »)

- **Launch film, 3.3 to 5 s** (generated by `scripts/intro.py` into index.html): a night city plan in perspective (thin streets, a river) drifts slowly like a camera dolly; the app icon's loop, enlarged, traces itself in pink with a glowing comet head (ease-in-out over 1.8 s), km markers 3, 6, 9 pop as it passes; three stats roll like an odometer under it (Distance 10,2 km, Temps 51:24, Dénivelé 128 m, faded column edges); when the loop closes a ring bursts from the start with twelve sparks; « Boucle » rises letter by letter above it.
- **Arrival on the map**: a hole opens at the centre of the loop and grows until it swallows the screen (the real map shows through the loop first), the loop pushes past the camera, the stats and title sink away; the map, waiting 1.1 zoom levels higher, lands with a 1.8 s ease-out; then the interface arrives piece by piece (menu and widgets from above, map buttons from the side, tab bar and « Créer un parcours » from below, 300 to 640 ms apart).
- Only opacity and transform are animated while the app loads (masks and blurs are static), so the film stays smooth on the phone. Reduced motion: a still frame, then a 300 ms fade.

