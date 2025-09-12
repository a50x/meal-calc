// app.js — Safe Foods Meal Generator (full version)
// - Supports foods.json with {portionable, min, max, unit}
// - Expands portions dynamically with correct scaling
// - Maintains per-meal and daily constraints
// - Tag-aware (breakfast/lunch/snack/dinner)
// - CSV export with qty
// - Drag-and-drop across meals
// - Lock (food/meal) and Regenerate (food/meal)
// - Locked items persist and are honored during generation

let FOODS = [];
let UID_COUNTER = 1;
const LOCKS = { foods: {}, meals: {} }; // keyed by uid -> { uid, mi } for foods; uid -> { uid, mi } for meals

// ---------------------------
// Utility helpers
function uid(prefix = '') { return `${prefix || 'u'}${UID_COUNTER++}`; }
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
// Load + normalize foods.json (preserve shape from your original loader)
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
      const portionable = !!(entry.portionable || (entry.min !== undefined && entry.max !== undefined));
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
    // dedupe by id
    const seen = new Set(); FOODS = [];
    for(const item of list){
      if(!item.id) item.id = slugify(item.name);
      if(seen.has(item.id)) continue;
      seen.add(item.id);
      FOODS.push(item);
    }
    FOODS = FOODS.map(f => ({ ...f, tags: f.tags || [] }));
    document.getElementById('result').innerHTML = `<div class="card info"><strong>Foods loaded.</strong></div>`;
  }catch(err){
    console.error('Failed loading foods.json', err);
    document.getElementById('result').innerHTML = `<div class="card warn"><strong>Error loading foods.json</strong><br>${String(err)}</div>`;
  }
}

// ---------------------------
// Portioning (flexible) — now gives a unique _uid for each item instance
function pickPortion(food){
  if(!food) return null;
  const base = { ...food };
  let qty = 1;
  if(base.portionable) qty = rand(base.min, base.max);
  const item = {
    ...base,
    _uid: uid('i'),
    qty,
    kcal: Number(base.kcal || 0) * qty,
    p: Number(base.p || 0) * qty,
    c: Number(base.c || 0) * qty,
    f: Number(base.f || 0) * qty,
    label: base.portionable ? `${base.name} x${qty}${base.unit ? ' ' + base.unit + (qty>1?'s':'') : ''}` : base.name
  };
  return item;
}

// ---------------------------
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
  let gaps = [];
  for (let i = 0; i <= slots.length; i++) gaps.push(i);

  while (snacksToInsert > 0 && gaps.length > 0) {
    const g = sample(gaps);
    // Prevent back-to-back snacks
    if ((g > 0 && slots[g - 1] === 'snack') || (g < slots.length && slots[g] === 'snack')) {
      gaps = gaps.filter(x => x !== g);
      continue;
    }
    slots.splice(g, 0, 'snack');
    snacksToInsert--;
    // rebuild gaps
    gaps = [];
    for (let i = 0; i <= slots.length; i++) gaps.push(i);
  }

  return slots;
}

// ---------------------------
// Meal tag ordering helper (returns array of allowed tags for that slot)
function foodsForMealIndex(mealIndex, totalMeals) {
  if (!window._mealOrder || window._mealOrder.length !== totalMeals) {
    window._mealOrder = buildMealOrder(totalMeals);
  }
  return [window._mealOrder[mealIndex]]; // returned as array so callers expecting array still work
}

// ---------------------------
// Helper: determine which tags are allowed for a slot (keeps compatibility with previous logic)
function allowedTagsForSlot(slot) {
  switch (slot) {
    case 'breakfast':
      return ['breakfast', 'lunch', 'snack'];
    case 'lunch':
      return ['breakfast', 'lunch', 'dinner', 'snack'];
    case 'dinner':
      return ['lunch', 'dinner', 'snack'];
    case 'snack':
      return ['snack', 'breakfast', 'lunch', 'dinner'];
    default:
      return [];
  }
}

