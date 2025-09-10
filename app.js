// app.js — Safe Foods Meal Generator (updated)
// - Multiple foods per meal (1..3 items per meal)
// - Robust foods.json loader (handles arrays, category maps, name->object maps)
// - Portionable support, fallback property names (cal / kcal), automatic id slugging
// - Keeps searching until a valid plan is found (bounded attempts to keep it reasonable)

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
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// ---------------------------
// Load + normalize foods.json
// ---------------------------
async function loadFoods() {
  try {
    const res = await fetch('foods.json');
    const raw = await res.json();
    const list = [];

    // Helper to normalize a single raw entry into expected shape
    function normalizeEntry(entry) {
      // entry may be { name: "...", cal: .. } OR { id:..., name:..., kcal:... } etc.
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

    // raw might be an array
    if (Array.isArray(raw)) {
      for (const it of raw) list.push(normalizeEntry(it));
    } else if (raw && typeof raw === 'object') {
      // raw might be category -> {foodName: {cal:..}} or category -> array or top-level map of name->metrics
      for (const key of Object.keys(raw)) {
        const val = raw[key];
        if (Array.isArray(val)) {
          // array of items
          for (const it of val) list.push(normalizeEntry(it));
        } else if (val && typeof val === 'object') {
          // if object's keys look like food names -> metrics
          const valuesAreFoodObjects = Object.values(val).some(v => typeof v === 'object' && (v.cal !== undefined || v.kcal !== undefined || v.p !== undefined));
          if (valuesAreFoodObjects) {
            for (const [name, metrics] of Object.entries(val)) {
              // some templates store as "Food name": { cal:..., p:... }
              const entry = Object.assign({}, metrics);
              if (!entry.name) entry.name = name;
              list.push(normalizeEntry(entry));
            }
          } else {
            // fallback: treat val as a single food object with a category name as its name
            list.push(normalizeEntry(Object.assign({ name: key }, val)));
          }
        } else {
          // unexpected shape: skip
        }
      }
    }

    // final fallback: if nothing found, throw
    if (!list.length) {
      throw new Error('No foods found in foods.json (unexpected structure).');
    }

    // dedupe by id (keep first)
    const seen = new Set();
    FOODS = [];
    for (const item of list) {
      if (!item.id) item.id = slugify(item.name);
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      FOODS.push(item);
    }

    // auto-generate some helpful tags if none present (optional)
    FOODS = FOODS.map(f => ({ ...f, tags: f.tags || [] }));

    // Auto-generate once loaded
    generate();
  } catch (err) {
    console.error('Failed loading foods.json', err);
    document.getElementById('result').innerHTML = `<div class="card warn"><strong>Error loading foods.json</strong><br>${String(err)}</div>`;
  }
}

// ---------------------------
// Portioning & scoring
// ---------------------------
function pickPortion(food) {
  if (!food.portionable) {
    return {
      ...food,
      qty: 1,
      kcal: food.kcal,
      p: food.p,
      c: food.c,
      f: food.f,
      label: food.name
    };
  }
  const qty = rand(food.min, food.max);
  return {
    ...food,
    qty,
    kcal: food.kcal * qty,
    p: food.p * qty,
    c: food.c * qty,
    f: food.f * qty,
    label: `${food.name} x${qty}${food.unit ? ' ' + food.unit + (qty>1 ? 's' : '') : ''}`
  };
}

function isShake(food) {
  return Array.isArray(food.tags) && food.tags.includes('shake');
}

function scoreTotals(totals, targets) {
  // weighted distance (same as previous): prioritize protein
  const pMid = (targets.pMin + targets.pMax) / 2;
  const cMid = (targets.cMin + targets.cMax) / 2;
  const fMid = (targets.fMin + targets.fMax) / 2;
  const calMid = (targets.calMin + targets.calMax) / 2;
  return Math.abs(totals.p - pMid) * 4 +
         Math.abs(totals.c - cMid) * 2 +
         Math.abs(totals.f - fMid) * 1 +
         Math.abs(totals.cal - calMid) * 0.2;
}

// ---------------------------
// Candidate builder — multiple foods per meal
// ---------------------------
function buildCandidate(mealCount, maxShakes, maxRepeats) {
  const meals = [];
  const totals = { cal: 0, p: 0, c: 0, f: 0 };
  const counts = {};
  let shakesUsed = 0;

  for (let m = 0; m < mealCount; m++) {
    const mealItems = [];
    const targetItems = rand(1, 3); // 1-3 items per meal

    let itemAttempts = 0;
    while (mealItems.length < targetItems && itemAttempts < 80) {
      itemAttempts++;
      const raw = sample(FOODS);
      if (!raw) break;

      // check repeats
      const curCount = counts[raw.id] || 0;
      if (curCount + 1 > maxRepeats) continue;

      // check shakes cap
      if (isShake(raw) && shakesUsed + 1 > maxShakes) continue;

      // pick portion and compute actual macros for the chosen qty
      const chosen = pickPortion(raw);

      // push
      mealItems.push(chosen);
      counts[raw.id] = (counts[raw.id] || 0) + 1;
      if (isShake(raw)) shakesUsed++;

      // add to totals
      totals.cal += Number(chosen.kcal || 0);
      totals.p += Number(chosen.p || 0);
      totals.c += Number(chosen.c || 0);
      totals.f += Number(chosen.f || 0);
    }

    // if we couldn't pick at least one item for a meal, candidate fails
    if (mealItems.length === 0) return null;
    meals.push({ items: mealItems });
  }

  return { meals, totals, shakesUsed, counts };
}

// ---------------------------
// Search / optimization
// ---------------------------
function findBestForMealCount(mealCount, params, maxTries = 3000) {
  let best = null;
  for (let i = 0; i < maxTries; i++) {
    const c = buildCandidate(mealCount, Number(document.getElementById('maxShakes').value || 0), Number(document.getElementById('maxRepeats').value || 1));
    if (!c) continue;

    // quick prune if calories exceed max (speed)
    if (c.totals.cal > params.calMax) continue;

    const sc = scoreTotals(c.totals, params);
    if (!best || sc < best.score) { c.score = sc; best = c; }

    // if candidate meets *all* ranges exactly, return immediately
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
  if (!FOODS || !FOODS.length) {
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
  const MAX_TOTAL_TRIES = 10000; // keep reasonable for GitHub Pages
  let allocationPerSize = Math.floor(MAX_TOTAL_TRIES / 3); // for optimal we'll split attempts across 3,4,5

  // If user selected explicit meals, just try that many
  if (mealChoice !== 'optimal') {
    const m = Number(mealChoice);
    const best = findBestForMealCount(m, targets, MAX_TOTAL_TRIES);
    if (!best) {
      document.getElementById('result').innerHTML = `<div class="card warn"><strong>No valid meal plan could be generated within ${MAX_TOTAL_TRIES.toLocaleString()} attempts.</strong><br>Try widening ranges, allowing more repeats, or raising the shake/creami cap.</div>`;
      return;
    }
    renderResult(Object.assign({ mealCount: m }, best), targets);
    return;
  }

  // Optimal: try 3 -> 5 meals, allocate attempts to each (3 runs)
  const candidates = [];
  for (let m = 3; m <= 5; m++) {
    const tries = allocationPerSize;
    const best = findBestForMealCount(m, targets, tries);
    if (best) candidates.push(Object.assign({ mealCount: m }, best));
  }

  if (!candidates.length) {
    document.getElementById('result').innerHTML = `<div class="card warn"><strong>No valid meal plan could be generated within ${MAX_TOTAL_TRIES.toLocaleString()} attempts across 3–5 meals.</strong><br>Try widening ranges, allowing more repeats, or raising the shake/creami cap.</div>`;
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
      const kcal = Number(it.kcal || 0);
      const p = Number(it.p || 0);
      const c = Number(it.c || 0);
      const f = Number(it.f || 0);
      html += `<tr><td>${label}</td><td>${kcal.toFixed(0)}</td><td>${p.toFixed(1)}</td><td>${c.toFixed(1)}</td><td>${f.toFixed(1)}</td></tr>`;
      mcal += kcal; mp += p; mc += c; mf += f;
    });
    html += `<tr style="font-weight:700"><td>Meal subtotal</td><td>${mcal.toFixed(0)}</td><td>${mp.toFixed(1)}</td><td>${mc.toFixed(1)}</td><td>${mf.toFixed(1)}</td></tr>`;
    html += `</tbody></table>`;
    grand.cal += mcal; grand.p += mp; grand.c += mc; grand.f += mf;
  });

  html += `<div style="margin-top:10px"><span class="pill">Calories: <strong>${grand.cal.toFixed(0)}</strong></span>
           <span class="pill">Protein: <strong>${grand.p.toFixed(1)} g</strong></span>
           <span class="pill">Carbs: <strong>${grand.c.toFixed(1)} g</strong></span>
           <span class="pill">Fat: <strong>${grand.f.toFixed(1)} g</strong></span></div>`;

  const okP = (grand.p >= params.pMin && grand.p <= params.pMax);
  const okC = (grand.c >= params.cMin && grand.c <= params.cMax);
  const okF = (grand.f >= params.fMin && grand.f <= params.fMax);
  const okCal = (grand.cal >= params.calMin && grand.cal <= params.calMax);

  html += `<div class="card"><h4>Target check</h4>
           <p>Protein: ${params.pMin}–${params.pMax} → ${okP ? '<span class="ok">OK</span>' : '<span class="warn">OUT</span>'}</p>
           <p>Carbs: ${params.cMin}–${params.cMax} → ${okC ? '<span class="ok">OK</span>' : '<span class="warn">OUT</span>'}</p>
           <p>Fat: ${params.fMin}–${params.fMax} → ${okF ? '<span class="ok">OK</span>' : '<span class="warn">OUT</span>'}</p>
           <p>Calories: ${params.calMin}–${params.calMax} → ${okCal ? '<span class="ok">OK</span>' : '<span class="warn">OUT</span>'}</p>
           </div>`;

  html += `<div class="small muted">Suggested supplements are not included in the calculation.</div>`;
  html += `</div>`;
  out.innerHTML = html;

  window._lastPlan = { plan, totals: grand }; // for CSV export
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
