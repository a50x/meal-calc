// ui.js
// Rendering and UI interactions (depends on mealBuilder.js functions and global utilities)
// Expects: window._lastPlan, window._lastOpts, window.FOODS, window.LOCKS, pickPortion, buildMeal, tryBuildDay, rebuildMeal, uid, sample, rand, isShake

// ------------------------------
// Ensure LOCKS is initialized
if (!window.LOCKS) {
  window.LOCKS = { meals: {}, foods: {} };
}

// ------------------------------
// Helper computeTotals (returns kcal/p/c/f)
function computeTotals(plan) {
  return plan.meals.reduce((acc, meal) => {
    const mcal = (meal.items || []).reduce((s, f) => s + (f.kcal || 0), 0);
    const mp = (meal.items || []).reduce((s, f) => s + (f.p || 0), 0);
    const mc = (meal.items || []).reduce((s, f) => s + (f.c || 0), 0);
    const mf = (meal.items || []).reduce((s, f) => s + (f.f || 0), 0);
    acc.kcal += mcal; acc.p += mp; acc.c += mc; acc.f += mf;
    return acc;
  }, { kcal: 0, p: 0, c: 0, f: 0 });
}

// ------------------------------
// Sync locks with plan (initialize any missing keys)
function syncLocks(plan) {
  if (!plan || !Array.isArray(plan.meals)) return;
  plan.meals.forEach(meal => {
    if (!meal._uid) meal._uid = uid('m');
    if (!(meal._uid in LOCKS.meals)) LOCKS.meals[meal._uid] = false;
    (meal.items || []).forEach(it => {
      if (!it._uid) it._uid = uid('i');
      if (!(it._uid in LOCKS.foods)) LOCKS.foods[it._uid] = false;
    });
  });
}

// ------------------------------
// Recalc helpers
function recalcMeal(meal) {
  // ensure items exist
  meal.items = meal.items || [];
  const subtotal = { kcal: 0, p: 0, c: 0, f: 0 };
  meal.items.forEach(it => {
    // ensure numeric fields
    it.qty = it.qty ?? 1;
    // ensure base values exist (back-compat)
    it.base_kcal = it.base_kcal !== undefined ? it.base_kcal : (Number(it.kcal || 0) / (it.qty || 1));
    it.base_p = it.base_p !== undefined ? it.base_p : (Number(it.p || 0) / (it.qty || 1));
    it.base_c = it.base_c !== undefined ? it.base_c : (Number(it.c || 0) / (it.qty || 1));
    it.base_f = it.base_f !== undefined ? it.base_f : (Number(it.f || 0) / (it.qty || 1));
    // recalc current macros
    it.kcal = (it.base_kcal || 0) * (it.qty || 1);
    it.p = (it.base_p || 0) * (it.qty || 1);
    it.c = (it.base_c || 0) * (it.qty || 1);
    it.f = (it.base_f || 0) * (it.qty || 1);
    subtotal.kcal += it.kcal || 0;
    subtotal.p += it.p || 0;
    subtotal.c += it.c || 0;
    subtotal.f += it.f || 0;
  });
  meal.subtotal = subtotal;
}

function recalcTotals(plan) {
  plan.totals = computeTotals(plan);
}

