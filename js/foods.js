import { slugify } from './utils.js';

export let FOODS = [];

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

    if (Array.isArray(raw)) {
      for (const it of raw) list.push(normalizeEntry(it));
    } else if (raw && typeof raw === 'object') {
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

    const seen = new Set();
    FOODS = [];
    for (const item of list) {
      if (!item.id) item.id = slugify(item.name);
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      FOODS.push(item);
    }
    FOODS = FOODS.map(f => ({ ...f, tags: f.tags || [] }));

    document.getElementById('result').innerHTML =
      `<div class="card info"><strong>Foods loaded.</strong></div>`;
  } catch (err) {
    console.error('Failed loading foods.json', err);
    document.getElementById('result').innerHTML =
      `<div class="card warn"><strong>Error loading foods.json</strong><br>${String(err)}</div>`;
  }
}
