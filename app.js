// app.js — Safe Foods Meal Generator (evenly distributed + tag-aware + within max macros)

let FOODS = []; // normalized food list

// ---------------------------
// Render + CSV export
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

  html += `<div style="margin-top:10px">
             <span class="pill">Calories: <strong>${grand.cal.toFixed(0)}</strong></span>
             <span class="pill">Protein: <strong>${grand.p.toFixed(1)} g</strong></span>
             <span class="pill">Carbs: <strong>${grand.c.toFixed(1)} g</strong></span>
             <span class="pill">Fat: <strong>${grand.f.toFixed(1)} g</strong></span>
           </div>`;
  out.innerHTML = html;
  window._lastPlan = { plan, totals: grand };
}

// ---------------------------
// Utilities
function slugify(str) {
  return (str || '').toString().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\-]+/g, '')
    .replace(/\_+/g, '_')
    .replace(/^_+|_+$/g, '');
}
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sample(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function isShake(food) { return Array.isArray(food.tags) && food.tags.includes('shake'); }

// ---------------------------
// Load + normalize foods.json
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

    if (Array.isArray(raw)) for (const it of raw) list.push(normalizeEntry(it));
    else if (raw && typeof raw === 'object') {
      for (const key of Object.keys(raw)) {
        const val = raw[key];
        if (Array.isArray(val)) for (const it of val) list.push(normalizeEntry(it));
        else if (val && typeof val === 'object') {
          const valuesAreFoodObjects = Object.values(val).some(v => typeof v === 'object' && (v.cal !== undefined || v.kcal !== undefined || v.p !== undefined));
          if (valuesAreFoodObjects) {
            for (const [name, metrics] of Object.entries(val)) {
              const entry = Object.assign({}, metrics);
              if (!entry.name) entry.name = name;
              list.push(normalizeEntry(entry));
            }
          } else list.push(normalizeEntry(Object.assign({ name: key }, val)));
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
    document.getElementById('result').innerHTML = `<div class="card info"><strong>Foods loaded.</strong> You can now generate a plan.</div>`;
  } catch (err) {
    console.error('Failed loading foods.json', err);
    document.getElementById('result').innerHTML = `<div class="card warn"><strong>Error loading foods.json</strong><br>${String(err)}</div>`;
  }
}

// ---------------------------
// Portioning
function pickPortion(food) {
  if (!food.portionable) return { ...food, qty: 1, label: food.name };
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

// ---------------------------
// Meal tag ordering
function foodsForMealIndex(mealIndex, totalMeals) {
  const tagMap = {
    3: ['breakfast','lunch','dinner'],
    4: ['breakfast','lunch','snack','dinner'],
    5: ['breakfast','snack','lunch','snack','dinner']
  };
  return tagMap[totalMeals] ? [tagMap[totalMeals][mealIndex]] : [];
}

// ---------------------------
// Build candidate focusing on even distribution + per-meal max
function buildDailyCandidate(targets, mealCount, maxShakes, maxRepeats) {
  const candidateFoods = [];
  const foodCounts = {};
  let shakesUsed = 0;
  let totals = { cal: 0, p: 0, c: 0, f: 0 };

  const perMealMax = {
    cal: targets.calMax / mealCount,
    p: targets.pMax / mealCount,
    c: targets.cMax / mealCount,
    f: targets.fMax / mealCount
  };

  let attempts = 0;
  while (attempts < 15000) {
    attempts++;
    const food = pickPortion(sample(FOODS));

    if (foodCounts[food.name] >= maxRepeats) continue;
    if (isShake(food) && shakesUsed >= maxShakes) continue;

    // per-meal max check (soft allowance)
    const softMult = 1.2;
    if (food.kcal > perMealMax.cal * softMult) continue;
    if (food.c > perMealMax.c * softMult) continue;
    if (food.f > perMealMax.f * softMult) continue;

    candidateFoods.push(food);
    totals.cal += food.kcal;
    totals.p += food.p;
    totals.c += food.c;
    totals.f += food.f;

    if (isShake(food)) shakesUsed++;
    foodCounts[food.name] = (foodCounts[food.name] || 0) + 1;

    if (totals.cal >= targets.calMax &&
        totals.p >= targets.pMin &&
        totals.c >= targets.cMin &&
        totals.f >= targets.fMin) break;
  }

  return { foods: candidateFoods, totals };
}

// ---------------------------
// Distribute foods evenly + tag-aware
function distributeMeals(candidateFoods, mealCount) {
  const meals = Array.from({ length: mealCount }, () => ({ items: [] }));
  const leftovers = [];

  for (const food of candidateFoods) {
    let placed = false;
    for (let i = 0; i < mealCount; i++) {
      const preferredTags = foodsForMealIndex(i, mealCount);
      if (food.tags.some(t => preferredTags.includes(t))) {
        meals[i].items.push(food);
        placed = true;
        break;
      }
    }
    if (!placed) leftovers.push(food);
  }

  // distribute remaining evenly
  let idx = 0;
  for (const food of leftovers) {
    meals[idx].items.push(food);
    idx = (idx + 1) % mealCount;
  }

  return meals;
}

// ---------------------------
// Generate day
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
  const MAX_TRIES = 6000;
  const maxShakes = Number(document.getElementById('maxShakes').value || 0);
  const maxRepeats = Number(document.getElementById('maxRepeats').value || 1);

  let mealCounts = [];
  if (mealChoice === 'optimal') mealCounts = [3,4,5];
  else mealCounts = [Number(mealChoice)];

  let finalPlan = null;
  for (const m of mealCounts) {
    for (let i = 0; i < MAX_TRIES; i++) {
      const daily = buildDailyCandidate(targets, m, maxShakes, maxRepeats);
      if (!daily || !daily.foods.length) continue;
      const meals = distributeMeals(daily.foods, m);
      finalPlan = { meals, totals: daily.totals, mealCount: m };
      break;
    }
    if (finalPlan) break;
  }

  if (!finalPlan) {
    document.getElementById('result').innerHTML = `<div class="card warn"><strong>Could not generate a plan within ${MAX_TRIES} tries.</strong></div>`;
    return;
  }

  renderResult(finalPlan, targets);
}

// ---------------------------
// Load foods on start
loadFoods();
