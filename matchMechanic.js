/**
 * matchMechanic.js
 *
 * Matching strategy (in order):
 *  1. Reverse-geocode user coords → pincode via Nominatim
 *  2. Exact pincode match against approved mechanics
 *  3. Postal-zone match — first 4 digits of pincode (catches 613102 ↔ 613104)
 *  4. Haversine radius ≤ 15 km  (only works if mechanic has lat/lng stored)
 *
 * vehicle_type field may be:
 *  - Array:  ['Bike', 'Van']       (new registrations)
 *  - String: 'Bike'                (legacy single-value)
 *  - String: 'Bike, Van'           (legacy comma-joined)
 *  - String: 'Both'                (legacy → Bike+Car)
 *  - String: 'Load Van'            (legacy → Van)
 */

const Mechanic = require('./Mechanic');

// ── Haversine ─────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371, r = d => (d * Math.PI) / 180;
    const dLat = r(lat2 - lat1), dLng = r(lng2 - lng1);
    const a = Math.sin(dLat/2)**2 + Math.cos(r(lat1))*Math.cos(r(lat2))*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GEOCODE LAYER  — cache + rate-limit queue for Nominatim free tier
//
//  Nominatim Usage Policy: max 1 req/sec, no bulk queries.
//  We enforce this with:
//    1. An in-memory TTL cache  (24 h)  — cache hits skip the network entirely.
//    2. A serial promise queue — concurrent callers chain onto the previous
//       request with a 1 100 ms minimum gap, so we never fire two calls in
//       the same second even under load.
//
//  To upgrade to a paid geocoder (Google Maps / MapmyIndia), replace only
//  _nominatimReverse() and _nominatimForward() below.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CACHE_TTL_MS  = 24 * 60 * 60 * 1000;  // 24 hours
const QUEUE_DELAY_MS = 1100;                  // > 1 req / sec

// ── TTL cache ────────────────────────────────────────────────────────────────
const _geoCache = new Map();   // key → { value, expiresAt }

function _cacheGet(key) {
    const entry = _geoCache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { _geoCache.delete(key); return undefined; }
    return entry.value;
}

function _cacheSet(key, value) {
    _geoCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Serial request queue ──────────────────────────────────────────────────────
// _queue is the tail of the promise chain; each new call chains onto it.
let _queue = Promise.resolve();

function _enqueue(fn) {
    const next = _queue.then(() =>
        fn().finally(() => new Promise(resolve => setTimeout(resolve, QUEUE_DELAY_MS)))
    );
    _queue = next.catch(() => {}); // prevent an error from killing the chain
    return next;
}

// ── Low-level Nominatim fetchers (swap these for a paid API) ────────────────
async function _nominatimReverse(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'RoadsideHelper/2.1 (geocode-cache)' } });
    if (!res.ok) throw new Error(`Nominatim reverse ${res.status}`);
    const data = await res.json();
    const addr = data?.address || {};
    return {
        pincode: addr.postcode?.replace(/\s/g, '') || null,
        city:    addr.city || addr.town || addr.village || addr.county || addr.state_district || null
    };
}

