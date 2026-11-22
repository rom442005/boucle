#!/bin/zsh
# Télécharge depuis OpenStreetMap (Overpass) les pistes (leisure=track) et les stades nommés du rectangle
# 6° O – 10° E, 41° N – 51° N (France et voisins), par carrés de 2°, dans le dossier donné.
# Puis : node scripts/pistes.mjs <dossier>   → public/data/pistes.json
# Un carré déjà téléchargé est sauté (relancer reprend où ça s'est arrêté).
out=${1:?Usage : scripts/pistes-telecharger.sh <dossier>}
mkdir -p $out
mirrors=(https://overpass.openstreetmap.fr/api/interpreter https://overpass-api.de/api/interpreter https://maps.mail.ru/osm/tools/overpass/api/interpreter)
valid() { [[ -s $1 ]] && grep -q '"elements"' $1 && ! grep -q 'runtime error' $1 }
for lon in -6 -4 -2 0 2 4 6 8; do
  for lat in 41 43 45 47 49; do
    f=$out/u_${lon}_${lat}.json
    valid $f && continue
    bb="$lat,$lon,$((lat+2)),$((lon+2))"
    q="[out:json][timeout:180];(way[\"leisure\"=\"track\"]($bb);relation[\"leisure\"=\"track\"]($bb););out body geom qt;(nwr[\"leisure\"~\"^(stadium|sports_centre)$\"][\"name\"]($bb););out tags center qt;"
    for attempt in 1 2 3 4 5 6; do
      m=${mirrors[$(( (attempt-1) % ${#mirrors} + 1 ))]}
      code=$(curl -s -m 200 -A "Boucle-build/1.0" -o $f.tmp -w "%{http_code}" --data-urlencode "data=$q" $m)
      if [[ $code == 200 ]] && valid $f.tmp; then mv $f.tmp $f; break; fi
      echo "nouvel essai $bb ($code)"; sleep $((attempt*8))
    done
    rm -f $f.tmp
    echo "$bb : $(wc -c < $f 2>/dev/null || echo 0) octets"
  done
done
