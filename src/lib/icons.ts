/* Icônes Phosphor (licence MIT), graisse « regular », et « fill » pour l'état sélectionné, comme les SF Symbols. */
import run from '@phosphor-icons/core/assets/regular/person-simple-run.svg?raw';
import runF from '@phosphor-icons/core/assets/fill/person-simple-run-fill.svg?raw';
import hike from '@phosphor-icons/core/assets/regular/person-simple-hike.svg?raw';
import hikeF from '@phosphor-icons/core/assets/fill/person-simple-hike-fill.svg?raw';
import bicycle from '@phosphor-icons/core/assets/regular/bicycle.svg?raw';
import bicycleF from '@phosphor-icons/core/assets/fill/bicycle-fill.svg?raw';
import bike from '@phosphor-icons/core/assets/regular/person-simple-bike.svg?raw';
import bikeF from '@phosphor-icons/core/assets/fill/person-simple-bike-fill.svg?raw';
import tree from '@phosphor-icons/core/assets/regular/tree-evergreen.svg?raw';
import treeF from '@phosphor-icons/core/assets/fill/tree-evergreen-fill.svg?raw';
import waves from '@phosphor-icons/core/assets/regular/waves.svg?raw';
import wavesF from '@phosphor-icons/core/assets/fill/waves-fill.svg?raw';
import park from '@phosphor-icons/core/assets/regular/park.svg?raw';
import parkF from '@phosphor-icons/core/assets/fill/park-fill.svg?raw';
import grains from '@phosphor-icons/core/assets/regular/grains.svg?raw';
import grainsF from '@phosphor-icons/core/assets/fill/grains-fill.svg?raw';
import buildings from '@phosphor-icons/core/assets/regular/buildings.svg?raw';
import buildingsF from '@phosphor-icons/core/assets/fill/buildings-fill.svg?raw';
import search from '@phosphor-icons/core/assets/regular/magnifying-glass.svg?raw';
import locate from '@phosphor-icons/core/assets/regular/navigation-arrow.svg?raw';
import locateF from '@phosphor-icons/core/assets/fill/navigation-arrow-fill.svg?raw';
import cube from '@phosphor-icons/core/assets/regular/cube.svg?raw';
import cubeF from '@phosphor-icons/core/assets/fill/cube-fill.svg?raw';
import bookmark from '@phosphor-icons/core/assets/regular/bookmark-simple.svg?raw';
import bookmarkF from '@phosphor-icons/core/assets/fill/bookmark-simple-fill.svg?raw';
import list from '@phosphor-icons/core/assets/regular/list-bullets.svg?raw';
import back from '@phosphor-icons/core/assets/regular/caret-left.svg?raw';
import chevron from '@phosphor-icons/core/assets/regular/caret-right.svg?raw';
import down from '@phosphor-icons/core/assets/regular/caret-down.svg?raw';
import close from '@phosphor-icons/core/assets/regular/x.svg?raw';
import again from '@phosphor-icons/core/assets/regular/arrows-clockwise.svg?raw';
import swap from '@phosphor-icons/core/assets/regular/arrows-left-right.svg?raw';
import share from '@phosphor-icons/core/assets/regular/export.svg?raw';
import download from '@phosphor-icons/core/assets/regular/download-simple.svg?raw';
import link from '@phosphor-icons/core/assets/regular/link-simple.svg?raw';
import play from '@phosphor-icons/core/assets/fill/play-fill.svg?raw';
import stop from '@phosphor-icons/core/assets/fill/stop-fill.svg?raw';
import trash from '@phosphor-icons/core/assets/regular/trash.svg?raw';
import pencil from '@phosphor-icons/core/assets/regular/pencil-simple.svg?raw';
import check from '@phosphor-icons/core/assets/bold/check-bold.svg?raw';
import approx from '@phosphor-icons/core/assets/bold/approximate-equals-bold.svg?raw';
import warning from '@phosphor-icons/core/assets/regular/warning-circle.svg?raw';
import wind from '@phosphor-icons/core/assets/regular/wind.svg?raw';
import drop from '@phosphor-icons/core/assets/regular/drop.svg?raw';
import dropF from '@phosphor-icons/core/assets/fill/drop-fill.svg?raw';
import bulb from '@phosphor-icons/core/assets/regular/lightbulb.svg?raw';
import road from '@phosphor-icons/core/assets/regular/road-horizon.svg?raw';
import pin from '@phosphor-icons/core/assets/fill/map-pin-fill.svg?raw';
import crosshair from '@phosphor-icons/core/assets/regular/crosshair-simple.svg?raw';
import flag from '@phosphor-icons/core/assets/fill/flag-checkered-fill.svg?raw';
import plus from '@phosphor-icons/core/assets/bold/plus-bold.svg?raw';
import minus from '@phosphor-icons/core/assets/bold/minus-bold.svg?raw';
import gauge from '@phosphor-icons/core/assets/regular/gauge.svg?raw';
import compass from '@phosphor-icons/core/assets/regular/compass.svg?raw';
import upload from '@phosphor-icons/core/assets/regular/upload-simple.svg?raw';
import mountains from '@phosphor-icons/core/assets/regular/mountains.svg?raw';
import clock from '@phosphor-icons/core/assets/regular/clock.svg?raw';
import path from '@phosphor-icons/core/assets/regular/path.svg?raw';
import star from '@phosphor-icons/core/assets/regular/star.svg?raw';
import starF from '@phosphor-icons/core/assets/fill/star-fill.svg?raw';
import done from '@phosphor-icons/core/assets/regular/check-circle.svg?raw';
import doneF from '@phosphor-icons/core/assets/fill/check-circle-fill.svg?raw';
import history from '@phosphor-icons/core/assets/regular/clock-counter-clockwise.svg?raw';
import phone from '@phosphor-icons/core/assets/regular/device-mobile.svg?raw';
import remove from '@phosphor-icons/core/assets/fill/minus-circle-fill.svg?raw';

export const ICONS = {
  run, hike, bicycle, bike, tree, waves, park, grains, buildings, search, locate, cube, bookmark, list, back, chevron,
  down, close, again, swap, share, download, link, play, stop, trash, pencil, check, approx, warning, wind, drop, bulb, road,
  pin, crosshair, flag, plus, minus, gauge, compass, upload, mountains, clock, path, star, done, history, phone, remove,
} as const;

export const ICONS_FILL: Partial<Record<IconName, string>> = {
  run: runF, hike: hikeF, bicycle: bicycleF, bike: bikeF, tree: treeF, waves: wavesF, park: parkF, grains: grainsF,
  buildings: buildingsF, locate: locateF, cube: cubeF, bookmark: bookmarkF, drop: dropF, star: starF, done: doneF,
};

export type IconName = keyof typeof ICONS;
