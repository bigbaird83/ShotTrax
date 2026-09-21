#!/usr/bin/env node
/**
 * One-shot GCA Pro probe: The Greens at North Hills (Sherwood, AR) course 14446.
 * Never invents coords. Never prints the API key.
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const COURSE_ID = process.env.COURSE_ID || '14446';
const KEY = (process.env.GOLF_COURSES_API_KEY || '').trim();
const BASE = 'https://golfcoursesapi.com/api/v1';
const OUT = process.env.OUT_DIR || 'north-hills-gca-out';

function redact(s) {
  return KEY ? String(s).split(KEY).join('REDACTED') : String(s);
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${KEY}` },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json };
}

function extractHoles(json) {
  if (!json) return [];
  const payload = json.data ?? json;
  const rows =
    (Array.isArray(payload) && payload) ||
    payload?.holes ||
    payload?.green_centers ||
    payload?.greenCenters ||
    payload?.greens ||
    [];
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const hole = row.hole ?? row.hole_number ?? row.holeNumber ?? row.number ?? null;
    const lat = row.lat ?? row.latitude ?? row.green_lat ?? row?.green?.lat ?? row?.center?.lat ?? null;
    const lng = row.lng ?? row.lon ?? row.longitude ?? row.green_lng ?? row?.green?.lng ?? row?.center?.lng ?? null;
    const front = row.front || row.green_front || row.greenFront || null;
    const back = row.back || row.green_back || row.greenBack || null;
    return {
      hole,
      green_center_lat: lat,
      green_center_lng: lng,
      green_front_lat: front?.lat ?? front?.latitude ?? row.front_lat ?? row.green_front_lat ?? null,
      green_front_lng: front?.lng ?? front?.lon ?? front?.longitude ?? row.front_lng ?? row.green_front_lng ?? null,
      green_back_lat: back?.lat ?? back?.latitude ?? row.back_lat ?? row.green_back_lat ?? null,
      green_back_lng: back?.lng ?? back?.lon ?? back?.longitude ?? row.back_lng ?? row.green_back_lng ?? null,
      raw_keys: Object.keys(row || {}),
    };
  });
}

function haversineYards(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const m = 2 * R * Math.asin(Math.sqrt(h));
  return m * 1.0936133;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (!KEY) {
    console.log('GCA_PROBE=NO_KEY');
    writeFileSync(`${OUT}/report.json`, JSON.stringify({ error: 'NO_KEY' }, null, 2));
    process.exit(0);
  }
  console.log(`COURSE_ID=${COURSE_ID}`);

  const search = await get(`/courses?q=${encodeURIComponent('Greens at North Hills')}`);
  console.log(`SEARCH_HTTP=${search.status}`);
  writeFileSync(`${OUT}/search-raw.json`, redact(search.text || ''));

  const detail = await get(`/courses/${COURSE_ID}`);
  console.log(`DETAIL_HTTP=${detail.status}`);
  writeFileSync(`${OUT}/detail-raw.json`, redact(detail.text || ''));

  let courseMeta = {};
  let scorecardTees = null;
  if (detail.json) {
    const c = detail.json.data || detail.json;
    courseMeta = {
      name: c.name,
      city: c.city || c.location?.city,
      state: c.state || c.location?.state,
      green_centers_available: c.green_centers_available,
      lat: c.latitude ?? c.lat ?? c.coordinates?.latitude ?? c.location?.lat,
      lng: c.longitude ?? c.lng ?? c.coordinates?.longitude ?? c.location?.lng,
    };
    scorecardTees = c.tees || c.teeboxes || c.scorecard?.teeboxes || null;
    console.log(`DETAIL name=${courseMeta.name} green_centers_available=${courseMeta.green_centers_available}`);
    console.log(`DETAIL_TEES_PRESENT=${Array.isArray(scorecardTees) && scorecardTees.length > 0}`);
    if (Array.isArray(scorecardTees)) {
      console.log(`DETAIL_TEE_COUNT=${scorecardTees.length}`);
      writeFileSync(`${OUT}/scorecard-tees.json`, JSON.stringify(scorecardTees, null, 2));
    }
  }

  const greens = await get(`/courses/${COURSE_ID}/green-centers`);
  console.log(`GREENS_HTTP=${greens.status}`);
  console.log(`GCA_GREENS_PRO=${greens.status === 200 ? '200' : greens.status === 403 ? '403' : 'OTHER'}`);
  writeFileSync(`${OUT}/green-centers-raw.json`, redact(greens.text || ''));

  const holes = extractHoles(greens.json);
  console.log(`HOLE_COUNT=${holes.length}`);
  const teesInGreens = holes.some((h) => (h.raw_keys || []).some((k) => /tee/i.test(k)));
  console.log(`TEES_IN_GREEN_CENTERS_RESPONSE=${teesInGreens}`);

  // Sanity flags (automated)
  const flags = [];
  if (greens.status !== 200) flags.push({ code: 'HTTP_NOT_200', detail: `green-centers HTTP ${greens.status}` });
  if (greens.status === 200 && holes.length === 0) flags.push({ code: 'EMPTY_GREENS', detail: 'HTTP 200 but 0 green-center rows' });
  if (courseMeta.green_centers_available === false && holes.length === 0) {
    flags.push({ code: 'GCA_FLAG_FALSE', detail: 'course.green_centers_available=false and no greens returned' });
  }
  if ([9, 18].includes(holes.length) === false && holes.length > 0) {
    flags.push({ code: 'UNUSUAL_HOLE_COUNT', detail: `hole_count=${holes.length}` });
  }
  // Validate coords
  for (const h of holes) {
    if (h.green_center_lat == null || h.green_center_lng == null) {
      flags.push({ code: 'MISSING_COORD', detail: `hole ${h.hole}` });
    } else if (Math.abs(h.green_center_lat) > 90 || Math.abs(h.green_center_lng) > 180) {
      flags.push({ code: 'OUT_OF_RANGE', detail: `hole ${h.hole}` });
    }
  }
  // Cluster near course pin if we have both
  if (courseMeta.lat != null && courseMeta.lng != null) {
    for (const h of holes) {
      if (h.green_center_lat == null) continue;
      const yd = haversineYards(
        { lat: courseMeta.lat, lng: courseMeta.lng },
        { lat: h.green_center_lat, lng: h.green_center_lng },
      );
      if (yd > 4000) flags.push({ code: 'FAR_FROM_COURSE', detail: `hole ${h.hole} ~${Math.round(yd)} yd from course pin` });
    }
  }
  // tee→green yards vs scorecard — HARD-MISS if no tee coords in greens response
  if (!teesInGreens) {
    flags.push({
      code: 'TEES_HARD_MISS',
      detail: 'tees not present on green-centers response; tee→green yardage sanity skipped',
    });
  }

  const cleanHoles = holes.map(({ raw_keys, ...rest }) => rest);
  const report = {
    course_id: Number(COURSE_ID),
    course_name: courseMeta.name || 'The Greens At North Hills',
    city: courseMeta.city || 'Sherwood',
    state: courseMeta.state || 'Arkansas',
    http_status: greens.status,
    detail_http: detail.status,
    search_http: search.status,
    hole_count: cleanHoles.length,
    green_centers_available_flag: courseMeta.green_centers_available ?? null,
    tees_in_green_centers_response: teesInGreens,
    tees_note: 'Tees are not in the green-centers response (usual). Scorecard teeboxes may exist on course detail.',
    scorecard_tee_sets: Array.isArray(scorecardTees) ? scorecardTees.length : 0,
    holes: cleanHoles,
    sanity_flags: flags,
    probed_at: new Date().toISOString(),
  };
  writeFileSync(`${OUT}/green-centers.json`, JSON.stringify(report, null, 2));
  const csv = ['hole,green_center_lat,green_center_lng,green_front_lat,green_front_lng,green_back_lat,green_back_lng'];
  for (const h of cleanHoles) {
    csv.push(
      [h.hole, h.green_center_lat, h.green_center_lng, h.green_front_lat, h.green_front_lng, h.green_back_lat, h.green_back_lng]
        .map((v) => (v == null ? '' : v))
        .join(','),
    );
  }
  writeFileSync(`${OUT}/green-centers.csv`, csv.join('\n') + '\n');
  writeFileSync(`${OUT}/sanity-flags.json`, JSON.stringify(flags, null, 2));

  console.log('SANITY_FLAG_COUNT=' + flags.length);
  for (const f of flags) console.log(`SANITY ${f.code}: ${f.detail}`);
  console.log('GREENS_BODY_SNIP=' + redact((greens.text || '').slice(0, 400)).replace(/\s+/g, ' '));
  for (const h of cleanHoles) {
    console.log(`HOLE ${h.hole} center=${h.green_center_lat},${h.green_center_lng}`);
  }
}

main().catch((e) => {
  console.log('GCA_GREENS_PRO=OTHER');
  console.log('ERROR=' + redact(e?.message || String(e)));
  process.exit(0);
});