// ---------------------------
// Build a single meal while respecting dailyRemaining caps and per-meal soft target.
// Accepts optional prePlacedItems (array) to honor locked items already in the meal.
// Returns mealItems and updated trackers
function buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, maxItems = 3, prePlacedItems = []) {
  const mealItems = [];
  const subtotal = { cal: 0, p: 0, c: 0, f: 0 };
  const attemptsLimit = 400;
  const softMult = 1.25;
  let attempts = 0;

  // Track groups used in this meal
  const usedGroups = new Set();

  // if we have prePlaced items (locked items), try inserting them first
  if (Array.isArray(prePlacedItems) && prePlacedItems.length) {
    for (const it of prePlacedItems) {
      // ensure the item still fits into dailyRemaining (if not, generation attempt will fail upstream)
      if (it.kcal > dailyRemaining.cal || it.c > dailyRemaining.c || it.f > dailyRemaining.f) {
        // return empty to indicate impossibility in this path
        return { mealItems: [], subtotal, foodCounts, shakesUsed, error: 'prePlaced overflow' };
      }
      mealItems.push(it);
      subtotal.cal += it.kcal; subtotal.p += it.p; subtotal.c += it.c; subtotal.f += it.f;
      foodCounts[it.name] = (foodCounts[it.name] || 0) + 1;
      if (isShake(it)) shakesUsed++;
      if (it.group) usedGroups.add(it.group);
      dailyRemaining.cal -= it.kcal;
      dailyRemaining.c -= it.c;
      dailyRemaining.f -= it.f;
    }
  }

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
          const portion = pickPortion({ ...candidateFood, min: q, max: q, portionable: true });
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

    // Soft stopping conditions
    if(subtotal.cal >= perMealMax.cal && subtotal.c >= perMealMax.c && subtotal.f >= perMealMax.f) break;
  }

  // fallback: if meal ended empty (no prePlaced and couldn't add any), attempt smallest viable
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
// tryBuildDay now supports seededLocked structure:
// seededLocked: { mealsByIndex: { mi: [items...] }, itemsByUid: { uid: { item, mi } } }
// When a meal index has pre-placed items, buildMeal will honor them and skip selection for that meal.
function tryBuildDay(mealCount, targets, maxShakes, maxRepeats, seededLocked = {}, maxAttempts = 1200) {
  const calMin = targets.calMin, calMax = targets.calMax;
  const cMax = targets.cMax, fMax = targets.fMax, pMin = targets.pMin;

  let bestWithinCaps = null;
  let bestWithinCapsProtein = -Infinity;

  for(let attempt = 0; attempt < maxAttempts; attempt++){
    const foodCounts = {};
    let shakesUsed = 0;
    const dailyRemaining = { cal: calMax, c: cMax, f: fMax };

    const meals = [];
    let failed = false;

    for(let mi = 0; mi < mealCount; mi++){
      const remainingMeals = mealCount - mi;
      const perMealMax = {
        cal: Math.max(1, dailyRemaining.cal / remainingMeals),
        p: (targets.pMax && targets.pMax>0) ? (targets.pMax / mealCount) : 0,
        c: Math.max(0.1, dailyRemaining.c / remainingMeals),
        f: Math.max(0.1, dailyRemaining.f / remainingMeals)
      };

      // check if we have locked/preplaced items for this meal index
      const prePlaced = (seededLocked && seededLocked.mealsByIndex && seededLocked.mealsByIndex[mi]) ? seededLocked.mealsByIndex[mi] : [];

      // Add their counts to foodCounts/shakesUsed and reduce dailyRemaining BEFORE calling buildMeal
      // However buildMeal handles prePlaced itself, so just pass prePlaced to it.
      const preferredTags = foodsForMealIndex(mi, mealCount) || [];

      const { mealItems, subtotal, foodCounts: newCounts, shakesUsed: newShakes, error } =
        buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, 3, prePlaced);

      if(error || !mealItems || mealItems.length === 0){
        failed = true;
        break;
      }

      // merge counts
      for(const k in newCounts) foodCounts[k] = newCounts[k];
      shakesUsed = newShakes;

      // subtract from dailyRemaining already done inside buildMeal through reference mutation
      meals.push({ items: mealItems });
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
      if(totals.cal >= calMin && totals.p >= pMin && totals.c >= targets.cMin && totals.f >= targets.fMin){
        return { meals, totals, mealCount };
      }
      if(totals.p > bestWithinCapsProtein){
        bestWithinCapsProtein = totals.p;
        bestWithinCaps = { meals, totals, mealCount };
      }
    }
    // else discard attempt
  }

  if(bestWithinCaps) return bestWithinCaps;
  return null;
}

