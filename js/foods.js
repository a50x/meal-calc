// ------------------------------
// js/foods.js
// Core data + helpers for foods, portioning, and small utilities
// Exposes globals on window so other non-module scripts can use them:
//   window.FOODS, window.UID_COUNTER, window.LOCKS
//   window.uid, window.slugify, window.rand, window.sample, window.isShake
//   window.loadFoods, window.pickPortion, window.getFoods
// ------------------------------

window.FOODS = [];
window.UID_COUNTER = 1;               // stable UID counter across app
window.LOCKS = { foods: {}, meals: {} };

// ------------------------------
// Utilities
function _uid(prefix = '') {
  const p = prefix || 'u';
  const id = `${p}${window.UID_COUNTER++}`;
  return id;
}
function _slugify(str) {
  return (str || '').toString().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\-]+/g, '')
    .replace(/\_+/g, '_')
    .replace(/^_+|_+$/g, '');
}
function _rand(min, max) {
  min = Math.ceil(min); max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function _sample(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}
function _isShake(food) {
  return Array.isArray(food.tags) && food.tags.includes('shake');
}

// expose utilities
window.uid = _uid;
window.slugify = _slugify;
window.rand = _rand;
window.sample = _sample;
window.isShake = _isShake;

// ------------------------------
// Load foods.json and normalize entries
// Keeps portionable, min, max and preserves portion_scalable if present.
// Supports input shapes: array, object-of-arrays, nested object mapping name->metrics
async function loadFoods() {
  try {
    const res = await fetch('foods.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const list = [];

    function normalizeEntry(entry) {
      const name = entry.name || entry.id || (entry.label || '').toString();
      const id = entry.id || _slugify(name);
      const kcal = Number(entry.kcal ?? entry.cal ?? 0);
      const p = Number(entry.p ?? entry.protein ?? 0);
      const c = Number(entry.c ?? entry.carbs ?? 0);
      const f = Number(entry.f ?? entry.fat ?? 0);
      const tags = Array.isArray(entry.tags) ? entry.tags.slice() : [];
      const portionable = !!(entry.portionable || (entry.min !== undefined && entry.max !== undefined));
      // keep portion_scalable (step/increment) if present (e.g. 0.5)
      const portion_scalable = (entry.portion_scalable !== undefined && entry.portion_scalable !== null)
        ? Number(entry.portion_scalable)
        : undefined;
      const min = portionable ? Math.max(1, Number(entry.min ?? 1)) : 1;
      const max = portionable ? Math.max(min, Number(entry.max ?? min)) : 1;
      const unit = entry.unit || '';
      return { id, name, kcal, p, c, f, tags, portionable, min, max, unit, portion_scalable };
    }

    if (Array.isArray(raw)) {
      for (const it of raw) list.push(normalizeEntry(it));
    } else if (raw && typeof raw === 'object') {
      for (const key of Object.keys(raw)) {
        const val = raw[key];
        if (Array.isArray(val)) {
          for (const it of val) list.push(normalizeEntry(it));
        } else if (val && typeof val === 'object') {
          // object mapping name -> metrics
          for (const [name, metrics] of Object.entries(val)) {
            const entry = Object.assign({}, metrics);
            if (!entry.name) entry.name = name;
            list.push(normalizeEntry(entry));
          }
        }
      }
    }

    if (!list.length) throw new Error('No foods found in foods.json');

    // dedupe by id (preserve first occurrence)
    const seen = new Set();
    const out = [];
    for (const item of list) {
      const id = item.id || _slugify(item.name);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(item);
    }

    // finalize
    window.FOODS = out.map(f => ({ ...f, tags: f.tags || [] }));
    // optional quick UI feedback if #result exists
    try {
      const resDiv = document.getElementById && document.getElementById('result');
      if (resDiv) resDiv.innerHTML = `<div class="card info"><strong>Foods loaded (${window.FOODS.length})</strong></div>`;
    } catch (e) { /* ignore */ }

    return window.FOODS;
  } catch (err) {
    console.error('loadFoods error', err);
    const resDiv = document.getElementById && document.getElementById('result');
    if (resDiv) resDiv.innerHTML = `<div class="card warn"><strong>Error loading foods.json</strong><br>${String(err)}</div>`;
    throw err;
  }
}
window.loadFoods = loadFoods;

// ------------------------------
// Portioning / pickPortion
// Supports:
//  - portion_scalable: fractional increment (e.g. 0.5 => 0.5, 1.0, 1.5, 2.0)
//  - portionable + min/max integer fallback
// If forcedQty provided, uses that qty exactly.
function pickPortion(food, forcedQty = null) {
  if (!food) return null;

  const baseKcal = Number(food.kcal || food.cal || 0);
  const baseP = Number(food.p || food.protein || 0);
  const baseC = Number(food.c || food.carbs || 0);
  const baseF = Number(food.f || food.fat || 0);

  // decide qty
  let qty = 1;

  if (forcedQty !== null && forcedQty !== undefined) {
    qty = forcedQty;
  } else if (food.portion_scalable !== undefined && food.portion_scalable !== null) {
    // use portion_scalable step between 0.25 and 2.0 (clamped)
    const step = Number(food.portion_scalable) || 0.25;
    const minQ = 0.25;
    const maxQ = 2.0;
    // generate list of allowed values (snap)
    const values = [];
    // ensure numerical stability
    for (let v = minQ; v <= maxQ + 1e-9; v = +(v + step).toFixed(8)) {
      const snapped = Math.round(v / step) * step;
      if (snapped >= minQ - 1e-9 && snapped <= maxQ + 1e-9) values.push(+snapped.toFixed(6));
      // prevent infinite loops
      if (values.length > 200) break;
    }
    if (!values.length) values.push(1);
    qty = _sample(values);
  } else if (food.portionable && (food.min !== undefined || food.max !== undefined)) {
    const minQInt = Math.max(1, Number(food.min || 1));
    const maxQInt = Math.max(minQInt, Number(food.max || minQInt));
    qty = _rand(minQInt, maxQInt);
  } else {
    qty = 1;
  }

  const item = {
    ...food,
    _uid: _uid('i'),
    qty: qty,
    base_kcal: baseKcal,
    base_p: baseP,
    base_c: baseC,
    base_f: baseF,
    kcal: baseKcal * qty,
    p: baseP * qty,
    c: baseC * qty,
    f: baseF * qty,
    label: (food.portionable || (food.portion_scalable !== undefined && food.portion_scalable !== null))
      ? `${food.name} x${qty}${food.unit ? ' ' + food.unit + (qty > 1 ? 's' : '') : ''}`
      : food.name
  };

  return item;
}
window.pickPortion = pickPortion;

// ------------------------------
// Accessor for FOODS (safe copy)
function getFoods() {
  return window.FOODS;
}
window.getFoods = getFoods;

// small helpers exposed for older code compatibility
window.sample = _sample;
window.rand = _rand;
window.slugify = _slugify;
window.uid = _uid;
window.isShake = _isShake;
