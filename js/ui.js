// ui.js
// Rendering and UI interactions (depends on mealBuilder.js functions and global utilities)

// Note: expects window._lastPlan, FOODS, LOCKS, pickPortion, buildMeal, tryBuildDay to exist

// ------------------------------
// Ensure LOCKS is initialized
if (!window.LOCKS) {
  window.LOCKS = { meals: {}, foods: {} };
}

// ------------------------------
// Helper computeTotals
function computeTotals(plan) {
  return plan.meals.reduce((acc, meal) => {
    const mcal = meal.items.reduce((s, f) => s + (f.kcal || 0), 0);
    const mp = meal.items.reduce((s, f) => s + (f.p || 0), 0);
    const mc = meal.items.reduce((s, f) => s + (f.c || 0), 0);
    const mf = meal.items.reduce((s, f) => s + (f.f || 0), 0);
    return { kcal: acc.kcal + mcal, p: acc.p + mp, c: acc.c + mc, f: acc.f + mf };
  }, { kcal: 0, p: 0, c: 0, f: 0 });
}

// ------------------------------
// Sync locks
function syncLocks(plan) {
  plan.meals.forEach(meal => {
    if (!LOCKS.meals[meal._uid]) LOCKS.meals[meal._uid] = false;
    meal.items.forEach(it => {
      if (!LOCKS.foods[it._uid]) LOCKS.foods[it._uid] = false;
    });
  });
}