// ---------------------------
// Render + UI wiring (drags, locks, regen). Ensures each meal & item has _uid for stability.
function renderResult(plan) {
  // ensure meals/items have stable _uid
  if(!plan) return;
  plan.meals = plan.meals.map(m => {
    if(!m._uid) m._uid = uid('m');
    m.items = m.items.map(it => {
      if(!it._uid) it._uid = uid('i');
      return it;
    });
    return m;
  });

  const out = document.getElementById('result');
  let html = `<div class="card"><h3>Generated Day — ${plan.mealCount} meals</h3>`;
  let grand = { cal: 0, p: 0, c: 0, f: 0 };

  plan.meals.forEach((meal, mi) => {
    let mcal = 0, mp = 0, mc = 0, mf = 0;
    const mealLocked = !!LOCKS.meals[meal._uid];

    html += `<div class="meal-block" data-mi="${mi}" data-meal-uid="${meal._uid}">
      <h4 class="meal-heading">
        Meal ${mi + 1}
        <button class="icon-btn lock ${mealLocked ? 'active' : ''}" data-type="meal" data-meal-uid="${meal._uid}" title="Lock meal">
          ${mealLocked ? '🔒' : '🔓'}
        </button>
        <button class="icon-btn regen" data-type="meal" data-mi="${mi}" data-meal-uid="${meal._uid}" title="Regenerate meal">🔁</button>
      </h4>
      <table class="meal-table">
        <thead>
          <tr><th>Food</th><th>Qty</th><th>kcal</th><th>P</th><th>C</th><th>F</th><th></th></tr>
        </thead>
        <tbody>`;

    meal.items.forEach((it, fi) => {
      const foodLocked = !!LOCKS.foods[it._uid];
      html += `<tr draggable="true" class="food-row" data-mi="${mi}" data-fi="${fi}" data-item-uid="${it._uid}">
        <td class="food-label">${it.label || it.name}</td>
        <td>${it.qty || 1}</td>
        <td>${(it.kcal || 0).toFixed(0)}</td>
        <td>${(it.p || 0).toFixed(1)}</td>
        <td>${(it.c || 0).toFixed(1)}</td>
        <td>${(it.f || 0).toFixed(1)}</td>
        <td class="food-actions">
          <button class="icon-btn lock ${foodLocked ? 'active' : ''}" data-type="food" data-mi="${mi}" data-fi="${fi}" data-item-uid="${it._uid}" title="Lock food">
            ${foodLocked ? '🔒' : '🔓'}
          </button>
          <button class="icon-btn regen" data-type="food" data-mi="${mi}" data-fi="${fi}" data-item-uid="${it._uid}" title="Regenerate food">🔁</button>
        </td>
      </tr>`;
      mcal += it.kcal || 0; mp += it.p || 0; mc += it.c || 0; mf += it.f || 0;
    });

    html += `<tr class="meal-subtotal" style="font-weight:700"><td colspan="2">Meal subtotal</td>
      <td>${mcal.toFixed(0)}</td>
      <td>${mp.toFixed(1)}</td>
      <td>${mc.toFixed(1)}</td>
      <td>${mf.toFixed(1)}</td>
      <td></td></tr>`;

    html += `</tbody></table></div>`;
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

  // attach handlers after DOM is inserted
  attachMealUIHandlers();
}

// ---------------------------
// Attach UI handlers for drag, lock, regen
function attachMealUIHandlers() {
  // Drag handlers for each food row
  const rows = document.querySelectorAll('#result .food-row');
  rows.forEach(row => {
    row.addEventListener('dragstart', onDragStart);
    row.addEventListener('dragover', onDragOver);
    row.addEventListener('drop', onDrop);
    row.addEventListener('dragend', onDragEnd);
  });

  // Make meal blocks droppable as well (to drop at end of meal)
  const mealBlocks = document.querySelectorAll('#result .meal-block');
  mealBlocks.forEach(block => {
    block.addEventListener('dragover', onDragOver);
    block.addEventListener('drop', onDropOnMeal);
  });

  // Lock buttons
  document.querySelectorAll('#result .icon-btn.lock').forEach(btn => {
    btn.addEventListener('click', onLockToggle);
    // set initial opacity by class
    btn.style.opacity = btn.classList.contains('active') ? '1' : '0.25';
  });

  // Regen buttons
  document.querySelectorAll('#result .icon-btn.regen').forEach(btn => {
    btn.style.opacity = '0.25';
    btn.addEventListener('click', onRegenClicked);
  });
}

// ---------------------------
// Drag state
let DRAG = null;
function onDragStart(e) {
  const tr = e.currentTarget;
  const mi = Number(tr.dataset.mi);
  const fi = Number(tr.dataset.fi);
  const itemUid = tr.dataset.itemUid;
  DRAG = { mi, fi, itemUid };
  tr.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', JSON.stringify(DRAG)); } catch(e){}
}
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}
function onDrop(e) {
  e.preventDefault();
  const tr = e.currentTarget;
  const targetMi = Number(tr.dataset.mi);
  const targetFi = Number(tr.dataset.fi);
  if(!DRAG) return;

  const plan = window._lastPlan.plan;
  const srcMi = DRAG.mi, srcFi = DRAG.fi;
  // bounds check
  if(!plan.meals[srcMi] || !plan.meals[targetMi]) { DRAG = null; return; }

  // Remove source item (if it still exists)
  const srcMeal = plan.meals[srcMi];
  if(!srcMeal.items[srcFi]) {
    // try find by uid fallback
    const idx = srcMeal.items.findIndex(it => it._uid === DRAG.itemUid);
    if(idx >= 0) srcMeal.items.splice(idx, 1);
  } else {
    srcMeal.items.splice(srcFi, 1);
  }

  // If moving within same meal and removing earlier item changes target index:
  let insertIndex = targetFi;
  if(srcMi === targetMi && srcFi < targetFi) insertIndex = Math.max(0, targetFi - 1);

  const targetMeal = plan.meals[targetMi];
  // find the dragged item by uid from previous plan snapshot or preserved variable
  let movedItem = window._lastPlan.planSnapshot && window._lastPlan.planSnapshot[DRAG.itemUid];
  if(!movedItem){
    // fallback: create a new item from last known values if available (we removed it above)
    movedItem = pickPortion(sample(FOODS));
    // try keep same uid if known
    movedItem._uid = DRAG.itemUid;
  }
  targetMeal.items.splice(insertIndex, 0, movedItem);

  // clear drag
  DRAG = null;
  renderResult(plan);
}
function onDropOnMeal(e) {
  e.preventDefault();
  const block = e.currentTarget;
  const targetMi = Number(block.dataset.mi);
  if(!DRAG) return;
  const plan = window._lastPlan.plan;
  const srcMi = DRAG.mi, srcFi = DRAG.fi;
  if(!plan.meals[srcMi] || !plan.meals[targetMi]) { DRAG = null; return; }
  const srcMeal = plan.meals[srcMi];
  // remove source item
  let moved = srcMeal.items.splice(srcFi, 1)[0];
  if(!moved) {
    const idx = srcMeal.items.findIndex(it => it._uid === DRAG.itemUid);
    if(idx >= 0) moved = srcMeal.items.splice(idx, 1)[0];
  }
  if(!moved) {
    // fallback: new pick
    moved = pickPortion(sample(FOODS));
    moved._uid = DRAG.itemUid;
  }
  const targetMeal = plan.meals[targetMi];
  targetMeal.items.push(moved);
  DRAG = null;
  renderResult(plan);
}
function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  DRAG = null;
}