async function _nominatimForward(pincode) {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${pincode}&country=India&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'RoadsideHelper/2.1 (geocode-cache)' } });
    if (!res.ok) throw new Error(`Nominatim forward ${res.status}`);
    const data = await res.json();
    if (!data || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

// ── Public: reverse-geocode → { pincode, city } ──────────────────────────────
async function getLocationFromCoords(lat, lng) {
    // Round to 3 decimal places ≈ 111 m cell — good enough for pincode lookup
    const key = `rev:${lat.toFixed(3)},${lng.toFixed(3)}`;
    const cached = _cacheGet(key);
    if (cached) {
        console.log(`[geocache] HIT  ${key}`);
        return cached;
    }

    console.log(`[geocache] MISS ${key} — queuing Nominatim reverse call`);
    try {
        const result = await _enqueue(() => _nominatimReverse(lat, lng));
        _cacheSet(key, result);
        return result;
    } catch (err) {
        console.error('[matchMechanic] reverse-geocode error:', err.message);
        return { pincode: null, city: null };
    }
}

// ── Backward-compat wrapper ───────────────────────────────────────────────────
async function getPincodeFromCoords(lat, lng) {
    const { pincode } = await getLocationFromCoords(lat, lng);
    return pincode;
}

// ── Public: forward-geocode pincode → { lat, lng } ───────────────────────────
async function getCoordsFromPincode(pincode) {
    const key = `fwd:${pincode}`;
    const cached = _cacheGet(key);
    if (cached !== undefined) {
        console.log(`[geocache] HIT  ${key}`);
        return cached;
    }

    console.log(`[geocache] MISS ${key} — queuing Nominatim forward call`);
    try {
        const result = await _enqueue(() => _nominatimForward(pincode));
        _cacheSet(key, result);   // cache null too — prevents repeat lookups for bad pincodes
        return result;
    } catch (err) {
        console.error('[matchMechanic] forward-geocode error:', err.message);
        return null;
    }
}



// ── Expand a user-requested vehicle type to all matching DB values ─
// e.g. 'Bike' → we want mechanics whose vehicle_type contains 'Bike'
//      'Car'  → also match legacy 'Both' and 'Load Van' (for vans)
function getCompatibleTypes(vehicleType) {
    const type = vehicleType.trim();
    // Map user-selected vehicle to the set of type strings we'll match against
    const map = {
        'Bike':    ['Bike', 'Both'],
        'Car':     ['Car', 'Both'],
        'Van':     ['Van', 'Load Van', 'Car', 'Both'],  // Vans can be served by car mechanics too
        'Truck':   ['Truck'],
        'Bus':     ['Bus'],
        'Tractor': ['Tractor'],
        // Legacy values as fallback
        'Both':    ['Bike', 'Car', 'Both'],
        'Load Van':['Van', 'Load Van', 'Car']
    };
    return map[type] || [type];
}

// ── Build MongoDB query for vehicle_type field ──────────────────
// Works for both array-stored and string-stored vehicle_type values
function vehicleTypeQuery(vehicleType) {
    const compatible = getCompatibleTypes(vehicleType);
    return {
        $or: [
            // New format: array field contains any compatible type
            { vehicle_type: { $in: compatible } },
            // Legacy: comma-joined string includes the type
            ...compatible.map(t => ({
                vehicle_type: { $regex: `(^|,\\s*)${t}(\\s*,|$)`, $options: 'i' }
            }))
        ]
    };
}

// ── Main matcher ──────────────────────────────────────────────
async function matchMechanic(latitude, longitude, vehicleType) {
    const vtQuery = vehicleTypeQuery(vehicleType);

    const baseQuery = {
        backgroundCheckStatus: 'verified',
        isBlocked: { $ne: true },
        ...vtQuery
    };

    // ── Step 1: resolve user pincode ──────────────────────────
    const userPincode = await getPincodeFromCoords(latitude, longitude);
    console.log(`[matchMechanic] user pincode resolved: ${userPincode}`);

    if (userPincode) {
        // ── Step 2: exact pincode match ───────────────────────
        const exactMatches = await Mechanic.find({ ...baseQuery, pincode: userPincode })
            .sort({ rating: -1, totalJobs: -1 });

        if (exactMatches.length > 0) {
            console.log(`[matchMechanic] ✅ exact pincode match → ${exactMatches[0].name}`);
            return { mechanic: exactMatches[0], method: 'pincode_exact', userPincode };
        }

        // ── Step 3: postal-zone match (first 4 digits) ────────
        const zone = userPincode.substring(0, 4);
        const zoneRegex = new RegExp(`^${zone}`);
        const zoneMatches = await Mechanic.find({ ...baseQuery, pincode: zoneRegex })
            .sort({ rating: -1, totalJobs: -1 });

        if (zoneMatches.length > 0) {
            console.log(`[matchMechanic] ✅ postal-zone match (prefix ${zone}) → ${zoneMatches[0].name}`);
            return { mechanic: zoneMatches[0], method: 'pincode_zone', userPincode };
        }

        console.log(`[matchMechanic] No pincode/zone match for ${userPincode}, trying 15 km radius…`);
    }

    // ── Step 4: 15 km Haversine radius ───────────────────────
    const withCoords = await Mechanic.find({
        ...baseQuery,
        'location.latitude':  { $exists: true, $ne: null },
        'location.longitude': { $exists: true, $ne: null }
    });

    const nearby = withCoords
        .map(m => ({
            mechanic: m,
            dist: haversineKm(latitude, longitude, m.location.latitude, m.location.longitude)
        }))
        .filter(r => r.dist <= 15)
        .sort((a, b) => a.dist - b.dist || b.mechanic.rating - a.mechanic.rating);

    if (nearby.length > 0) {
        console.log(`[matchMechanic] ✅ radius match → ${nearby[0].mechanic.name} (${nearby[0].dist.toFixed(2)} km)`);
        return { mechanic: nearby[0].mechanic, method: 'radius_15km', userPincode, distanceKm: nearby[0].dist };
    }

    console.log('[matchMechanic] ❌ No mechanic found within 15 km');
    return { mechanic: null, method: 'none', userPincode };
}

module.exports = { matchMechanic, getPincodeFromCoords, getLocationFromCoords, getCoordsFromPincode, haversineKm };