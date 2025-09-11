// app.js — Safe Foods Meal Generator (daily-aware + per-meal + tag-aware + even distribution)

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
    const seen = new Set(); FOODS = [];
    for (const item of list) { if (!item.id) item.id = slugify(item.name); if (seen.has(item.id)) continue; seen.add(item.id); FOODS.push(item); }
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
  if (totalMeals === 3) return [['breakfast','lunch','dinner'][mealIndex]];
  if (totalMeals === 4) return [['breakfast','lunch','snack','dinner'][mealIndex]];
  if (totalMeals === 5) return [['breakfast','snack','lunch','snack','dinner'][mealIndex]];
  return [];
}

// ---------------------------
// Build single meal with daily-aware limits
function buildMealDaily(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats) {
  const mealItems = [];
  let subtotal = { cal: 0, p: 0, c: 0, f: 0 };
  let attempts = 0;
  while (attempts < 5000) {
    attempts++;
    const food = pickPortion(sample(FOODS));
    if (foodCounts[food.name] >= maxRepeats) continue;
    if (isShake(food) && shakesUsed >= maxShakes) continue;

    // skip foods that would exceed daily remaining
    if (food.kcal > dailyRemaining.cal ||
        food.p > dailyRemaining.p ||
        food.c > dailyRemaining.c ||
        food.f > dailyRemaining.f) continue;

    // skip foods that exceed per-meal soft max
    const soft = 1.3;
    if (food.kcal > perMealMax.cal * soft || food.c > perMealMax.c * soft || food.f > perMealMax.f * soft) continue;

    mealItems.push(food);
    subtotal.cal += food.kcal; subtotal.p += food.p; subtotal.c += food.c; subtotal.f += food.f;
    foodCounts[food.name] = (foodCounts[food.name] || 0) + 1;
    if (isShake(food)) shakesUsed++;

    // update daily remaining
    dailyRemaining.cal -= food.kcal;
    dailyRemaining.p -= food.p;
    dailyRemaining.c -= food.c;
    dailyRemaining.f -= food.f;

    // stop early if per-meal soft target reached
    if (subtotal.cal >= perMealMax.cal && subtotal.p >= perMealMax.p && subtotal.c >= perMealMax.c && subtotal.f >= perMealMax.f) break;

    // stop if no more daily allowance
    if (dailyRemaining.cal <= 0 && dailyRemaining.p <= 0 && dailyRemaining.c <= 0 && dailyRemaining.f <= 0) break;
  }

  return { mealItems, subtotal, foodCounts, shakesUsed };
}

// ---------------------------
// Generate day
function generate() {
  if (!FOODS.length) { document.getElementById('result').innerHTML = `<div class="card warn"><strong>No foods loaded yet.</strong></div>`; return; }
  const targets = {
    calMin: Number(document.getElementById('calTarget').value || 0) - Number(document.getElementById('calRange').value || 0),
    calMax: Number(document.getElementById('calTarget').value || 0) + Number(document.getElementById('calRange').value || 0),
    pMin: Number(document.getElementById('pTarget').value || 0) - Number(document.getElementById('pRange').value || 0),
    pMax: Number(document.getElementById('pTarget').value || 0) + Number(document.getElementById('pRange').value || 0),
    cMin: Number(document.getElementById('cTarget').value || 0) - Number(document.getElementById('cRange').value || 0),
    cMax: Number(document.getElementById('cTarget').value || 0) + Number(document.getElementById('cRange').value || 0),
    fMin: Number(document.getElementById('fTarget').value || 0) - Number(document.getElementById('fRange').value || 0),
    fMax: Number(document.getElementById('fTarget').value || 0) + Number(document.getElementById('fRange').value || 0)
  };
  const mealChoice = document.getElementById('mealCount').value;
  let mealCounts = mealChoice === 'optimal' ? [3, 4, 5] : [Number(mealChoice)];
  const maxShakes = Number(document.getElementById('maxShakes').value || 0);
  const maxRepeats = Number(document.getElementById('maxRepeats').value || 1);
  let finalPlan = null;

  for (const m of mealCounts) {
    const meals = [];
    const foodCounts = {};
    let shakesUsed = 0;

    // daily remaining starts at max targets
    const dailyRemaining = { cal: targets.calMax, p: targets.pMax, c: targets.cMax, f: targets.fMax };

    for (let i = 0; i < m; i++) {
      // divide remaining daily allowance evenly among remaining meals
      const mealsLeft = m - i;
      const perMealMax = {
        cal: dailyRemaining.cal / mealsLeft,
        p: dailyRemaining.p / mealsLeft,
        c: dailyRemaining.c / mealsLeft,
        f: dailyRemaining.f / mealsLeft
      };

      const { mealItems, subtotal, foodCounts: newFoodCounts, shakesUsed: newShakesUsed } =
        buildMealDaily(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats);

      for (const k in newFoodCounts) foodCounts[k] = newFoodCounts[k];
      shakesUsed = newShakesUsed;
      meals.push({ items: mealItems });
    }

    const totals = meals.reduce((acc, m) => ({
      cal: acc.cal + m.items.reduce((s, f) => s + f.kcal, 0),
      p: acc.p + m.items.reduce((s, f) => s + f.p, 0),
      c: acc.c + m.items.reduce((s, f) => s + f.c, 0),
      f: acc.f + m.items.reduce((s, f) => s + f.f, 0)
    }), { cal: 0, p: 0, c: 0, f: 0 });

    finalPlan = { meals, totals, mealCount: m };
    break;
  }

  if (!finalPlan) { document.getElementById('result').innerHTML = `<div class="card warn"><strong>Could not generate a plan.</strong></div>`; return; }
  renderResult(finalPlan);
}

// ---------------------------
// Load foods on start
loadFoods();