// ---------------------------
// Lock toggle handler — uses item._uid and meal._uid to persist locks across reorders
function onLockToggle(e) {
  const btn = e.currentTarget;
  const type = btn.dataset.type;
  if(type === 'food') {
    const itemUid = btn.dataset.itemUid;
    // find the current item to know its meal index (for persistence)
    const location = findItemLocationByUid(itemUid);
    if(!location) return;
    const { mi } = location;
    if(LOCKS.foods[itemUid]) delete LOCKS.foods[itemUid];
    else LOCKS.foods[itemUid] = { uid: itemUid, mi };
  } else if(type === 'meal') {
    const mealUid = btn.dataset.mealUid;
    // toggle
    if(LOCKS.meals[mealUid]) delete LOCKS.meals[mealUid];
    else {
      // find current meal index
      const mi = findMealIndexByUid(mealUid);
      LOCKS.meals[mealUid] = { uid: mealUid, mi };
    }
  }
  // small visual toggle via class; re-render to update UI consistently
  renderResult(window._lastPlan.plan);
}

// ---------------------------
// Regen handler (food or meal)
async function onRegenClicked(e) {
  const btn = e.currentTarget;
  const type = btn.dataset.type;
  btn.classList.add('active'); // full opacity via CSS .active
  setTimeout(() => btn.classList.remove('active'), 300);

  const plan = window._lastPlan.plan;
  if(!plan) return;

  const maxAttempts = 250;

  if(type === 'food') {
    const itemUid = btn.dataset.itemUid;
    // locked? respect locks
    if(LOCKS.foods[itemUid]) return;
    // find the item location
    const loc = findItemLocationByUid(itemUid);
    if(!loc) return;
    const { mi, fi } = loc;

    // compute current totals and dailyRemaining from targets in UI
    const targets = collectTargetsFromUI();
    const maxShakes = Number(document.getElementById('maxShakes').value || 0);
    const maxRepeats = Number(document.getElementById('maxRepeats').value || 1);

    // compute current totals to know dailyRemaining caps
    const currentTotals = computeTotals(plan);
    const dailyRemaining = {
      cal: Math.max(0, targets.calMax - (currentTotals.cal - (plan.meals[mi].items[fi].kcal || 0))),
      c: Math.max(0, targets.cMax - (currentTotals.c - (plan.meals[mi].items[fi].c || 0))),
      f: Math.max(0, targets.fMax - (currentTotals.f - (plan.meals[mi].items[fi].f || 0)))
    };

    // prefer foods matching meal tag
    const slotTags = foodsForMealIndex(mi, plan.mealCount) || [];
    let replaced = false;
    for(let attempt = 0; attempt < maxAttempts && !replaced; attempt++){
      const candidateBase = sample(FOODS.filter(f => {
        // prefer allowed tags
        if(!Array.isArray(f.tags) || !f.tags.some(t => slotTags.includes(t))) return false;
        // shakes limit
        const shakesNow = countShakesInPlan(plan);
        if(isShake(f) && shakesNow >= maxShakes) return false;
        return true;
      }));
      if(!candidateBase) break;
      const candidate = pickPortion(candidateBase);
      // check if replacement fits within dailyRemaining and perMeal softMax (approx)
      if(candidate.kcal <= dailyRemaining.cal && candidate.c <= dailyRemaining.c && candidate.f <= dailyRemaining.f) {
        // apply
        plan.meals[mi].items[fi] = candidate;
        replaced = true;
      }
    }
    // if not replaced with strict tag preference, try fallback to any food
    if(!replaced){
      for(let attempt = 0; attempt < maxAttempts && !replaced; attempt++){
        const candidateBase = sample(FOODS);
        const candidate = pickPortion(candidateBase);
        if(candidate.kcal <= dailyRemaining.cal && candidate.c <= dailyRemaining.c && candidate.f <= dailyRemaining.f){
          plan.meals[mi].items[fi] = candidate;
          replaced = true;
        }
      }
    }

    renderResult(plan);
    return;
  }

  // type === 'meal'
  if(type === 'meal') {
    const mi = Number(btn.dataset.mi);
    // find meal uid
    const mealBlock = document.querySelector(`#result .meal-block[data-mi="${mi}"]`);
    if(!mealBlock) return;
    const mealUid = mealBlock.dataset.mealUid;
    if(LOCKS.meals[mealUid]) return;

    // collect targets and limits
    const targets = collectTargetsFromUI();
    const maxShakes = Number(document.getElementById('maxShakes').value || 0);
    const maxRepeats = Number(document.getElementById('maxRepeats').value || 1);

    // compute dailyRemaining by removing current meal's contribution (we will try to replace entire meal)
    const currentTotals = computeTotals(plan);
    const mealTotals = mealTotalsFor(plan.meals[mi]);
    const dailyRemaining = {
      cal: Math.max(0, targets.calMax - (currentTotals.cal - mealTotals.cal)),
      c: Math.max(0, targets.cMax - (currentTotals.c - mealTotals.c)),
      f: Math.max(0, targets.fMax - (currentTotals.f - mealTotals.f))
    };

    // Attempt to build a replacement meal of 1-3 items using buildMeal logic restricted to this meal slot
    const preferredTags = foodsForMealIndex(mi, plan.mealCount) || [];
    let replacement = null;
    for(let attempts = 0; attempts < 200 && !replacement; attempts++){
      // shallow copies for buildMeal inputs
      const foodCounts = {}; // we purposely don't enforce global repeats here (best-effort)
      const shakesUsed = countShakesInPlan(plan) - countShakesInMeal(plan.meals[mi]);
      // perMealMax roughly equals dailyRemaining (for this isolated attempt)
      const perMealMax = { cal: Math.max(1, dailyRemaining.cal), p: 0, c: Math.max(0.1, dailyRemaining.c), f: Math.max(0.1, dailyRemaining.f) };
      const { mealItems } = buildMeal(perMealMax, { ...dailyRemaining }, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, 3, []);
      if(mealItems && mealItems.length) replacement = mealItems;
    }

    if(replacement){
      plan.meals[mi].items = replacement;
    } else {
      // worst-case: replace with two random pickPortion picks
      plan.meals[mi].items = [pickPortion(sample(FOODS)), pickPortion(sample(FOODS))];
    }

    renderResult(plan);
    return;
  }
}