// ------------------------------
// Drag state & handlers
let DRAG = null;
function onDragStart(e) {
  const tr = e.currentTarget;
  const mi = Number(tr.dataset.mi);
  const fi = Number(tr.dataset.fi);
  const itemUid = tr.dataset.itemUid;
  DRAG = { mi, fi, itemUid };
  tr.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', JSON.stringify(DRAG)); } catch (err) { /* noop */ }
}
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}
function onDrop(e) {
  e.preventDefault();
  const tr = e.currentTarget;
  if (!DRAG) return;
  const targetMi = Number(tr.dataset.mi);
  const targetFi = Number(tr.dataset.fi);
  const plan = window._lastPlan;
  if (!plan || !plan.meals) { DRAG = null; return; }
  const srcMi = DRAG.mi, srcFi = DRAG.fi;
  if (!plan.meals[srcMi] || !plan.meals[targetMi]) { DRAG = null; return; }

  // remove source
  const srcMeal = plan.meals[srcMi];
  let moved = srcMeal.items.splice(srcFi, 1)[0];
  if (!moved) {
    const idx = srcMeal.items.findIndex(it => it._uid === DRAG.itemUid);
    if (idx >= 0) moved = srcMeal.items.splice(idx, 1)[0];
  }
  if (!moved) {
    // fallback: create new pickPortion from FOODS
    const candidate = sample(window.FOODS);
    if (candidate) moved = pickPortion(candidate);
    else { DRAG = null; return; }
    moved._uid = DRAG.itemUid || uid('i');
  }

  // adjust index if moving within same meal and source before target
  let insertIndex = targetFi;
  if (srcMi === targetMi && srcFi < targetFi) insertIndex = Math.max(0, targetFi - 1);

  const targetMeal = plan.meals[targetMi];
  targetMeal.items.splice(insertIndex, 0, moved);

  // recalc and render
  recalcMeal(srcMeal);
  recalcMeal(targetMeal);
  recalcTotals(plan);
  window._lastPlan = plan;
  DRAG = null;
  renderResult(plan);
}
function onDropOnMeal(e) {
  e.preventDefault();
  const block = e.currentTarget.closest('.meal');
  if (!DRAG) return;
  const targetMi = Number(block.dataset.mi);
  const plan = window._lastPlan;
  if (!plan || !plan.meals) { DRAG = null; return; }
  const srcMi = DRAG.mi, srcFi = DRAG.fi;
  if (!plan.meals[srcMi] || !plan.meals[targetMi]) { DRAG = null; return; }
  const srcMeal = plan.meals[srcMi];
  let moved = srcMeal.items.splice(srcFi, 1)[0];
  if (!moved) {
    const idx = srcMeal.items.findIndex(it => it._uid === DRAG.itemUid);
    if (idx >= 0) moved = srcMeal.items.splice(idx, 1)[0];
  }
  if (!moved) {
    const candidate = sample(window.FOODS);
    if (candidate) moved = pickPortion(candidate);
    else { DRAG = null; return; }
    moved._uid = DRAG.itemUid || uid('i');
  }
  const targetMeal = plan.meals[targetMi];
  targetMeal.items.push(moved);
  recalcMeal(srcMeal);
  recalcMeal(targetMeal);
  recalcTotals(plan);
  window._lastPlan = plan;
  DRAG = null;
  renderResult(plan);
}
function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  DRAG = null;
}

