// app.js — Safe Foods Meal Generator (daily-aware + per-meal + tag-aware + even distribution + portionable support)

let FOODS = []; // normalized food list

// ---------------------------
// Render + CSV export
function renderResult(plan) {
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
    if(Array.isArray(raw)) for(const it of raw) list.push(normalizeEntry(it));
    else if(raw && typeof raw === 'object'){
      for(const key of Object.keys(raw)){
        const val = raw[key];
        if(Array.isArray(val)) for(const it of val) list.push(normalizeEntry(it));
        else if(val && typeof val === 'object'){
          const valuesAreFoodObjects = Object.values(val).some(v=>typeof v==='object'&&(v.cal!==undefined||v.kcal!==undefined||v.p!==undefined));
          if(valuesAreFoodObjects){
            for(const [name, metrics] of Object.entries(val)){
              const entry = Object.assign({}, metrics);
              if(!entry.name) entry.name = name;
              list.push(normalizeEntry(entry));
            }
          } else list.push(normalizeEntry(Object.assign({ name: key }, val)));
        }
      }
    }
    if(!list.length) throw new Error('No foods found in foods.json');
    const seen = new Set(); FOODS = [];
    for(const item of list){ if(!item.id) item.id = slugify(item.name); if(seen.has(item.id)) continue; seen.add(item.id); FOODS.push(item); }
    FOODS = FOODS.map(f => ({ ...f, tags: f.tags || [] }));
    document.getElementById('result').innerHTML = `<div class="card info"><strong>Foods loaded.</strong> You can now generate a plan.</div>`;
  }catch(err){
    console.error('Failed loading foods.json', err);
    document.getElementById('result').innerHTML = `<div class="card warn"><strong>Error loading foods.json</strong><br>${String(err)}</div>`;
  }
}

// ---------------------------
// Portioning
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
function foodsForMealIndex(mealIndex, totalMeals){
  if(totalMeals === 3) return ['breakfast','lunch','dinner'][mealIndex] ? [ ['breakfast','lunch','dinner'][mealIndex] ] : [];
  if(totalMeals === 4) return ['breakfast','lunch','snack','dinner'][mealIndex] ? [ ['breakfast','lunch','snack','dinner'][mealIndex] ] : [];
  if(totalMeals === 5) return ['breakfast','snack','lunch','snack','dinner'][mealIndex] ? [ ['breakfast','snack','lunch','snack','dinner'][mealIndex] ] : [];
  return [];
}