// ---------------------------
// Helper: compute totals
function computeTotals(plan){
  return plan.meals.reduce((acc, meal) => {
    const mcal = meal.items.reduce((s, f) => s + (f.kcal || 0), 0);
    const mp = meal.items.reduce((s, f) => s + (f.p || 0), 0);
    const mc = meal.items.reduce((s, f) => s + (f.c || 0), 0);
    const mf = meal.items.reduce((s, f) => s + (f.f || 0), 0);
    return { cal: acc.cal + mcal, p: acc.p + mp, c: acc.c + mc, f: acc.f + mf };
  }, { cal: 0, p: 0, c: 0, f: 0 });
}
function mealTotalsFor(meal){
  return meal.items.reduce((acc, it) => ({ cal: acc.cal + (it.kcal||0), p: acc.p + (it.p||0), c: acc.c + (it.c||0), f: acc.f + (it.f||0) }), { cal: 0, p: 0, c: 0, f: 0 });
}
function countShakesInPlan(plan){
  return plan.meals.reduce((s,m)=>s + m.items.reduce((a,i)=>a + (isShake(i) ? 1 : 0),0), 0);
}
function countShakesInMeal(meal){
  return meal.items.reduce((a,i)=>a + (isShake(i) ? 1 : 0),0);
}

// ---------------------------
// Find helpers
function findItemLocationByUid(itemUid) {
  const plan = window._lastPlan && window._lastPlan.plan;
  if(!plan) return null;
  for(let mi = 0; mi < plan.meals.length; mi++){
    const meal = plan.meals[mi];
    for(let fi = 0; fi < meal.items.length; fi++){
      if(meal.items[fi]._uid === itemUid) return { mi, fi, item: meal.items[fi] };
    }
  }
  return null;
}
function findMealIndexByUid(mealUid){
  const plan = window._lastPlan && window._lastPlan.plan;
  if(!plan) return -1;
  for(let mi = 0; mi < plan.meals.length; mi++){
    if(plan.meals[mi]._uid === mealUid) return mi;
  }
  return -1;
}

