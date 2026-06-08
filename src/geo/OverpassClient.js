const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const CACHE_VERSION = 3;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
function cacheKey(bbox) {
    return `osm-v${CACHE_VERSION}-${JSON.stringify(bbox)}`;
}
function readCache(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw)
            return null;
        const { data, ts } = JSON.parse(raw);
        if (Date.now() - ts > CACHE_TTL_MS)
            return null;
        return data;
    }
    catch {
        return null;
    }
}
function writeCache(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
    }
    catch { /* storage full */ }
}
function buildQuery(bbox) {
    const { south, west, north, east } = bbox;
    const b = `${south},${west},${north},${east}`;
    return `
[out:json][timeout:40];
(
  way["building"](${b});
  way["highway"]["highway"!~"^(path|footway|steps|cycleway|service|track)$"](${b});
  way["landuse"~"^(park|grass|forest|recreation_ground|garden|meadow|greenfield)$"](${b});
  way["leisure"~"^(park|garden|pitch|playground)$"](${b});
  way["natural"~"^(wood|grassland|scrub)$"](${b});
  node["natural"="tree"](${b});
  node["highway"="street_lamp"](${b});
  node["amenity"~"^(bench|fountain|toilets|waste_basket|bicycle_parking)$"](${b});
);
out body;
>;
out skel qt;
`.trim();
}
export async function fetchCity(bbox, onProgress) {
    const key = cacheKey(bbox);
    const cached = readCache(key);
    if (cached) {
        onProgress?.('Cargando desde caché…');
        return cached;
    }
    onProgress?.('Descargando datos de OpenStreetMap…');
    const res = await fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(buildQuery(bbox))}`,
    });
    if (!res.ok)
        throw new Error(`Overpass HTTP ${res.status}. Reintentá en unos minutos.`);
    const data = (await res.json());
    writeCache(key, data);
    return data;
}
