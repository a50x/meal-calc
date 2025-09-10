// app.js — Safe Foods Meal Generator (updated with optimal digestion logic)
// - Multiple foods per meal (1..3 items per meal)
// - Robust foods.json loader (handles arrays, category maps, name->object maps)
// - Portionable support, fallback property names (cal / kcal), automatic id slugging
// - Keeps searching until a valid plan is found (bounded attempts)
// - Max shakes/repeats are per full day
// - "Optimal" = 3–5 meals chosen dynamically, avoids giant meals

let FOODS = []; // normalized food list (objects with id,name,kcal,p,c,f,tags,portionable,min,max,unit)

// ---------------------------
// Utilities
// ---------------------------
function slugify(str) {
  return (str || '').toString().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\-]+/g, '')
    .replace(/\_+/g, '_')
    .replace(/^_+|_+$/g, '');
}
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sample(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---------------------------
// Load + normalize foods.json
// ---------------------------
async function loadFoods() {
  try {
    const res = await fetch('foods.json');
    const raw = await res.json();
    const list = [];

    function normalizeEntry(entry) {
      const name = entry.name || entry.id || (entry.label || '').toString();
      const id = entry.id || slugify(name);
      const kcal = Number(entry.kcal ?? entry.cal ?? entry.energy ?? 0);
      const p = Number(entry.p ?? entry.protein ?? 0);
      const c = Number(entry.c ?? entry.carbs ?? entry.carbohydrates ?? 0);
      const f = Number(entry.f ?? entry.fat ?? 0);
      const tags = Array.isArray(entry.tags) ? entry.tags.slice() : [];
      const portionable = (entry.portionable === true) || (entry.min !== undefined && entry.max !== undefined);
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
        if (Array.isArray(val)) {
          for (const it of val) list.push(normalizeEntry(it));
        } else if (val && typeof val === 'object') {
          const valuesAreFoodObjects = Object.values(val).some(v => typeof v === 'object' && (v.cal !== undefined || v.kcal !== undefined || v.p !== undefined));
          if (valuesAreFoodObjects) {
            for (const [name, metrics] of Object.entries(val)) {
              const entry = Object.assign({}, metrics);
              if (!entry.name) entry.name = name;
              list.push(normalizeEntry(entry));
            }
          } else {
            list.push(normalizeEntry(Object.assign({ name: key }, val)));
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
    generate();
  } catch (err) {
    console.error('Failed loading foods.json', err);
    document.getElementById('result').innerHTML = `<div class="card warn"><strong>Error loading foods.json</strong><br>${String(err)}</div>`;
  }
}

// ---------------------------
// Portioning
// ---------------------------
function pickPortion(food) {
  if (!food.portionable) {
    return { ...food, qty: 1, label: food.name };
  }
  const qty = rand(food.min, food.max);
  return {
    ...food,
    qty,
    kcal: food.kcal * qty,
    p: food.p * qty,
    c: food.c * qty,
    f: food.f * qty,
    label: `${food.name} x${qty}${food.unit ? ' ' + food.unit + (qty > 1 ? 's' : '') : ''}`
  };
}

function isShake(food) {
  return Array.isArray(food.tags) && food.tags.includes('shake');
}

// ---------------------------
// Candidate builder
// ---------------------------
function buildCandidate(mealCount, maxShakes, maxRepeats, targets) {
  const meals = [];
  const totals = { cal: 0, p: 0, c: 0, f: 0 };
  const counts = {};
  let shakesUsed = 0;

  for (let m = 0; m < mealCount; m++) {
    const mealItems = [];
    const targetItems = rand(1, 3);
    let itemAttempts = 0;
    while (mealItems.length < targetItems && itemAttempts < 80) {
      itemAttempts++;
      const raw = sample(FOODS);
      if (!raw) break;

      const curCount = counts[raw.id] || 0;
      if (curCount + 1 > maxRepeats) continue;
      if (isShake(raw) && shakesUsed + 1 > maxShakes) continue;

      const chosen = pickPortion(raw);
      mealItems.push(chosen);
      counts[raw.id] = (counts[raw.id] || 0) + 1;
      if (isShake(raw)) shakesUsed++;

      totals.cal += Number(chosen.kcal || 0);
      totals.p += Number(chosen.p || 0);
      totals.c += Number(chosen.c || 0);
      totals.f += Number(chosen.f || 0);
    }
    if (mealItems.length === 0) return null;
    meals.push({ items: mealItems });
  }

  return { meals, totals, shakesUsed, counts };
}

// ---------------------------
// Search / optimization
// ---------------------------
function scoreTotals(totals, targets, mealCount) {
  // Aim to spread macros evenly across meals
  const pMid = (targets.pMin + targets.pMax) / 2 / mealCount;
  const cMid = (targets.cMin + targets.cMax) / 2 / mealCount;
  const fMid = (targets.fMin + targets.fMax) / 2 / mealCount;
  const calMid = (targets.calMin + targets.calMax) / 2 / mealCount;

  // Compute per-meal averages
  const pAvg = totals.p / mealCount;
  const cAvg = totals.c / mealCount;
  const fAvg = totals.f / mealCount;
  const calAvg = totals.cal / mealCount;

  return Math.abs(pAvg - pMid) * 4 +
         Math.abs(cAvg - cMid) * 2 +
         Math.abs(fAvg - fMid) * 1 +
         Math.abs(calAvg - calMid) * 0.2;
}

function findBestForMealCount(mealCount, params, maxTries = 2000) {
  const maxShakes = Number(document.getElementById('maxShakes').value || 0);
  const maxRepeats = Number(document.getElementById('maxRepeats').value || 1);
  let best = null;

  for (let i = 0; i < maxTries; i++) {
    const c = buildCandidate(mealCount, maxShakes, maxRepeats, params);
    if (!c) continue;
    if (c.totals.cal > params.calMax) continue;

    const sc = scoreTotals(c.totals, params, mealCount);
    if (!best || sc < best.score) { c.score = sc; best = c; }

    if (c.totals.p >= params.pMin && c.totals.p <= params.pMax &&
        c.totals.c >= params.cMin && c.totals.c <= params.cMax &&
        c.totals.f >= params.fMin && c.totals.f <= params.fMax &&
        c.totals.cal >= params.calMin && c.totals.cal <= params.calMax) {
      return c;
    }
  }
  return best;
}

// ---------------------------
// Generation entrypoint
// ---------------------------
function generate() {
  if (!FOODS.length) {
    document.getElementById('result').innerHTML = `<div class="card warn"><strong>No foods loaded yet.</strong></div>`;
    return;
  }

  const targets = {
    calMin: Math.max(0, Number(document.getElementById('calTarget').value || 0) - Number(document.getElementById('calRange').value || 0)),
    calMax: Number(document.getElementById('calTarget').value || 0) + Number(document.getElementById('calRange').value || 0),
    pMin: Math.max(0, Number(document.getElementById('pTarget').value || 0) - Number(document.getElementById('pRange').value || 0)),
    pMax: Number(document.getElementById('pTarget').value || 0) + Number(document.getElementById('pRange').value || 0),
    cMin: Math.max(0, Number(document.getElementById('cTarget').value || 0) - Number(document.getElementById('cRange').value || 0)),
    cMax: Number(document.getElementById('cTarget').value || 0) + Number(document.getElementById('cRange').value || 0),
    fMin: Math.max(0, Number(document.getElementById('fTarget').value || 0) - Number(document.getElementById('fRange').value || 0)),
    fMax: Number(document.getElementById('fTarget').value || 0) + Number(document.getElementById('fRange').value || 0)
  };

  const mealChoice = document.getElementById('mealCount').value;
  const MAX_TOTAL_TRIES = 6000;

  if (mealChoice !== 'optimal') {
    const m = Number(mealChoice);
    const best = findBestForMealCount(m, targets, MAX_TOTAL_TRIES);
    if (!best) {
      document.getElementById('result').innerHTML = `<div class="card warn"><strong>No valid plan within ${MAX_TOTAL_TRIES} tries.</strong></div>`;
      return;
    }
    renderResult(Object.assign({ mealCount: m }, best), targets);
    return;
  }

  // Optimal: test 3, 4, 5 meals
  const candidates = [];
  for (let m = 3; m <= 5; m++) {
    const best = findBestForMealCount(m, targets, MAX_TOTAL_TRIES / 3);
    if (best) candidates.push(Object.assign({ mealCount: m }, best));
  }

  if (!candidates.length) {
    document.getElementById('result').innerHTML = `<div class="card warn"><strong>No valid plan across 3–5 meals.</strong></div>`;
    return;
  }

  candidates.sort((a, b) => a.score - b.score);
  renderResult(candidates[0], targets);
}

// ---------------------------
// Rendering + CSV export
// ---------------------------
function renderResult(plan, params) {
  const out = document.getElementById('result');
  let html = `<div class="card"><h3>Generated Day — ${plan.mealCount} meals</h3>`;
  let grand = { cal: 0, p: 0, c: 0, f: 0 };

  plan.meals.forEach((meal, idx) => {
    let mcal = 0, mp = 0, mc = 0, mf = 0;
    html += `<h4>Meal ${idx + 1}</h4><table><thead><tr><th>Food</th><th>kcal</th><th>P</th><th>C</th><th>F</th></tr></thead><tbody>`;
    meal.items.forEach(it => {
      const label = it.label || it.name;
      html += `<tr><td>${label}</td><td>${(it.kcal || 0).toFixed(0)}</td><td>${(it.p || 0).toFixed(1)}</td><td>${(it.c || 0).toFixed(1)}</td><td>${(it.f || 0).toFixed(1)}</td></tr>`;
      mcal += it.kcal || 0; mp += it.p || 0; mc += it.c || 0; mf += it.f || 0;
    });
    html += `<tr style="font-weight:700"><td>Meal subtotal</td><td>${mcal.toFixed(0)}</td><td>${mp.toFixed(1)}</td><td>${mc.toFixed(1)}</td><td>${mf.toFixed(1)}</td></tr>`;
    html += `</tbody></table>`;
    grand.cal += mcal; grand.p += mp; grand.c += mc; grand.f += mf;
  });

  html += `<div style="margin-top:10px"><span class="pill">Calories: <strong>${grand.cal.toFixed(0)}</strong></span>
           <span class="pill">Protein: <strong>${grand.p.toFixed(1)} g</strong></span>
           <span class="pill">Carbs: <strong>${grand.c.toFixed(1)} g</strong></span>
           <span class="pill">Fat: <strong>${grand.f.toFixed(1)} g</strong></span></div>`;
  out.innerHTML = html;

  window._lastPlan = { plan, totals: grand };
}

function exportCSV() {
  if (!window._lastPlan) { alert('Generate a plan first'); return; }
  const rows = [['Meal','Food','Qty','Calories','Protein(g)','Carbs(g)','Fat(g)']];
  window._lastPlan.plan.meals.forEach((meal, mi) => {
    meal.items.forEach(it => {
      rows.push([`Meal ${mi+1}`, (it.label || it.name), it.qty || 1, (it.kcal || 0).toFixed(0), (it.p || 0).toFixed(1), (it.c || 0).toFixed(1), (it.f || 0).toFixed(1)]);
    });
  });
  rows.push(['TOTAL','', '', window._lastPlan.totals.cal.toFixed(0), window._lastPlan.totals.p.toFixed(1), window._lastPlan.totals.c.toFixed(1), window._lastPlan.totals.f.toFixed(1)]);
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'mealplan.csv'; a.click();
  URL.revokeObjectURL(url);
}