// ---------------------------
// Collect targets (read UI controls)
function collectTargetsFromUI(){
  return {
    calMin: Math.max(0, Number(document.getElementById('calTarget').value || 0) - Number(document.getElementById('calRange').value || 0)),
    calMax: Number(document.getElementById('calTarget').value || 0) + Number(document.getElementById('calRange').value || 0),
    pMin: Math.max(0, Number(document.getElementById('pTarget').value || 0) - Number(document.getElementById('pRange').value || 0)),
    pMax: Number(document.getElementById('pTarget').value || 0) + Number(document.getElementById('pRange').value || 0),
    cMin: Math.max(0, Number(document.getElementById('cTarget').value || 0) - Number(document.getElementById('cRange').value || 0)),
    cMax: Number(document.getElementById('cTarget').value || 0) + Number(document.getElementById('cRange').value || 0),
    fMin: Math.max(0, Number(document.getElementById('fTarget').value || 0) - Number(document.getElementById('fRange').value || 0)),
    fMax: Number(document.getElementById('fTarget').value || 0) + Number(document.getElementById('fRange').value || 0)
  };
}

// ---------------------------
// Generate day (driver) — fully wired to tryBuildDay and locks.
// Locks are respected: locked meals/items are seeded into the attempt via seededLocked.
function generate(){
  if(!FOODS.length){
    document.getElementById('result').innerHTML = `<div class="card warn"><strong>No foods loaded yet.</strong></div>`;
    return;
  }

  const targets = collectTargetsFromUI();
  const mealChoice = document.getElementById('mealCount').value;
  const maxShakes = Number(document.getElementById('maxShakes').value || 0);
  const maxRepeats = Number(document.getElementById('maxRepeats').value || 1);

  const MAX_TRIES_PER_MEALCOUNT = 1200;
  const mealCounts = mealChoice === 'optimal' ? [3,4,5] : [Number(mealChoice)];

  // Build seededLocked structure from LOCKS and the previous plan (if any)
  const seededLocked = { mealsByIndex: {}, itemsByUid: {} };
  const prevPlan = window._lastPlan && window._lastPlan.plan;
  if (prevPlan) {
    prevPlan.meals.forEach((meal, mi) => {
      // ensure meal UID
      const mealUid = meal._uid || uid('m');
  
      // if entire meal is locked
      if (mealUid && LOCKS.meals[mealUid]) {
        seededLocked.mealsByIndex[mi] = meal.items.map(it => ({ ...it }));
        meal.items.forEach(it => {
          seededLocked.itemsByUid[it._uid] = { item: it, mi };
        });
      }

      // also handle individual locked foods
      meal.items.forEach(it => {
        if (LOCKS.foods[it._uid]) {
          seededLocked.itemsByUid[it._uid] = { item: it, mi };
          if (!seededLocked.mealsByIndex[mi]) seededLocked.mealsByIndex[mi] = [];
          if (!seededLocked.mealsByIndex[mi].some(x => x._uid === it._uid)) {
            seededLocked.mealsByIndex[mi].push(it);
          }
        }
      });
    });
  }

  let plan = null;
  for (const count of mealCounts) {
    plan = tryBuildDay(count, targets, maxShakes, maxRepeats, seededLocked);
    if (plan) break;
  }

  if (!plan) {
    document.getElementById('result').innerHTML = `<div class="card warn"><strong>Failed to generate a plan. Try adjusting targets.</strong></div>`;
    return;
  }

  window._lastPlan = plan;
  renderResult(plan);
}

  for (const m of mealCounts) {
    // important: ensure meal order is re-generated (new random snack slots) each try
    window._mealOrder = buildMealOrder(m);

    const plan = tryBuildDay(m, targets, maxShakes, maxRepeats, seededLocked, MAX_TRIES_PER_MEALCOUNT);
    if(plan) {
      // Assign stable uids for meals/items and carry over locked uids from prevPlan where appropriate
      // If seededLocked had items, ensure the item uids remain same (we already copied them)
      plan.meals = plan.meals.map((meal, mi) => {
        // if seededLocked had this meal index, copy those items directly (respect locks)
        if(seededLocked.mealsByIndex && seededLocked.mealsByIndex[mi] && seededLocked.mealsByIndex[mi].length) {
          const pre = seededLocked.mealsByIndex[mi].map(it => ({ ...it, _uid: it._uid || uid('i') }));
          return { _uid: uid('m'), items: pre };
        }
        // else ensure generated items have uids
        return { _uid: uid('m'), items: meal.items.map(it => it._uid ? it : { ...it, _uid: uid('i') }) };
      });

      plan.mealCount = m;
      renderResult(plan);
      return;
    }
  }