// ---------------------------
// Build a single meal while respecting dailyRemaining caps and per-meal soft target.
function buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags){
  const mealItems = [];
  const subtotal = { cal: 0, p: 0, c: 0, f: 0 };
  const attemptsLimit = 400;
  const softMult = 1.25; 
  let attempts = 0;

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

  while(attempts < attemptsLimit){
    attempts++;
    const preferredPool = FOODS.filter(f => {
      if(foodCounts[f.name] >= maxRepeats) return false;
      if(isShake(f) && shakesUsed >= maxShakes) return false;
      if(f.kcal > dailyRemaining.cal) return false;
      if(f.c > dailyRemaining.c) return false;
      if(f.f > dailyRemaining.f) return false;
      return Array.isArray(f.tags) && f.tags.some(t => preferredTags.includes(t));
    });

    const fallbackPool = FOODS.filter(f => {
      if(foodCounts[f.name] >= maxRepeats) return false;
      if(isShake(f) && shakesUsed >= maxShakes) return false;
      if(f.kcal > dailyRemaining.cal) return false;
      if(f.c > dailyRemaining.c) return false;
      if(f.f > dailyRemaining.f) return false;
      return true;
    });

    const pool = preferredPool.length ? preferredPool : fallbackPool;
    if(!pool.length) break;

    const candidateFood = sample(pool);
    let acceptedPortion = null;
    const portionTries = candidateFood.portionable ? 4 : 1;

    for(let t = 0; t < portionTries; t++){
      const tryPortion = candidateFood.portionable ? (function(){
        const minQ = candidateFood.min || 1;
        const maxQ = candidateFood.max || 1;
        const tryQtys = [minQ];
        if(maxQ > minQ) tryQtys.push(Math.min(maxQ, minQ+1));
        if(maxQ > minQ + 1) tryQtys.push(maxQ);
        for(const q of tryQtys){
          const portion = { ...candidateFood, qty: q, kcal: candidateFood.kcal * q, p: candidateFood.p * q, c: candidateFood.c * q, f: candidateFood.f * q, label: `${candidateFood.name} x${q}${candidateFood.unit ? ' ' + candidateFood.unit + (q>1?'s':'') : ''}` };
          if(portionFits(portion)) return portion;
        }
        const r = pickPortion(candidateFood);
        return portionFits(r) ? r : null;
      })() : pickPortion(candidateFood);

      if(tryPortion){
        acceptedPortion = tryPortion;
        break;
      }
    }

    if(!acceptedPortion) continue;

    mealItems.push(acceptedPortion);
    subtotal.cal += acceptedPortion.kcal; subtotal.p += acceptedPortion.p; subtotal.c += acceptedPortion.c; subtotal.f += acceptedPortion.f;
    foodCounts[acceptedPortion.name] = (foodCounts[acceptedPortion.name] || 0) + 1;
    if(isShake(acceptedPortion)) shakesUsed++;

    dailyRemaining.cal -= acceptedPortion.kcal;
    dailyRemaining.c -= acceptedPortion.c;
    dailyRemaining.f -= acceptedPortion.f;

    if(subtotal.cal >= perMealMax.cal && subtotal.c >= perMealMax.c && subtotal.f >= perMealMax.f) break;
  }

  if(mealItems.length === 0){
    const viable = FOODS.filter(f => {
      if(foodCounts[f.name] >= maxRepeats) return false;
      if(isShake(f) && shakesUsed >= maxShakes) return false;
      if(f.kcal > dailyRemaining.cal) return false;
      if(f.c > dailyRemaining.c) return false;
      if(f.f > dailyRemaining.f) return false;
      return true;
    });
    if(viable.length){
      viable.sort((a,b)=>a.kcal-b.kcal);
      const smallest = viable[0];
      const portion = pickPortion(smallest);
      if(portionFits(portion)){
        mealItems.push(portion);
        subtotal.cal += portion.kcal; subtotal.p += portion.p; subtotal.c += portion.c; subtotal.f += portion.f;
        foodCounts[portion.name] = (foodCounts[portion.name] || 0) + 1;
        if(isShake(portion)) shakesUsed++;
        dailyRemaining.cal -= portion.kcal;
        dailyRemaining.c -= portion.c;
        dailyRemaining.f -= portion.f;
      }
    }
  }

  return { mealItems, subtotal, foodCounts, shakesUsed };
}

// ---------------------------
// Build a full day
function tryBuildDay(targets, mealCount = 4, maxShakes = 2, maxRepeats = 2, maxAttempts = 50){
  for(let attempt = 0; attempt < maxAttempts; attempt++){
    const meals = [];
    const foodCounts = {};
    let shakesUsed = 0;
    const dailyRemaining = { cal: targets.cal, p: targets.p, c: targets.c, f: targets.f };
    const perMealMax = { cal: targets.cal / mealCount, p: targets.p / mealCount, c: targets.c / mealCount, f: targets.f / mealCount };

    for(let mi = 0; mi < mealCount; mi++){
      const tags = foodsForMealIndex(mi, mealCount);
      const meal = buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, tags);
      meals.push({ items: meal.mealItems, subtotal: meal.subtotal });
      shakesUsed = meal.shakesUsed;
    }

    if(dailyRemaining.cal >= -50 && dailyRemaining.c >= -10 && dailyRemaining.f >= -5) return { meals, mealCount };
  }
  return null;
}

// ---------------------------
// Generate plan button
function generatePlan(targets, mealCount = 4){
  const plan = tryBuildDay(targets, mealCount);
  if(plan) renderResult(plan);
  else document.getElementById('result').innerHTML = `<div class="card warn">Failed to generate plan within constraints.</div>`;
}

// ---------------------------
// Init
window.addEventListener('DOMContentLoaded', () => { loadFoods(); });
