// ui.js
// Rendering and UI interactions (depends on mealBuilder.js functions and global utilities)

// Note: this file expects window._lastPlan, FOODS, LOCKS, pickPortion, buildMeal, tryBuildDay, computeTotals helpers to exist

// ------------------------------
// Helper computeTotals (keeps parity with earlier computeTotals)
function computeTotals(plan) {
  return plan.meals.reduce((acc, meal) => {
    const mcal = meal.items.reduce((s, f) => s + (f.kcal || 0), 0);
    const mp = meal.items.reduce((s, f) => s + (f.p || 0), 0);
    const mc = meal.items.reduce((s, f) => s + (f.c || 0), 0);
    const mf = meal.items.reduce((s, f) => s + (f.f || 0), 0);
    return { cal: acc.cal + mcal, p: acc.p + mp, c: acc.c + mc, f: acc.f + mf };
  }, { cal: 0, p: 0, c: 0, f: 0 });
}

// ------------------------------
// Render
function renderResult(plan) {
  if (!plan) return;
  const out = document.getElementById('result');
  out.innerHTML = '';

  // Ensure each meal and item has stable _uid (back-compat)
  plan.meals = plan.meals.map(m => {
    if (!m._uid) m._uid = uid('m');
    m.items = m.items.map(it => {
      if (!it._uid) it._uid = uid('i');
      // ensure base fields exist (for recalculation when user changes qty)
      it.base_kcal = it.base_kcal !== undefined ? it.base_kcal : (Number(it.kcal || 0) / (it.qty || 1));
      it.base_p = it.base_p !== undefined ? it.base_p : (Number(it.p || 0) / (it.qty || 1));
      it.base_c = it.base_c !== undefined ? it.base_c : (Number(it.c || 0) / (it.qty || 1));
      it.base_f = it.base_f !== undefined ? it.base_f : (Number(it.f || 0) / (it.qty || 1));
      return it;
    });
    return m;
  });

  // store last plan
  window._lastPlan = plan;

  // build HTML
  plan.meals.forEach((meal, mi) => {
    const mealCard = document.createElement('div');
    mealCard.className = 'card meal';
    mealCard.dataset.mi = mi;
    mealCard.dataset.mealUid = meal._uid;

    // Header
    const header = document.createElement('div');
    header.className = 'meal-header';
    const locked = !!LOCKS.meals[meal._uid];
    header.innerHTML = `
      <h3 class="meal-heading">Meal ${mi + 1} — ${meal.slot ? meal.slot.toUpperCase() : ''}</h3>
      <div class="meal-actions">
        <button class="icon-btn lock ${locked ? 'active' : ''}" data-type="meal" data-meal-uid="${meal._uid}" title="Lock meal">
          ${locked ? '🔒' : '🔓'}
        </button>
        <button class="icon-btn regen" data-type="meal" data-mi="${mi}" data-meal-uid="${meal._uid}" title="Regenerate meal">🔁</button>
      </div>
    `;
    mealCard.appendChild(header);

    // Table
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

      // Determine step/min/max for qty input
      let qtyStep = it.portion_scalable !== undefined && it.portion_scalable !== null ? Number(it.portion_scalable) : null;
      let minQty = 0.25;
      let maxQty = 2.0;
      // Fallback: if item was integer-based portionable without portion_scalable, constrain to ints of 1..max or 1 by default.
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
          <button class="icon-btn lock ${foodLocked ? 'active' : ''}" data-type="food" data-mi="${mi}" data-fi="${fi}" data-item-uid="${it._uid}" title="Lock food">
            ${foodLocked ? '🔒' : '🔓'}
          </button>
          <button class="icon-btn regen" data-type="food" data-mi="${mi}" data-fi="${fi}" data-item-uid="${it._uid}" title="Regenerate food">🔁</button>
        </td>
      `;

      // Attach qty listener to update macros live and snap to step
      const qtyInput = tr.querySelector('.qty-input');
      qtyInput.addEventListener('input', (e) => {
        let v = parseFloat(e.target.value);
        if (isNaN(v)) v = it.qty || 1;

        // snap to step
        const step = parseFloat(qtyInput.step) || 0.01;
        const minv = parseFloat(qtyInput.min);
        const maxv = parseFloat(qtyInput.max);
        // rounding to nearest step
        const snapped = Math.round(v / step) * step;
        let final = snapped;
        if (final < minv) final = minv;
        if (final > maxv) final = maxv;
        // ensure numeric precision to step decimals
        const decimals = (step.toString().split('.')[1] || '').length;
        final = Number(final.toFixed(decimals));

        // If this item is locked, do not change qty
        if (LOCKS.foods[it._uid]) {
          // revert displayed value to existing qty
          e.target.value = it.qty;
          return;
        }

        // update item qty and derived macros
        it.qty = final;
        it.kcal = (it.base_kcal || 0) * it.qty;
        it.p = (it.base_p || 0) * it.qty;
        it.c = (it.base_c || 0) * it.qty;
        it.f = (it.base_f || 0) * it.qty;

        // refresh row and totals
        tr.querySelector('.td-kcal').textContent = it.kcal.toFixed(0);
        tr.querySelector('.td-p').textContent = it.p.toFixed(1);
        tr.querySelector('.td-c').textContent = it.c.toFixed(1);
        tr.querySelector('.td-f').textContent = it.f.toFixed(1);

        recalcMeal(meal);
        recalcTotals(window._lastPlan);
        renderResult(window._lastPlan); // re-render to keep UI consistent (re-attaches handlers)
      });

      tbody.appendChild(tr);
    });

    // meal subtotal row
    const subtotalRow = document.createElement('tr');
    subtotalRow.className = 'meal-subtotal totals-row';
    subtotalRow.innerHTML = `
      <td style="font-weight:700">Meal subtotal</td>
      <td></td>
      <td>${(meal.subtotal.cal || meal.subtotal.kcal || 0).toFixed ? (meal.subtotal.kcal || meal.subtotal.cal || 0).toFixed(0) : '0'}</td>
      <td>${(meal.subtotal.p || 0).toFixed(1)}</td>
      <td>${(meal.subtotal.c || 0).toFixed(1)}</td>
      <td>${(meal.subtotal.f || 0).toFixed(1)}</td>
      <td></td>
    `;
    tbody.appendChild(subtotalRow);

    mealCard.appendChild(table);
    out.appendChild(mealCard);
  });

  // Grand totals card
  let grand = { cal: 0, p: 0, c: 0, f: 0 };
  plan.meals.forEach(m => {
    grand.cal += m.subtotal.kcal || m.subtotal.cal || 0;
    grand.p += m.subtotal.p || 0;
    grand.c += m.subtotal.c || 0;
    grand.f += m.subtotal.f || 0;
  });

  const totalsCard = document.createElement('div');
  totalsCard.className = 'card';
  totalsCard.innerHTML = `
    <div style="margin-top:10px">
      <span class="pill">Calories: <strong>${grand.cal.toFixed(0)}</strong></span>
      <span class="pill">Protein: <strong>${grand.p.toFixed(1)} g</strong></span>
      <span class="pill">Carbs: <strong>${grand.c.toFixed(1)} g</strong></span>
      <span class="pill">Fat: <strong>${grand.f.toFixed(1)} g</strong></span>
    </div>
  `;
  out.appendChild(totalsCard);

  // attach handlers after DOM insertion
  attachMealUIHandlers();
}

// ------------------------------
// Event handlers (drag, drop, lock toggle, regen)
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
  const mealBlocks = document.querySelectorAll('#result .meal');
  mealBlocks.forEach(block => {
    block.addEventListener('dragover', onDragOver);
    block.addEventListener('drop', onDropOnMeal);
  });

  // Lock buttons
  document.querySelectorAll('#result .icon-btn.lock').forEach(btn => {
    btn.addEventListener('click', onLockToggle);
    btn.style.opacity = btn.classList.contains('active') ? '1' : '0.25';
  });

  // Regen buttons
  document.querySelectorAll('#result .icon-btn.regen').forEach(btn => {
    btn.style.opacity = '0.25';
    btn.addEventListener('click', onRegenClicked);
  });
}

// ------------------------------
// Drag state and functions (same semantics as original)
let DRAG = null;
function onDragStart(e) {
  const tr = e.currentTarget;
  const mi = Number(tr.dataset.mi);
  const fi = Number(tr.dataset.fi);
  const itemUid = tr.dataset.itemUid;
  DRAG = { mi, fi, itemUid };
  tr.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', JSON.stringify(DRAG)); } catch (err) {}
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
  if (!DRAG) return;

  const plan = window._lastPlan;
  const srcMi = DRAG.mi, srcFi = DRAG.fi;
  if (!plan.meals[srcMi] || !plan.meals[targetMi]) { DRAG = null; return; }

  // remove source item
  const srcMeal = plan.meals[srcMi];
  let moved = srcMeal.items.splice(srcFi, 1)[0];
  if (!moved) { // find by uid
    const idx = srcMeal.items.findIndex(it => it._uid === DRAG.itemUid);
    if (idx >= 0) moved = srcMeal.items.splice(idx, 1)[0];
  }
  if (!moved) {
    // fallback: create a new pickPortion to preserve UX
    moved = pickPortion(sample(window.FOODS));
    moved._uid = DRAG.itemUid;
  }

  // adjust insertion index if moving within same meal & earlier removal changes index
  let insertIndex = targetFi;
  if (srcMi === targetMi && srcFi < targetFi) insertIndex = Math.max(0, targetFi - 1);

  const targetMeal = plan.meals[targetMi];
  targetMeal.items.splice(insertIndex, 0, moved);

  // recalc affected meals & totals
  recalcMeal(srcMeal);
  recalcMeal(targetMeal);
  recalcTotals(plan);
  DRAG = null;
  renderResult(plan);
}

function onDropOnMeal(e) {
  e.preventDefault();
  const block = e.currentTarget.closest('.meal');
  const targetMi = Number(block.dataset.mi);
  if (!DRAG) return;
  const plan = window._lastPlan;
  const srcMi = DRAG.mi, srcFi = DRAG.fi;
  if (!plan.meals[srcMi] || !plan.meals[targetMi]) { DRAG = null; return; }
  const srcMeal = plan.meals[srcMi];
  let moved = srcMeal.items.splice(srcFi, 1)[0];
  if (!moved) {
    const idx = srcMeal.items.findIndex(it => it._uid === DRAG.itemUid);
    if (idx >= 0) moved = srcMeal.items.splice(idx, 1)[0];
  }
  if (!moved) {
    moved = pickPortion(sample(window.FOODS));
    moved._uid = DRAG.itemUid;
  }
  const targetMeal = plan.meals[targetMi];
  targetMeal.items.push(moved);
  recalcMeal(srcMeal);
  recalcMeal(targetMeal);
  recalcTotals(plan);
  DRAG = null;
  renderResult(plan);
}
function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  DRAG = null;
}

// ------------------------------
// Lock toggle handler — uses item._uid and meal._uid to persist locks across reorders
function onLockToggle(e) {
  const btn = e.currentTarget;
  const type = btn.dataset.type;
  if (type === 'food') {
    const itemUid = btn.dataset.itemUid || btn.dataset.itemUid;
    // find actual uid from dataset if not present
    const location = findItemLocationByUid(itemUid);
    if (!location) return;
    const { mi } = location;
    if (LOCKS.foods[itemUid]) delete LOCKS.foods[itemUid];
    else LOCKS.foods[itemUid] = { uid: itemUid, mi };
  } else if (type === 'meal') {
    const mealUid = btn.dataset.mealUid;
    if (LOCKS.meals[mealUid]) delete LOCKS.meals[mealUid];
    else {
      const mi = findMealIndexByUid(mealUid);
      LOCKS.meals[mealUid] = { uid: mealUid, mi };
    }
  }
  // visual toggle & re-render
  renderResult(window._lastPlan);
}

// ------------------------------
// Regen (lock-aware)
function onRegenClicked(e) {
  const btn = e.currentTarget;
  const type = btn.dataset.type;
  const plan = window._lastPlan;
  if (!plan) return;

  if (type === "food") {
    const { mi, fi } = btn.dataset;
    const itemUid = btn.dataset.itemUid;
    // 🚫 skip if locked
    if (LOCKS.foods[itemUid]) return;

    // replace food
    const newFood = pickPortion(sample(window.FOODS));
    if (newFood) {
      newFood._uid = "i" + mi + "_" + fi;
      plan.meals[mi].items[fi] = newFood;
    }
    recalcMeal(plan.meals[mi]);
    recalcTotals(plan);
    renderResult(plan);

  } else if (type === "meal") {
    const { mi } = btn.dataset;
    const mealUid = btn.dataset.mealUid;
    // 🚫 skip if locked
    if (LOCKS.meals[mealUid]) return;

    // rebuild this meal, but keep locked foods inside it
    const oldMeal = plan.meals[mi];
    const newMeal = tryBuildDay({ mealCount: 1 }).meals[0];

    // replace only unlocked foods
    const mergedItems = oldMeal.items.map((oldItem, fi) => {
      if (LOCKS.foods[oldItem._uid]) {
        return oldItem; // keep locked
      } else {
        return newMeal.items[fi % newMeal.items.length]; // pull from new pool
      }
    });

    newMeal._uid = mealUid;
    newMeal.items = mergedItems;
    plan.meals[mi] = newMeal;

    recalcMeal(plan.meals[mi]);
    recalcTotals(plan);
    renderResult(plan);

  } else if (type === "day") {
    // rebuild entire day but preserve locked meals/foods
    const newDay = tryBuildDay({ mealCount: plan.mealCount });

    plan.meals = plan.meals.map((oldMeal, mi) => {
      if (LOCKS.meals[oldMeal._uid]) {
        return oldMeal; // keep entire meal
      }
      // else, rebuild meal, but carry locked foods
      const newMeal = newDay.meals[mi];
      const mergedItems = oldMeal.items.map((oldItem, fi) => {
        if (LOCKS.foods[oldItem._uid]) {
          return oldItem;
        } else {
          return newMeal.items[fi % newMeal.items.length];
        }
      });
      newMeal._uid = oldMeal._uid;
      newMeal.items = mergedItems;
      return newMeal;
    });

    recalcTotals(plan);
    renderResult(plan);
  }
}

// ------------------------------
// Helpers used above
function mealTotalsFor(meal) {
  return meal.items.reduce((acc, it) => ({ cal: acc.cal + (it.kcal || 0), p: acc.p + (it.p || 0), c: acc.c + (it.c || 0), f: acc.f + (it.f || 0) }), { cal: 0, p: 0, c: 0, f: 0 });
}

function countShakesInPlan(plan) {
  return plan.meals.reduce((s,m)=>s + m.items.reduce((a,i)=>a + (isShake(i) ? 1 : 0),0), 0);
}
function countShakesInMeal(meal) {
  return meal.items.reduce((a,i)=>a + (isShake(i) ? 1 : 0),0);
}

// ------------------------------
// Find helpers (same semantics)
function findItemLocationByUid(itemUid) {
  const plan = window._lastPlan && window._lastPlan.plan ? window._lastPlan.plan : window._lastPlan;
  if (!plan) return null;
  for (let mi = 0; mi < plan.meals.length; mi++) {
    const meal = plan.meals[mi];
    for (let fi = 0; fi < meal.items.length; fi++) {
      if (meal.items[fi]._uid === itemUid) return { mi, fi, item: meal.items[fi] };
    }
  }
  return null;
}
function findMealIndexByUid(mealUid) {
  const plan = window._lastPlan && window._lastPlan.plan ? window._lastPlan.plan : window._lastPlan;
  if (!plan) return -1;
  for (let mi = 0; mi < plan.meals.length; mi++) {
    if (plan.meals[mi]._uid === mealUid) return mi;
  }
  return -1;
}

// ------------------------------
// moveItemToMeal helper used by drag/drop
function moveItemToMeal(itemId, targetMealId) {
  const plan = window._lastPlan;
  let movingItem = null;

  // Remove from old meal
  plan.meals.forEach((meal) => {
    const idx = meal.items.findIndex((it) => it._uid === itemId);
    if (idx !== -1) {
      movingItem = meal.items.splice(idx, 1)[0];
      recalcMeal(meal);
    }
  });

  // Add to target meal
  const targetMeal = plan.meals.find((m) => m._uid === targetMealId);
  if (movingItem && targetMeal) {
    // avoid repeating same food inside meal - if it already exists, we still allow adding (user dragged), but for generator we avoid repeats
    targetMeal.items.push(movingItem);
    recalcMeal(targetMeal);
  }

  recalcTotals(plan);
  renderResult(plan);
}

// ------------------------------
// Recalc helpers
function recalcMeal(meal) {
  meal.subtotal = { kcal: 0, p: 0, c: 0, f: 0 };
  meal.items.forEach((it) => {
    // ensure base values present
    it.base_kcal = it.base_kcal !== undefined ? it.base_kcal : Number(it.kcal || 0) / (it.qty || 1);
    it.base_p = it.base_p !== undefined ? it.base_p : Number(it.p || 0) / (it.qty || 1);
    it.base_c = it.base_c !== undefined ? it.base_c : Number(it.c || 0) / (it.qty || 1);
    it.base_f = it.base_f !== undefined ? it.base_f : Number(it.f || 0) / (it.qty || 1);
    // recalc current macros from qty
    it.kcal = (it.base_kcal || 0) * (it.qty || 1);
    it.p = (it.base_p || 0) * (it.qty || 1);
    it.c = (it.base_c || 0) * (it.qty || 1);
    it.f = (it.base_f || 0) * (it.qty || 1);
    meal.subtotal.kcal += it.kcal;
    meal.subtotal.p += it.p;
    meal.subtotal.c += it.c;
    meal.subtotal.f += it.f;
  });
}

function recalcTotals(plan) {
  plan.totals = { kcal: 0, p: 0, c: 0, f: 0 };
  plan.meals.forEach((meal) => {
    // ensure meal subtotal computed
    recalcMeal(meal);
    plan.totals.kcal += meal.subtotal.kcal;
    plan.totals.p += meal.subtotal.p;
    plan.totals.c += meal.subtotal.c;
    plan.totals.f += meal.subtotal.f;
  });
}

// ------------------------------
// CSV Export (same as before)
function exportCSV() {
  const plan = window._lastPlan;
  if (!plan) return;
  const rows = [['Meal','Food','Qty','Calories','Protein(g)','Carbs(g)','Fat(g)']];
  plan.meals.forEach((meal, mi) => {
    meal.items.forEach(it => {
      rows.push([
        `Meal ${mi+1}`,
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
    plan.totals.kcal.toFixed(0),
    plan.totals.p.toFixed(1),
    plan.totals.c.toFixed(1),
    plan.totals.f.toFixed(1)
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