// if we reach here, try relaxed candidate selection like before (penalty-based)
// We'll attempt multiple random candidates while honoring seededLocked and pick least-penalty.
let best = null;
let bestPenalty = Infinity;
const relaxedAttempts = 1500;

for (const m of mealCounts) {
  window._mealOrder = buildMealOrder(m);

  for (let a = 0; a < relaxedAttempts; a++) {
    // single-pass builder that accepts slight overshoot
    const foodCounts = {};
    let shakesUsed = 0;
    let dailyRemaining = { cal: targets.calMax, c: targets.cMax, f: targets.fMax };
    const meals = [];
    let failed = false;

    for (let mi = 0; mi < m; mi++) {
      const remainingMeals = m - mi;
      const perMealMax = {
        cal: Math.max(1, dailyRemaining.cal / remainingMeals),
        p: (targets.pMax && targets.pMax > 0) ? (targets.pMax / m) : 0,
        c: Math.max(0.1, dailyRemaining.c / remainingMeals),
        f: Math.max(0.1, dailyRemaining.f / remainingMeals)
      };

      const preferredTags = foodsForMealIndex(mi, m) || [];
      const prePlaced = (seededLocked.mealsByIndex && seededLocked.mealsByIndex[mi])
        ? seededLocked.mealsByIndex[mi]
        : [];

      const { mealItems, subtotal, foodCounts: newCounts, shakesUsed: newShakes } =
        buildMeal(perMealMax, dailyRemaining, foodCounts, shakesUsed, maxShakes, maxRepeats, preferredTags, 3, prePlaced);

      if (!mealItems || mealItems.length === 0) {
        failed = true;
        break;
      }

      // merge
      for (const k in newCounts) foodCounts[k] = newCounts[k];
      shakesUsed = newShakes;
      meals.push({ items: mealItems });
    }

    if (failed) continue;

    const totals = computeTotals({ meals });
    // penalty
    const overCal = Math.max(0, totals.cal - targets.calMax);
    const overC = Math.max(0, totals.c - targets.cMax);
    const overF = Math.max(0, totals.f - targets.fMax);
    const missCal = Math.max(0, targets.calMin - totals.cal);
    const missP = Math.max(0, targets.pMin - totals.p);
    const penalty = overCal * 50 + overC * 40 + overF * 40 + missCal * 5 + missP * 10;

    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = { meals, totals, mealCount: m };
    }
  }
}

