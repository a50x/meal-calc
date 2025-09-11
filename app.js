// app.js — Safe Foods Meal Generator (updated with per-meal balanced macros + tag-aware + even distribution)

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
function sumBy(arr, key) { return arr.reduce((s, i) => s + (i[key] || 0), 0); }
function isShake(food) { return Array.isArray(food.tags) && food.tags.includes('shake'); }

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
// ---------------------------
function foodsForMealIndex(mealIndex, totalMeals) {
  if (totalMeals === 3) {
    if (mealIndex === 0) return ['breakfast'];
    if (mealIndex === 1) return ['lunch'];
    if (mealIndex === 2) return ['dinner'];
  } else if (totalMeals === 4) {
    if (mealIndex === 0) return ['breakfast'];
    if (mealIndex === 1) return ['lunch'];
    if (mealIndex === 2) return ['snack', 'shake'];
    if (mealIndex === 3) return ['dinner'];
  } else if (totalMeals === 5) {
    if (mealIndex === 0) return ['breakfast'];
    if (mealIndex === 1) return ['snack', 'shake'];
    if (mealIndex === 2) return ['lunch'];
    if (mealIndex === 3) return ['snack', 'shake'];
    if (mealIndex === 4) return ['dinner'];
  }
  return [];
}

// ---------------------------
// Build daily candidate with per-meal macro target
// ---------------------------
function buildDailyCandidate(targets, mealCount, maxShakes, maxRepeats) {
  const candidateFoods = [];
  const foodCounts = {};
  let shakesUsed = 0;
  let totals = { cal: 0, p: 0, c: 0, f: 0 };

  // per-meal target
  const perMealTarget = {
    cal: (targets.calMax + targets.calMin) / 2 / mealCount,
    p: (targets.pMax + targets.pMin) / 2 / mealCount,
    c: (targets.cMax + targets.cMin) / 2 / mealCount,
    f: (targets.fMax + targets.fMin) / 2 / mealCount
  };

  let attempts = 0;
  while (attempts < 10000) {
    attempts++;
    const food = pickPortion(sample(FOODS));
    const remainingMeals = mealCount - Math.floor(totals.cal / perMealTarget.cal);

    // enforce repeats and shake limits
    if (foodCounts[food.name] >= maxRepeats) continue;
    if (isShake(food) && shakesUsed >= maxShakes) continue;

    // soft per-meal macro constraints
    if (food.c > perMealTarget.c * 1.2) continue;
    if (food.f > perMealTarget.f * 1.2) continue;
    if (food.kcal > perMealTarget.cal * 1.2) continue;

    candidateFoods.push(food);
    totals.cal += food.kcal;
    totals.p += food.p;
    totals.c += food.c;
    totals.f += food.f;

    if (isShake(food)) shakesUsed++;
    foodCounts[food.name] = (foodCounts[food.name] || 0) + 1;

    // break early if daily targets exceeded
    if (totals.cal >= targets.calMax && totals.p >= targets.pMin &&
        totals.c >= targets.cMin && totals.f >= targets.fMin) break;
  }

  return { foods: candidateFoods, totals };
}

// ---------------------------
// Distribute foods evenly + tag-aware
// ---------------------------
function distributeMeals(candidateFoods, mealCount) {
  const meals = Array.from({ length: mealCount }, () => ({ items: [] }));
  const leftovers = [];

  // first: tag-based placement
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

  // evenly distribute remaining
  let mealIdx = 0;
  for (const food of leftovers) {
    meals[mealIdx].items.push(food);
    mealIdx = (mealIdx + 1) % mealCount;
  }

  return meals;
}

// ---------------------------
// Score totals
// ---------------------------
function scoreTotals(totals, targets, mealCount) {
  const pMid = (targets.pMin + targets.pMax) / 2 / mealCount;
  const cMid = (targets.cMin + targets.cMax) / 2 / mealCount;
  const fMid = (targets.fMin + targets.fMax) / 2 / mealCount;
  const calMid = (targets.calMin + targets.calMax) / 2 / mealCount;

  const pAvg = totals.p / mealCount;
  const cAvg = totals.c / mealCount;
  const fAvg = totals.f / mealCount;
  const calAvg = totals.cal / mealCount;

  return Math.abs(pAvg - pMid) * 4 +
         Math.abs(cAvg - cMid) * 2 +
         Math.abs(fAvg - fMid) * 1 +
         Math.abs(calAvg - calMid) * 0.2;
}

// ---------------------------
// Find best candidate
// ---------------------------
function findBestCandidate(mealCount, targets, maxTries = 2000) {
  const maxShakes = Number(document.getElementById('maxShakes').value || 0);
  const maxRepeats = Number(document.getElementById('maxRepeats').value || 1);
  let best = null;

  for (let i = 0; i < maxTries; i++) {
    const daily = buildDailyCandidate(targets, mealCount, maxShakes, maxRepeats);
    if (!daily || !daily.foods.length) continue;
    const meals = distributeMeals(daily.foods, mealCount);

    const sc = scoreTotals(daily.totals, targets, mealCount);
    const candidate = { meals, totals: daily.totals, score: sc };

    if (!best || sc < best.score) best = candidate;

    if (daily.totals.p >= targets.pMin && daily.totals.p <= targets.pMax &&
        daily.totals.c >= targets.cMin && daily.totals.c <= targets.cMax &&
        daily.totals.f >= targets.fMin && daily.totals.f <= targets.fMax &&
        daily.totals.cal >= targets.calMin && daily.totals.cal <= targets.calMax) {
      return candidate;
    }
  }
  return best;
}

// ---------------------------
// Generate day
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
    const best = findBestCandidate(m, targets, MAX_TOTAL_TRIES);
    if (!best) {
      document.getElementById('result').innerHTML = `<div class="card warn"><strong>No valid plan within ${MAX_TOTAL_TRIES} tries.</strong></div>`;
      return;
    }
    renderResult(Object.assign({ mealCount: m }, best), targets);
    return;
  }

  const candidates = [];
  for (let m = 3; m <= 5; m++) {
    const best = findBestCandidate(m, targets, MAX_TOTAL_TRIES / 3);
    if (best) candidates.push(Object.assign({ mealCount: m }, best));
  }

  if (!candidates.length) {
    document.getElementById('result').innerHTML = `<div class="card warn"><strong>No valid plan across 3–5 meals.</strong></div>`;
    return;
  }

  candidates.sort((a, b) => a.score - b.score);
  renderResult(candidates[0], targets);
}
