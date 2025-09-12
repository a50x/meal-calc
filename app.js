// app.js — Safe Foods Meal Generator (portion scaling ready)
// - Supports foods.json with {portionable, min, max, unit}
// - Expands portions dynamically with correct scaling
// - Maintains per-meal and daily constraints
// - Tag-aware (breakfast/lunch/snack/dinner)
// - CSV export with qty

let FOODS = [];

// ---------------------------
// Render + CSV export
function renderResult(plan) {
  const out = document.getElementById('result');
  let html = `<div class="card"><h3>Generated Day — ${plan.mealCount} meals</h3>`;
  let grand = { cal: 0, p: 0, c: 0, f: 0 };

  plan.meals.forEach((meal, idx) => {
    let mcal = 0, mp = 0, mc = 0, mf = 0;
    html += `<h4>Meal ${idx + 1}</h4><table><thead><tr><th>Food</th><th>Qty</th><th>kcal</th><th>P</th><th>C</th><th>F</th></tr></thead><tbody>`;
    meal.items.forEach(it => {
      const label = it.label || it.name;
      html += `<tr><td>${label}</td><td>${it.qty || 1}</td><td>${(it.kcal || 0).toFixed(0)}</td><td>${(it.p || 0).toFixed(1)}</td><td>${(it.c || 0).toFixed(1)}</td><td>${(it.f || 0).toFixed(1)}</td></tr>`;
      mcal += it.kcal || 0; mp += it.p || 0; mc += it.c || 0; mf += it.f || 0;
    });
    html += `<tr style="font-weight:700"><td colspan="2">Meal subtotal</td><td>${mcal.toFixed(0)}</td><td>${mp.toFixed(1)}</td><td>${mc.toFixed(1)}</td><td>${mf.toFixed(1)}</td></tr>`;
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

function exportCSV() {
  if (!window._lastPlan) {
    alert('Generate a plan first');
    return;
  }
  const rows = [['Meal','Food','Qty','Calories','Protein(g)','Carbs(g)','Fat(g)']];
  window._lastPlan.plan.meals.forEach((meal, mi) => {
    meal.items.forEach(it => {
      rows.push([
        `Meal ${mi + 1}`,
        it.label || it.name,
        it.qty || 1,
        (it.kcal || 0).toFixed(0),
        (it.p || 0).toFixed(1),
        (it.c || 0).toFixed(1),
        (it.f || 0).toFixed(1)
      ]);
    });
  });
  rows.push([
    'TOTAL','', '',
    window._lastPlan.totals.cal.toFixed(0),
    window._lastPlan.totals.p.toFixed(1),
    window._lastPlan.totals.c.toFixed(1),
    window._lastPlan.totals.f.toFixed(1)
  ]);
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mealplan.csv';
  a.click();
  URL.revokeObjectURL(url);
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
function isShake(food){ return Array.isArray(food.tags) && food.tags.includes('shake'); }

// ---------------------------
// Load + normalize foods.json
async function loadFoods(){
  try{
    const res = await fetch('foods.json');
    const raw = await res.json();
    const list = [];
    function normalizeEntry(entry){
      const name = entry.name || entry.id || (entry.label || '').toString();
      const id = entry.id || slugify(name);
      const kcal = Number(entry.kcal ?? entry.cal ?? 0);
      const p = Number(entry.p ?? entry.protein ?? 0);
      const c = Number(entry.c ?? entry.carbs ?? 0);
      const f = Number(entry.f ?? entry.fat ?? 0);
      const tags = Array.isArray(entry.tags) ? entry.tags.slice() : [];
      const portionable = entry.portionable || (entry.min !== undefined && entry.max !== undefined);
      const min = portionable ? Math.max(1, Number(entry.min ?? 1)) : 1;
      const max = portionable ? Math.max(min, Number(entry.max ?? min)) : 1;
      const unit = entry.unit || '';
      return { id, name, kcal, p, c, f, tags, portionable, min, max, unit };
    }
    if(Array.isArray(raw)) for(const it of raw) list.push(normalizeEntry(it));
    else if(raw && typeof raw === 'object'){
      for(const key of Object.keys(raw)){
        const val = raw[key];
        if(Array.isArray(val)) for(const it of val) list.push(normalizeEntry(it));
        else if(val && typeof val === 'object'){
          for(const [name, metrics] of Object.entries(val)){
            const entry = Object.assign({}, metrics);
            if(!entry.name) entry.name = name;
            list.push(normalizeEntry(entry));
          }
        }
      }
    }
    if(!list.length) throw new Error('No foods found in foods.json');
    const seen = new Set(); FOODS = [];
    for(const item of list){ if(!item.id) item.id = slugify(item.name); if(seen.has(item.id)) continue; seen.add(item.id); FOODS.push(item); }
    FOODS = FOODS.map(f => ({ ...f, tags: f.tags || [] }));
    document.getElementById('result').innerHTML = `<div class="card info"><strong>Foods loaded.</strong></div>`;
  }catch(err){
    console.error('Failed loading foods.json', err);
    document.getElementById('result').innerHTML = `<div class="card warn"><strong>Error loading foods.json</strong><br>${String(err)}</div>`;
  }
}

// ---------------------------
// Portioning (flexible)
function pickPortion(food){
  if(!food.portionable) return { ...food, qty: 1, label: food.name };
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
// Meal tag ordering helper
// Build valid meal sequence dynamically
function buildMealOrder(totalMeals) {
  const base = ['breakfast', 'lunch', 'dinner'];
  let snacksToInsert = 0;

  if (totalMeals === 3) {
    snacksToInsert = 0;
  } else if (totalMeals === 4) {
    snacksToInsert = rand(1, 2); // allow 1–2 snacks
  } else if (totalMeals === 5) {
    snacksToInsert = rand(2, 3); // allow 2–3 snacks
  }

  // Start with base in order
  let slots = ['breakfast', 'lunch', 'dinner'];

  // Possible gaps to insert snacks (before B, between B/L, between L/D, after D)
  let gaps = [0, 1, 2, 3];

  while (snacksToInsert > 0 && gaps.length > 0) {
    const g = sample(gaps);
    // Prevent back-to-back snacks:
    if ((g > 0 && slots[g - 1] === 'snack') ||
        (g < slots.length && slots[g] === 'snack')) {
      // skip this gap
      gaps = gaps.filter(x => x !== g);
      continue;
    }
    slots.splice(g, 0, 'snack');
    snacksToInsert--;
    // Update gaps indexes after insertion
    gaps = [0];
    for (let i = 1; i <= slots.length; i++) gaps.push(i);
  }

  return slots;
}

// Return allowed tags for a given mealIndex
function foodsForMealIndex(mealIndex, totalMeals) {
  if (!window._mealOrder || window._mealOrder.length !== totalMeals) {
    window._mealOrder = buildMealOrder(totalMeals);
  }
  return [window._mealOrder[mealIndex]];
}
(mealIndex, totalMeals){
  // Predefined valid meal orders
  const validOrders = {
    3: [ ['breakfast','lunch','dinner'] ],
    4: [
      ['breakfast','snack','lunch','dinner'],
      ['breakfast','lunch','dinner','snack'],
      ['breakfast','lunch','snack','dinner']
    ],
    5: [
      ['breakfast','snack','lunch','snack','dinner'],
      ['breakfast','snack','lunch','dinner','snack']
    ]
  };

  const orders = validOrders[totalMeals];
  if(!orders) return [];

  // pick one random valid sequence for this day
  const chosenOrder = sample(orders);
  return [ chosenOrder[mealIndex] ];
}

// ---------------------------
// Helper: determine which tags are allowed for a slot
function allowedTagsForSlot(slot){
  switch(slot){
    case 'breakfast':
      return ['breakfast','lunch','snack']; // breakfast can overlap lunch, snacks allowed
    case 'lunch':
      return ['breakfast','lunch','dinner','snack'];
    case 'dinner':
      return ['lunch','dinner','snack'];
    case 'snack':
      return ['snack','breakfast','lunch','dinner']; // snacks can appear anywhere
    default:
      return [];
  }
}

// ---------------------------
// Build a single meal while respecting dailyRemaining caps and per-meal soft target.
// Adds group deduplication to avoid multiple variants of the same base food
function buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, maxItems = 3){
  const mealItems = [];
  const subtotal = { cal: 0, p: 0, c: 0, f: 0 };
  const attemptsLimit = 400;
  const softMult = 1.25;
  let attempts = 0;

  // Track groups used in this meal
  const usedGroups = new Set();

  function portionFits(portion){
    if(!portion) return false;
    if(portion.kcal > dailyRemaining.cal) return false;
    if(portion.c > dailyRemaining.c) return false;
    if(portion.f > dailyRemaining.f) return false;
    if(portion.kcal > perMealMax.cal * softMult) return false;
    if(portion.c > perMealMax.c * softMult) return false;
    if(portion.f > perMealMax.f * softMult) return false;
    return true;
  }

  while(attempts < attemptsLimit && mealItems.length < maxItems){
    attempts++;

    // prioritize foods matching preferred tags
    const preferredPool = FOODS.filter(f => {
      if(foodCounts[f.name] >= maxRepeats) return false;
      if(isShake(f) && shakesUsed >= maxShakes) return false;
      if(f.kcal > dailyRemaining.cal) return false;
      if(f.c > dailyRemaining.c) return false;
      if(f.f > dailyRemaining.f) return false;
      if(f.group && usedGroups.has(f.group)) return false; // skip duplicate group
      return Array.isArray(f.tags) && f.tags.some(t => preferredTags.includes(t));
    });

    const fallbackPool = FOODS.filter(f => {
      if(foodCounts[f.name] >= maxRepeats) return false;
      if(isShake(f) && shakesUsed >= maxShakes) return false;
      if(f.kcal > dailyRemaining.cal) return false;
      if(f.c > dailyRemaining.c) return false;
      if(f.f > dailyRemaining.f) return false;
      if(f.group && usedGroups.has(f.group)) return false;
      return true;
    });

    const pool = preferredPool.length ? preferredPool : fallbackPool;
    if(!pool.length) break;

    const candidateFood = sample(pool);
    let acceptedPortion = null;
    const portionTries = candidateFood.portionable ? 4 : 1;

    for(let t=0; t<portionTries; t++){
      const tryPortion = candidateFood.portionable ? (function(){
        const minQ = candidateFood.min || 1;
        const maxQ = candidateFood.max || 1;
        const tryQtys = [minQ];
        if(maxQ > minQ) tryQtys.push(Math.min(maxQ, minQ+1));
        if(maxQ > minQ+1) tryQtys.push(maxQ);
        for(const q of tryQtys){
          const portion = { 
            ...candidateFood, 
            qty: q, 
            kcal: candidateFood.kcal*q, 
            p: candidateFood.p*q, 
            c: candidateFood.c*q, 
            f: candidateFood.f*q, 
            label: `${candidateFood.name} x${q}${candidateFood.unit ? ' ' + candidateFood.unit + (q>1?'s':'') : ''}` 
          };
          if(portionFits(portion)) return portion;
        }
        const r = pickPortion(candidateFood);
        return portionFits(r) ? r : null;
      })() : (function(){
        const r = pickPortion(candidateFood);
        return portionFits(r) ? r : null;
      })();

      if(tryPortion){ acceptedPortion = tryPortion; break; }
    }

    if(!acceptedPortion) continue;

    mealItems.push(acceptedPortion);
    subtotal.cal += acceptedPortion.kcal; subtotal.p += acceptedPortion.p; subtotal.c += acceptedPortion.c; subtotal.f += acceptedPortion.f;
    foodCounts[acceptedPortion.name] = (foodCounts[acceptedPortion.name] || 0) + 1;
    if(isShake(acceptedPortion)) shakesUsed++;
    if(acceptedPortion.group) usedGroups.add(acceptedPortion.group);

    dailyRemaining.cal -= acceptedPortion.kcal;
    dailyRemaining.c -= acceptedPortion.c;
    dailyRemaining.f -= acceptedPortion.f;

    if(subtotal.cal >= perMealMax.cal && subtotal.c >= perMealMax.c && subtotal.f >= perMealMax.f) break;
  }

  // fallback: add smallest viable item if meal ended empty
  if(mealItems.length === 0){
    const viable = FOODS.filter(f => {
      if(foodCounts[f.name] >= maxRepeats) return false;
      if(isShake(f) && shakesUsed >= maxShakes) return false;
      if(f.kcal > dailyRemaining.cal) return false;
      if(f.c > dailyRemaining.c) return false;
      if(f.f > dailyRemaining.f) return false;
      if(f.group && usedGroups.has(f.group)) return false;
      return true;
    }).sort((a,b)=>a.kcal-b.kcal);

    if(viable.length){
      const smallest = viable[0];
      const portion = pickPortion(smallest);
      if(portionFits(portion)){
        mealItems.push(portion);
        subtotal.cal += portion.kcal; subtotal.p += portion.p; subtotal.c += portion.c; subtotal.f += portion.f;
        foodCounts[portion.name] = (foodCounts[portion.name] || 0) + 1;
        if(isShake(portion)) shakesUsed++;
        if(portion.group) usedGroups.add(portion.group);
        dailyRemaining.cal -= portion.kcal;
        dailyRemaining.c -= portion.c;
        dailyRemaining.f -= portion.f;
      }
    }
  }

  return { mealItems, subtotal, foodCounts, shakesUsed };
}

// ---------------------------
// Attempt to build a full day for a given mealCount.
// Returns {meals, totals, mealCount} on success, or null.
function tryBuildDay(mealCount, targets, maxShakes, maxRepeats, maxAttempts = 1200){
  // We will do randomized trials; return first candidate that satisfies:
  // totals.cal between calMin..calMax AND totals.c <= cMax AND totals.f <= fMax AND totals.p >= pMin
  const calMin = targets.calMin, calMax = targets.calMax;
  const cMax = targets.cMax, fMax = targets.fMax, pMin = targets.pMin;

  // We'll keep the best candidate that stays within daily caps (cal,c,f) and has highest protein (as fallback)
  let bestWithinCaps = null;
  let bestWithinCapsProtein = -Infinity;

  for(let attempt = 0; attempt < maxAttempts; attempt++){
    // clone trackers
    const foodCounts = {};
    let shakesUsed = 0;
    // dailyRemaining enforces MAXES for cal/c/f (protein not enforced upward)
    const dailyRemaining = { cal: calMax, c: cMax, f: fMax };

    const meals = [];
    let failed = false;

    for(let mi = 0; mi < mealCount; mi++){
      const remainingMeals = mealCount - mi;
      // per-meal soft max = split remaining daily evenly
      const perMealMax = {
        cal: Math.max(1, dailyRemaining.cal / remainingMeals),
        // don't constrain protein upper bound here (we don't enforce p max)
        p: (targets.pMax && targets.pMax>0) ? (targets.pMax / mealCount) : 0,
        c: Math.max(0.1, dailyRemaining.c / remainingMeals),
        f: Math.max(0.1, dailyRemaining.f / remainingMeals)
      };

      const preferredTags = foodsForMealIndex(mi, mealCount) || [];
      const { mealItems, subtotal, foodCounts: newCounts, shakesUsed: newShakes } =
        buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, 3);

      // If a meal ends empty, fail this attempt (we prefer retries rather than leaving empties)
      if(!mealItems || mealItems.length === 0){
        failed = true;
        break;
      }

      // merge counts
      for(const k in newCounts) foodCounts[k] = newCounts[k];
      shakesUsed = newShakes;

      meals.push({ items: mealItems });
      // continue to next meal
    }

    if(failed) continue;

    // compute totals
    const totals = meals.reduce((acc, meal) => {
      const mcal = meal.items.reduce((s, f) => s + (f.kcal || 0), 0);
      const mp = meal.items.reduce((s, f) => s + (f.p || 0), 0);
      const mc = meal.items.reduce((s, f) => s + (f.c || 0), 0);
      const mf = meal.items.reduce((s, f) => s + (f.f || 0), 0);
      return { cal: acc.cal + mcal, p: acc.p + mp, c: acc.c + mc, f: acc.f + mf };
    }, { cal: 0, p: 0, c: 0, f: 0 });

    // Validate caps: MUST NOT exceed calMax, cMax, fMax
    if(totals.cal <= calMax && totals.c <= cMax && totals.f <= fMax){
      // Ensure we meet mins for calories and protein and carbs/fat mins (we aim to meet them)
      if(totals.cal >= calMin && totals.p >= pMin && totals.c >= targets.cMin && totals.f >= targets.fMin){
        return { meals, totals, mealCount };
      }
      // else keep as potential fallback if it has highest protein (prioritize higher protein under caps)
      if(totals.p > bestWithinCapsProtein){
        bestWithinCapsProtein = totals.p;
        bestWithinCaps = { meals, totals, mealCount };
      }
    }
    // else if totals exceed caps, we discard this attempt
  }

  // no fully valid plan found — return bestWithinCaps (if any)
  if(bestWithinCaps) return bestWithinCaps;
  return null;
}

// ---------------------------
// Generate day (driver)
function generate(){
  if(!FOODS.length){
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
  const maxShakes = Number(document.getElementById('maxShakes').value || 0);
  const maxRepeats = Number(document.getElementById('maxRepeats').value || 1);

  const MAX_TRIES_PER_MEALCOUNT = 900; // attempts per meal-count
  let mealCounts = mealChoice === 'optimal' ? [3,4,5] : [Number(mealChoice)];

  // Try meal counts in order (if optimal we try 3,4,5)
  for(const m of mealCounts){
    const plan = tryBuildDay(m, targets, maxShakes, maxRepeats, MAX_TRIES_PER_MEALCOUNT);
    if(plan){
      renderResult(plan);
      return;
    }
  }

  // If we get here, nothing strictly valid was found. As a last resort, try relaxed attempts that allow small misses:
  // We'll attempt additional randomized tries and pick a candidate with minimal overshoot penalty.
  const relaxedAttempts = 1200;
  let best = null;
  let bestPenalty = Infinity;

  for(const m of mealCounts){
    for(let a = 0; a < relaxedAttempts; a++){
      // reuse tryBuildDay but allow plans that may slightly exceed caps — we reuse the internal logic but relax maxAttempts to 1 and accept overflow
      const candidate = (function(){
        // simple single-pass builder similar to tryBuildDay but will accept final totals even if caps exceeded
        const foodCounts = {};
        let shakesUsed = 0;
        const dailyRemaining = { cal: targets.calMax, c: targets.cMax, f: targets.fMax };
        const meals = [];
        let failed = false;
        for(let mi = 0; mi < m; mi++){
          const remainingMeals = m - mi;
          const perMealMax = {
            cal: Math.max(1, dailyRemaining.cal / remainingMeals),
            p: (targets.pMax && targets.pMax>0) ? (targets.pMax / m) : 0,
            c: Math.max(0.1, dailyRemaining.c / remainingMeals),
            f: Math.max(0.1, dailyRemaining.f / remainingMeals)
          };
          const preferredTags = foodsForMealIndex(mi, m) || [];
          const { mealItems, subtotal, foodCounts: newCounts, shakesUsed: newShakes } =
            buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, 3);
          if(!mealItems || mealItems.length === 0){ failed = true; break; }
          for(const k in newCounts) foodCounts[k] = newCounts[k];
          shakesUsed = newShakes;
          meals.push({ items: mealItems });
        }
        if(failed) return null;
        const totals = meals.reduce((acc, meal) => ({
          cal: acc.cal + meal.items.reduce((s,f)=>s+(f.kcal||0),0),
          p: acc.p + meal.items.reduce((s,f)=>s+(f.p||0),0),
          c: acc.c + meal.items.reduce((s,f)=>s+(f.c||0),0),
          f: acc.f + meal.items.reduce((s,f)=>s+(f.f||0),0)
        }), {cal:0,p:0,c:0,f:0});
        return { meals, totals, mealCount: m };
      })();

      if(!candidate) continue;

      // penalty: strongly punish exceeding cal/c/f caps; mildly punish missing pMin or calMin
      const overCal = Math.max(0, candidate.totals.cal - targets.calMax);
      const overC = Math.max(0, candidate.totals.c - targets.cMax);
      const overF = Math.max(0, candidate.totals.f - targets.fMax);
      const missCal = Math.max(0, targets.calMin - candidate.totals.cal);
      const missP = Math.max(0, targets.pMin - candidate.totals.p);

      const penalty = overCal*50 + overC*40 + overF*40 + missCal*5 + missP*10;

      if(penalty < bestPenalty){
        bestPenalty = penalty;
        best = candidate;
      }
    }
  }

  if(best){
    renderResult(best);
    return;
  }

  document.getElementById('result').innerHTML = `<div class="card warn"><strong>Could not generate a plan — try widening your ranges or increasing shakes/repeats.</strong></div>`;
}

// ---------------------------
// Load foods on start
loadFoods();