if (best) {
  // ensure UIDs for meals and items
  best.meals = best.meals.map(m => ({
    _uid: m._uid || uid('m'),
    items: m.items.map(it => ({
      ...it,
      _uid: it._uid || uid('i')
    }))
  }));
  renderResult(best);
  return;
}

// process seeded locked items
mealCounts.forEach((meal, mi) => {
  if (!meal || !meal.items) return;

  meal.items.forEach(it => {
    if (it && it._uid && LOCKS.foods[it._uid]) {
      seededLocked.mealsByIndex[mi] = seededLocked.mealsByIndex[mi] || [];
      seededLocked.mealsByIndex[mi].push({ ...it });
    }
  });
});

let result = null;
for (const mc of mealCounts) {
  result = tryBuildDay(mc, targets, maxShakes, maxRepeats, seededLocked, MAX_TRIES_PER_MEALCOUNT);
  if (result) break;
}

if (result) {
  renderResult(result);
} else {
  document.getElementById('result').innerHTML = `
    <div class="card warn">
      <strong>Failed to generate a valid day with the current constraints.</strong>
    </div>`;
}

// ---------------------------
// CSV Export
function exportCSV(plan){
  if(!plan) return;
  let csv = 'Meal,Food,Qty,kcal,Protein,Carbs,Fat\n';
  plan.meals.forEach((meal, mi) => {
    meal.items.forEach(it => {
      csv += `${mi+1},${it.name},${it.qty || 1},${it.kcal.toFixed(0)},${it.p.toFixed(1)},${it.c.toFixed(1)},${it.f.toFixed(1)}\n`;
    });
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meal_plan.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------
// Initial wiring
document.getElementById('generateBtn').addEventListener('click', generate);
document.getElementById('exportCsvBtn').addEventListener('click', () => exportCSV(window._lastPlan.plan));
window.addEventListener('load', loadFoods);

// ---------------------------
// Small helper: quick demo generate (keeps same API but tries to use real generator)
function quickGenerateDemo() {
  // fallback: if FOODS loaded, create a simple plan to show UI quickly
  if (!FOODS.length) return;
  const plan = {
    mealCount: 4,
    meals: [
      { items: [ pickPortion(sample(FOODS)), pickPortion(sample(FOODS)) ] },
      { items: [ pickPortion(sample(FOODS)) ] },
      { items: [ pickPortion(sample(FOODS)), pickPortion(sample(FOODS)) ] },
      { items: [ pickPortion(sample(FOODS)) ] }
    ]
  };
  renderResult(plan);
}

// ---------------------------
// Load foods on start
loadFoods();
