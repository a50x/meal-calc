// foods.js
let FOODS = [];
let UID_COUNTER = 1;

export function uid(prefix = '') {
  return `${prefix || 'u'}${UID_COUNTER++}`;
}

export function slugify(str) {
  return (str || '').toString().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\-]+/g, '')
    .replace(/\_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
export function sample(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function isShake(food){ return Array.isArray(food.tags) && food.tags.includes('shake'); }

export async function loadFoods() {
  try {
    const res = await fetch('foods.json');
    const raw = await res.json();
    const list = [];

    function normalizeEntry(entry) {
      const name = entry.name || entry.id || (entry.label || '').toString();
      const id = entry.id || slugify(name);
      const kcal = Number(entry.kcal ?? entry.cal ?? 0);
      const p = Number(entry.p ?? entry.protein ?? 0);
      const c = Number(entry.c ?? entry.carbs ?? 0);
      const f = Number(entry.f ?? entry.fat ?? 0);
      const tags = Array.isArray(entry.tags) ? entry.tags.slice() : [];
      const portionable = !!(entry.portionable || (entry.min !== undefined && entry.max !== undefined));
      const min = portionable ? Math.max(1, Number(entry.min ?? 1)) : 1;
      const max = portionable ? Math.max(min, Number(entry.max ?? min)) : 1;
      const unit = entry.unit || '';
      return { id, name, kcal, p, c, f, tags, portionable, min, max, unit };
    }

    if (Array.isArray(raw)) for (const it of raw) list.push(normalizeEntry(it));
    else if (raw && typeof raw === 'object') {
      for (const key of Object.keys(raw)) {
        const val = raw[key];
        if (Array.isArray(val)) for (const it of val) list.push(normalizeEntry(it));
        else if (val && typeof val === 'object') {
          for (const [name, metrics] of Object.entries(val)) {
            const entry = Object.assign({}, metrics);
            if (!entry.name) entry.name = name;
            list.push(normalizeEntry(entry));
          }
        }
      }
    }

    if (!list.length) throw new Error('No foods found in foods.json');

    const seen = new Set(); FOODS = [];
    for (const item of list) {
      if (!item.id) item.id = slugify(item.name);
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      FOODS.push(item);
    }
    FOODS = FOODS.map(f => ({ ...f, tags: f.tags || [] }));
    return FOODS;

  } catch (err) {
    console.error('Failed loading foods.json', err);
    throw err;
  }
}

export function pickPortion(food) {
  if (!food) return null;
  const base = { ...food };
  let qty = 1;
  if (base.portionable) qty = rand(base.min, base.max);
  const item = {
    ...base,
    _uid: uid('i'),
    qty,
    kcal: Number(base.kcal || 0) * qty,
    p: Number(base.p || 0) * qty,
    c: Number(base.c || 0) * qty,
    f: Number(base.f || 0) * qty,
    label: base.portionable
      ? `${base.name} x${qty}${base.unit ? ' ' + base.unit + (qty > 1 ? 's' : '') : ''}`
      : base.name
  };
  return item;
}

export function getFoods() {
  return FOODS;
}