// ------------------------------
// Render
function renderResult(plan) {
  if (!plan) return;
  syncLocks(plan);

  plan.meals.forEach(recalcMeal);
  recalcTotals(plan);

  const out = document.getElementById('result');
  out.innerHTML = '';

  // Ensure each meal/item has stable _uid and base macros
  plan.meals = plan.meals.map(m => {
    if (!m._uid) m._uid = uid('m');
    m.items = m.items.map(it => {
      if (!it._uid) it._uid = uid('i');
      it.base_kcal = it.base_kcal !== undefined ? it.base_kcal : (Number(it.kcal || 0) / (it.qty || 1));
      it.base_p = it.base_p !== undefined ? it.base_p : (Number(it.p || 0) / (it.qty || 1));
      it.base_c = it.base_c !== undefined ? it.base_c : (Number(it.c || 0) / (it.qty || 1));
      it.base_f = it.base_f !== undefined ? it.base_f : (Number(it.f || 0) / (it.qty || 1));
      return it;
    });
    return m;
  });

  window._lastPlan = plan;

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

      let qtyStep = it.portion_scalable !== undefined && it.portion_scalable !== null ? Number(it.portion_scalable) : null;
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
          <button class="icon-btn lock ${foodLocked ? 'active' : ''}" data-type="food" data-mi="${mi}" data-fi="${fi}" data-item-uid="${it._uid}" title="Lock food">
            ${foodLocked ? '🔒' : '🔓'}
          </button>
          <button class="icon-btn regen" data-type="food" data-mi="${mi}" data-fi="${fi}" data-item-uid="${it._uid}" title="Regenerate food">🔁</button>
        </td>
      `;

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

        if (LOCKS.foods[it._uid]) {
          e.target.value = it.qty;
          return;
        }

        it.qty = final;
        it.kcal = (it.base_kcal || 0) * it.qty;
        it.p = (it.base_p || 0) * it.qty;
        it.c = (it.base_c || 0) * it.qty;
        it.f = (it.base_f || 0) * it.qty;

        tr.querySelector('.td-kcal').textContent = it.kcal.toFixed(0);
        tr.querySelector('.td-p').textContent = it.p.toFixed(1);
        tr.querySelector('.td-c').textContent = it.c.toFixed(1);
        tr.querySelector('.td-f').textContent = it.f.toFixed(1);

        recalcMeal(meal);
        recalcTotals(window._lastPlan);
        renderResult(window._lastPlan);
      });

      tbody.appendChild(tr);
    });

    // meal subtotal row
    const subtotalRow = document.createElement('tr');
    subtotalRow.className = 'meal-subtotal totals-row';
    subtotalRow.innerHTML = `
      <td style="font-weight:700">Meal subtotal</td>
      <td></td>
      <td>${(meal.subtotal.kcal || 0).toFixed(0)}</td>
      <td>${(meal.subtotal.p || 0).toFixed(1)}</td>
      <td>${(meal.subtotal.c || 0).toFixed(1)}</td>
      <td>${(meal.subtotal.f || 0).toFixed(1)}</td>
      <td></td>
    `;
    tbody.appendChild(subtotalRow);

    mealCard.appendChild(table);
    out.appendChild(mealCard);
  });

  // Grand totals
  const grand = { kcal: 0, p: 0, c: 0, f: 0 };
  plan.meals.forEach(m => {
    grand.kcal += m.subtotal.kcal || 0;
    grand.p += m.subtotal.p || 0;
    grand.c += m.subtotal.c || 0;
    grand.f += m.subtotal.f || 0;
  });

  const grandRow = document.createElement('div');
  grandRow.className = 'grand-totals';
  grandRow.innerHTML = `
    <h3>Day totals — kcal: ${grand.kcal.toFixed(0)}, P: ${grand.p.toFixed(1)}, C: ${grand.c.toFixed(1)}, F: ${grand.f.toFixed(1)}</h3>
    <button id="regen-day-btn">Regenerate Day</button>
  `;
  out.appendChild(grandRow);

  // ------------------------------
  // Event listeners
  document.querySelectorAll('.icon-btn.lock').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.type;
      if (type === 'meal') {
        const mealUid = btn.dataset.mealUid;
        LOCKS.meals[mealUid] = !LOCKS.meals[mealUid];
      } else if (type === 'food') {
        const itemUid = btn.dataset.itemUid;
        LOCKS.foods[itemUid] = !LOCKS.foods[itemUid];
      }
      renderResult(window._lastPlan);
    };
  });

  document.querySelectorAll('.icon-btn.regen').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.type;
      if (type === 'meal') {
        regenMeal(btn.dataset.mealUid);
      } else if (type === 'food') {
        regenFood(btn.dataset.mealUid, btn.dataset.itemUid);
      }
    };
  });

  const regenDayBtn = document.getElementById('regen-day-btn');
  if (regenDayBtn) {
    regenDayBtn.onclick = () => {
      const opts = { ...window._lastOpts, seededLocked: LOCKS };
      const newPlan = tryBuildDay(opts);
      if (newPlan) {
        newPlan.meals.forEach(recalcMeal);
        recalcTotals(newPlan);
        window._lastPlan = newPlan;
        renderResult(newPlan);
      }
    };
  }
}

// ------------------------------
// Helper recalc
function recalcMeal(meal) {
  const subtotal = { kcal: 0, p: 0, c: 0, f: 0 };
  meal.items.forEach(it => {
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
// Regen helpers
function regenMeal(mealId) {
  if (!window._lastPlan) return;
  const opts = { ...window._lastOpts };
  const newLocks = JSON.parse(JSON.stringify(LOCKS));

  // Lock all other meals
  Object.keys(newLocks.meals).forEach(mid => {
    if (mid !== mealId) newLocks.meals[mid] = true;
  });

  opts.seededLocked = newLocks;
  const plan = tryBuildDay(opts);
  if (plan) {
    plan.meals.forEach(recalcMeal);
    recalcTotals(plan);
    window._lastPlan = plan;
    renderResult(plan);
  }
}

function regenFood(mealId, itemId) {
  if (!window._lastPlan) return;
  const opts = { ...window._lastOpts };
  const newLocks = JSON.parse(JSON.stringify(LOCKS));

  // Lock all foods except this one
  Object.keys(newLocks.foods).forEach(fid => {
    if (fid !== itemId) newLocks.foods[fid] = true;
  });
  opts.seededLocked = newLocks;

  const plan = tryBuildDay(opts);
  if (plan) {
    plan.meals.forEach(recalcMeal);
    recalcTotals(plan);
    window._lastPlan = plan;
    renderResult(plan);
  }
}