// ------------------------------
// Render / UI
function renderResult(plan) {
  if (!plan) return;
  // ensure locks exist for entries
  syncLocks(plan);

  // ensure subtotals and totals
  plan.meals.forEach(recalcMeal);
  recalcTotals(plan);

  const out = document.getElementById('result');
  if (!out) return;
  out.innerHTML = '';

  // Ensure stable uids & base macros
  plan.meals = plan.meals.map(m => {
    if (!m._uid) m._uid = uid('m');
    m.items = (m.items || []).map(it => {
      if (!it._uid) it._uid = uid('i');
      it.qty = it.qty ?? 1;
      it.base_kcal = it.base_kcal !== undefined ? it.base_kcal : (Number(it.kcal || 0) / (it.qty || 1));
      it.base_p = it.base_p !== undefined ? it.base_p : (Number(it.p || 0) / (it.qty || 1));
      it.base_c = it.base_c !== undefined ? it.base_c : (Number(it.c || 0) / (it.qty || 1));
      it.base_f = it.base_f !== undefined ? it.base_f : (Number(it.f || 0) / (it.qty || 1));
      // ensure numeric macros
      it.kcal = (it.base_kcal || 0) * (it.qty || 1);
      it.p = (it.base_p || 0) * (it.qty || 1);
      it.c = (it.base_c || 0) * (it.qty || 1);
      it.f = (it.base_f || 0) * (it.qty || 1);
      return it;
    });
    return m;
  });

  // store last plan globally
  window._lastPlan = plan;

  // build HTML for each meal
  plan.meals.forEach((meal, mi) => {
    const mealCard = document.createElement('div');
    mealCard.className = 'card meal';
    mealCard.dataset.mi = mi;
    mealCard.dataset.mealUid = meal._uid;

    // header
    const header = document.createElement('div');
    header.className = 'meal-header';
    const lockedMeal = !!LOCKS.meals[meal._uid];
    header.innerHTML = `
      <h3 class="meal-heading">Meal ${mi + 1} — ${meal.slot ? meal.slot.toUpperCase() : ''}</h3>
      <div class="meal-actions">
        <button class="icon-btn lock ${lockedMeal ? 'active' : ''}" data-type="meal" data-meal-uid="${meal._uid}" title="Lock meal">
          ${lockedMeal ? '🔒' : '🔓'}
        </button>
        <button class="icon-btn regen" data-type="meal" data-meal-uid="${meal._uid}" title="Regenerate meal">🔁</button>
      </div>
    `;
    mealCard.appendChild(header);

    // table
    const table = document.createElement('table');
    table.className = 'meal-table';
    table.innerHTML = `
      <thead>
        <tr><th>Food</th><th>Qty</th><th>kcal</th><th>P</th><th>C</th><th>F</th><th></th></tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    meal.items.forEach((it, fi) => {
      const foodLocked = !!LOCKS.foods[it._uid];
      const tr = document.createElement('tr');
      tr.className = 'food-row';
      tr.dataset.mi = mi;
      tr.dataset.fi = fi;
      tr.dataset.itemUid = it._uid;
      tr.draggable = true;

      // qty constraints
      let qtyStep = (it.portion_scalable !== undefined && it.portion_scalable !== null) ? Number(it.portion_scalable) : null;
      let minQty = 0.25;
      let maxQty = 2.0;
      if (qtyStep === null) {
        if (it.portionable && it.min !== undefined && it.max !== undefined) {
          minQty = Number(it.min || 1);
          maxQty = Number(it.max || minQty);
          qtyStep = 1;
        } else {
          minQty = 1;
          maxQty = 1;
          qtyStep = 1;
        }
      }

      tr.innerHTML = `
        <td class="food-label">${it.label || it.name}</td>
        <td><input type="number" class="qty-input" step="${qtyStep}" min="${minQty}" max="${maxQty}" value="${it.qty}" /></td>
        <td class="td-kcal">${(it.kcal || 0).toFixed(0)}</td>
        <td class="td-p">${(it.p || 0).toFixed(1)}</td>
        <td class="td-c">${(it.c || 0).toFixed(1)}</td>
        <td class="td-f">${(it.f || 0).toFixed(1)}</td>
        <td class="food-actions">
          <button class="icon-btn lock ${foodLocked ? 'active' : ''}" data-type="food" data-meal-uid="${meal._uid}" data-item-uid="${it._uid}" title="Lock food">
            ${foodLocked ? '🔒' : '🔓'}
          </button>
          <button class="icon-btn regen" data-type="food" data-meal-uid="${meal._uid}" data-item-uid="${it._uid}" title="Regenerate food">🔁</button>
        </td>
      `;

      // qty listener
      const qtyInput = tr.querySelector('.qty-input');
      qtyInput.addEventListener('input', (e) => {
        let v = parseFloat(e.target.value);
        if (isNaN(v)) v = it.qty || 1;

        const step = parseFloat(qtyInput.step) || 0.01;
        const minv = parseFloat(qtyInput.min);
        const maxv = parseFloat(qtyInput.max);
        let snapped = Math.round(v / step) * step;
        if (snapped < minv) snapped = minv;
        if (snapped > maxv) snapped = maxv;
        const decimals = (step.toString().split('.')[1] || '').length;
        const final = Number(snapped.toFixed(decimals));

        // respect lock
        if (LOCKS.foods[it._uid]) {
          e.target.value = it.qty;
          return;
        }

        it.qty = final;
        it.kcal = (it.base_kcal || 0) * it.qty;
        it.p = (it.base_p || 0) * it.qty;
        it.c = (it.base_c || 0) * it.qty;
        it.f = (it.base_f || 0) * it.qty;

        // update UI quickly
        tr.querySelector('.td-kcal').textContent = it.kcal.toFixed(0);
        tr.querySelector('.td-p').textContent = it.p.toFixed(1);
        tr.querySelector('.td-c').textContent = it.c.toFixed(1);
        tr.querySelector('.td-f').textContent = it.f.toFixed(1);

        recalcMeal(meal);
        recalcTotals(window._lastPlan);
        // full re-render keeps handlers consistent
        renderResult(window._lastPlan);
      });

      // attach drag handlers directly on row
      tr.addEventListener('dragstart', onDragStart);
      tr.addEventListener('dragover', onDragOver);
      tr.addEventListener('drop', onDrop);
      tr.addEventListener('dragend', onDragEnd);

      tbody.appendChild(tr);
    });

    // meal subtotal row (safe access)
    const kcalSub = (meal.subtotal && (meal.subtotal.kcal ?? meal.subtotal.cal)) || 0;
    const pSub = (meal.subtotal && meal.subtotal.p) || 0;
    const cSub = (meal.subtotal && meal.subtotal.c) || 0;
    const fSub = (meal.subtotal && meal.subtotal.f) || 0;

    const subtotalRow = document.createElement('tr');
    subtotalRow.className = 'meal-subtotal totals-row';
    subtotalRow.innerHTML = `
      <td style="font-weight:700">Meal subtotal</td>
      <td></td>
      <td>${kcalSub.toFixed(0)}</td>
      <td>${pSub.toFixed(1)}</td>
      <td>${cSub.toFixed(1)}</td>
      <td>${fSub.toFixed(1)}</td>
      <td></td>
    `;
    tbody.appendChild(subtotalRow);

    mealCard.appendChild(table);
    out.appendChild(mealCard);
  });

  // Grand totals
  const grand = { kcal: 0, p: 0, c: 0, f: 0 };
  plan.meals.forEach(m => {
    grand.kcal += (m.subtotal && (m.subtotal.kcal ?? m.subtotal.cal)) || 0;
    grand.p += (m.subtotal && m.subtotal.p) || 0;
    grand.c += (m.subtotal && m.subtotal.c) || 0;
    grand.f += (m.subtotal && m.subtotal.f) || 0;
  });

  const grandRow = document.createElement('div');
  grandRow.className = 'grand-totals';
  grandRow.innerHTML = `
    <h3>Day totals — kcal: ${grand.kcal.toFixed(0)}, P: ${grand.p.toFixed(1)}, C: ${grand.c.toFixed(1)}, F: ${grand.f.toFixed(1)}</h3>
    <button id="regen-day-btn">Regenerate Day</button>
  `;
  out.appendChild(grandRow);

  // attach droppable to meal blocks (for dropping at end)
  document.querySelectorAll('#result .meal').forEach(block => {
    block.addEventListener('dragover', onDragOver);
    block.addEventListener('drop', onDropOnMeal);
  });

  // ------------------------------
  // UI button handlers (locks & regen)
  document.querySelectorAll('#result .icon-btn.lock').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = btn.dataset.type;
      if (type === 'meal') {
        const mealUid = btn.dataset.mealUid;
        LOCKS.meals[mealUid] = !LOCKS.meals[mealUid];
      } else if (type === 'food') {
        const itemUid = btn.dataset.itemUid;
        LOCKS.foods[itemUid] = !LOCKS.foods[itemUid];
      }
      // re-render so visuals update
      renderResult(window._lastPlan);
    });
  });

  document.querySelectorAll('#result .icon-btn.regen').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = btn.dataset.type;
      if (type === 'meal') {
        const mealUid = btn.dataset.mealUid;
        // regenerate that meal
        regenMeal(mealUid);
      } else if (type === 'food') {
        const mealUid = btn.dataset.mealUid;
        const itemUid = btn.dataset.itemUid;
        // regenerate just that food
        regenFood(mealUid, itemUid);
      }
    });
  });

  // regen day button
  const regenDayBtn = document.getElementById('regen-day-btn');
  if (regenDayBtn) {
    regenDayBtn.onclick = () => {
      const opts = { ...window._lastOpts, seededLocked: LOCKS };
      const newPlan = tryBuildDay(opts);
      if (newPlan) {
        // ensure uids and subtotals
        newPlan.meals.forEach(m => { if (!m._uid) m._uid = uid('m'); recalcMeal(m); });
        recalcTotals(newPlan);
        syncLocks(newPlan);
        window._lastPlan = newPlan;
        renderResult(newPlan);
      } else {
        // no-plan found: keep UI unchanged but show message
        const res = document.getElementById('result');
        if (res) {
          const warn = document.createElement('div');
          warn.className = 'card warn';
          warn.innerHTML = '<strong>No valid day found with current constraints — try widening ranges.</strong>';
          res.prepend(warn);
        }
      }
    };
  }
}

// ------------------------------
// Regen helpers

// Regen entire meal (regenerates unlocked foods within that meal)
function regenMeal(mealUid) {
  if (!window._lastPlan || !window._lastOpts) return;
  // respect locked meal
  if (LOCKS.meals[mealUid]) return;

  // find index
  const mealIndex = window._lastPlan.meals.findIndex(m => m._uid === mealUid);
  if (mealIndex === -1) return;

  // build prePlaced mapping for rebuildMeal: locked foods inside this meal
  const oldMeal = window._lastPlan.meals[mealIndex];
  const prePlaced = oldMeal.items.filter(it => LOCKS.foods[it._uid]);

  // call rebuildMeal (mealBuilder exposes it) which returns a new plan with that meal rebuilt (only unlocked replaced)
  // rebuildMeal expects plan, mealIndex, opts, locks: { mealsByIndex: { [idx]: [items] } }
  const newPlan = rebuildMeal(window._lastPlan, mealIndex, window._lastOpts || {}, { mealsByIndex: { [mealIndex]: prePlaced } });
  if (!newPlan) return;

  // preserve meal uid and item uids for kept items; ensure new items have uids
  newPlan.meals[mealIndex]._uid = oldMeal._uid;
  newPlan.meals[mealIndex].items = newPlan.meals[mealIndex].items.map((it, idx) => {
    if (!it._uid) it._uid = uid('i');
    // ensure base macros exist
    it.base_kcal = it.base_kcal ?? it.kcal ?? 0;
    it.base_p = it.base_p ?? it.p ?? 0;
    it.base_c = it.base_c ?? it.c ?? 0;
    it.base_f = it.base_f ?? it.f ?? 0;
    it.kcal = (it.base_kcal || 0) * (it.qty || 1);
    it.p = (it.base_p || 0) * (it.qty || 1);
    it.c = (it.base_c || 0) * (it.qty || 1);
    it.f = (it.base_f || 0) * (it.qty || 1);
    return it;
  });

  // recalc and sync
  newPlan.meals.forEach(recalcMeal);
  recalcTotals(newPlan);
  syncLocks(newPlan);
  window._lastPlan = newPlan;
  renderResult(newPlan);
}

// Regen a single food item safely (only affects that food)
function regenFood(mealUid, itemUid) {
  if (!window._lastPlan || !window._lastOpts) return;

  const plan = JSON.parse(JSON.stringify(window._lastPlan)); // work on clone
  const mealIndex = plan.meals.findIndex(m => m._uid === mealUid);
  if (mealIndex === -1) return;
  const meal = plan.meals[mealIndex];
  if (!meal) return;

  const itemIndex = meal.items.findIndex(it => it._uid === itemUid);
  if (itemIndex === -1) return;

  // If item locked, do nothing
  if (LOCKS.foods[itemUid]) return;

  // Build constraints for selecting a single replacement:
  // - Avoid duplicates within same meal (except the item being replaced)
  // - Enforce at most 1 shake per meal (count existing shakes excluding the replacement slot)
  // - Try to match original item's macros (prefer similar kcal/c/p/c/f), using buildMeal to pick a single item

  // prepare foodCounts to prevent same-name in same meal
  const foodCounts = {};
  meal.items.forEach((it, idx) => {
    if (idx === itemIndex) return; // skip the slot being replaced
    foodCounts[it.name] = (foodCounts[it.name] || 0) + 1;
  });

  // count shakes already in this meal (excluding the slot)
  let shakesUsed = 0;
  meal.items.forEach((it, idx) => {
    if (idx === itemIndex) return;
    if (isShake(it)) shakesUsed++;
  });

  // original item macros (used as target "perMealMax")
  const oldItem = meal.items[itemIndex];
  const perMealMax = {
    cal: Math.max(1, oldItem.kcal || 0),
    p: Math.max(0, oldItem.p || 0),
    c: Math.max(0, oldItem.c || 0),
    f: Math.max(0, oldItem.f || 0)
  };

  // dailyRemaining for this pick: available within the meal - but when picking 1 item, allow up to perMealMax.
  const dailyRemaining = { ...perMealMax };

  // preferredTags: prefer foods matching slot tags
  const preferredTags = [meal.slot || 'snack'];

  // call buildMeal to pick 1 item meeting constraints (buildMeal will avoid shakes beyond maxShakes if asked)
  const maxShakes = window._lastOpts?.maxShakes ?? 2;
  const maxRepeats = window._lastOpts?.maxRepeats ?? 1;

  const result = buildMeal(
    perMealMax,
    dailyRemaining,
    foodCounts,
    shakesUsed,
    maxShakes,
    maxRepeats,
    preferredTags,
    1,    // maxItems = 1 (we only want one replacement)
    []    // no preplaced items
  );

  if (!result || !result.mealItems || !result.mealItems.length) {
    // fallback: try a pickPortion swap using sample pool but avoid duplicates and shakes rule
    const pool = window.FOODS.filter(f => {
      if (foodCounts[f.name] >= maxRepeats) return false;
      if (isShake(f) && shakesUsed >= maxShakes) return false;
      if (f.kcal > perMealMax.cal * 1.25) return false; // avoid huge items
      return true;
    });
    let candidate = null;
    for (let i = 0; i < pool.length; i++) {
      const c = sample(pool);
      if (!c) break;
      if (c.name === oldItem.name) continue; // don't trivially pick same unless no other option
      candidate = pickPortion(c);
      if (candidate) break;
    }
    if (!candidate) {
      // allow same item if nothing else found
      candidate = pickPortion(window.FOODS.find(f => f.name === oldItem.name) || sample(window.FOODS));
    }
    if (!candidate) return;
    const newItem = candidate;
    newItem._uid = oldItem._uid;
    newItem.base_kcal = newItem.base_kcal ?? newItem.kcal ?? 0;
    newItem.base_p = newItem.base_p ?? newItem.p ?? 0;
    newItem.base_c = newItem.base_c ?? newItem.c ?? 0;
    newItem.base_f = newItem.base_f ?? newItem.f ?? 0;
    newItem.kcal = (newItem.base_kcal || 0) * (newItem.qty || 1);
    newItem.p = (newItem.base_p || 0) * (newItem.qty || 1);
    newItem.c = (newItem.base_c || 0) * (newItem.qty || 1);
    newItem.f = (newItem.base_f || 0) * (newItem.qty || 1);

    meal.items[itemIndex] = newItem;
    recalcMeal(meal);
    recalcTotals(plan);
    syncLocks(plan);
    window._lastPlan = plan;
    renderResult(plan);
    return;
  }

  // we got a candidate from buildMeal
  const candidate = result.mealItems[0];
  // preserve uid and ensure bases
  candidate._uid = oldItem._uid;
  candidate.base_kcal = candidate.base_kcal ?? candidate.kcal ?? 0;
  candidate.base_p = candidate.base_p ?? candidate.p ?? 0;
  candidate.base_c = candidate.base_c ?? candidate.c ?? 0;
  candidate.base_f = candidate.base_f ?? candidate.f ?? 0;
  candidate.kcal = (candidate.base_kcal || 0) * (candidate.qty || 1);
  candidate.p = (candidate.base_p || 0) * (candidate.qty || 1);
  candidate.c = (candidate.base_c || 0) * (candidate.qty || 1);
  candidate.f = (candidate.base_f || 0) * (candidate.qty || 1);

  // Replace and recalc
  meal.items[itemIndex] = candidate;
  recalcMeal(meal);
  recalcTotals(plan);
  syncLocks(plan);
  window._lastPlan = plan;
  renderResult(plan);
}

// ------------------------------
// Utility: move item by uid to meal uid (used by external UI or drop handlers)
function moveItemToMeal(itemUid, targetMealUid) {
  const plan = window._lastPlan;
  if (!plan) return;
  let moving = null;
  // remove
  for (const meal of plan.meals) {
    const idx = meal.items.findIndex(it => it._uid === itemUid);
    if (idx >= 0) {
      moving = meal.items.splice(idx, 1)[0];
      recalcMeal(meal);
      break;
    }
  }
  if (!moving) return;
  // add
  const target = plan.meals.find(m => m._uid === targetMealUid);
  if (!target) return;
  target.items.push(moving);
  recalcMeal(target);
  recalcTotals(plan);
  window._lastPlan = plan;
  renderResult(plan);
}

// Expose helpers (helpful for debugging)
window.ui_recalcMeal = recalcMeal;
window.ui_recalcTotals = recalcTotals;
window.ui_regenMeal = regenMeal;
window.ui_regenFood = regenFood;
window.ui_moveItemToMeal = moveItemToMeal;
