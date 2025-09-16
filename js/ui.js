// ui.js — rendering + interactivity

function renderResult(plan) {
  window._lastPlan = plan;
  const container = document.getElementById('result');
  container.innerHTML = '';

  plan.meals.forEach((meal, mi) => {
    const mealDiv = document.createElement('div');
    mealDiv.className = 'meal';
    mealDiv.innerHTML = `<h3>${meal.slot.toUpperCase()}
      <button class="lock-btn" data-meal="${meal.id}">${LOCKS.meals[meal.id]?'🔒':'🔓'}</button>
      <button class="regen-btn" data-meal="${meal.id}">♻️</button>
    </h3>`;

    const list = document.createElement('ul');
    meal.items.forEach(it => {
      const li = document.createElement('li');
      li.draggable = true;
      li.dataset.uid = it._uid;
      li.innerHTML = `${it.name} x${it.qty} (${it.kcal.toFixed(0)}kcal P${it.p.toFixed(0)} C${it.c.toFixed(0)} F${it.f.toFixed(0)})
        <button class="lock-btn" data-item="${it._uid}">${LOCKS.foods[it._uid]?'🔒':'🔓'}</button>
        <button class="regen-btn" data-item="${it._uid}">♻️</button>`;
      list.appendChild(li);
    });
    mealDiv.appendChild(list);
    container.appendChild(mealDiv);
  });

  const totalsDiv = document.createElement('div');
  totalsDiv.className = 'totals';
  totalsDiv.innerHTML = `<h3>Totals</h3>
    Kcal ${plan.totals.kcal.toFixed(0)},
    P ${plan.totals.p.toFixed(0)},
    C ${plan.totals.c.toFixed(0)},
    F ${plan.totals.f.toFixed(0)}`;
  container.appendChild(totalsDiv);

  attachUIHandlers();
}

function attachUIHandlers() {
  document.querySelectorAll('.lock-btn').forEach(btn => {
    btn.onclick = onLockToggle;
  });
  document.querySelectorAll('.regen-btn').forEach(btn => {
    btn.onclick = onRegenClicked;
  });
}

// lock toggle
function onLockToggle(e) {
  const mealId = e.target.dataset.meal;
  const itemId = e.target.dataset.item;
  if (mealId) LOCKS.meals[mealId] = !LOCKS.meals[mealId];
  if (itemId) LOCKS.foods[itemId] = !LOCKS.foods[itemId];
  renderResult(window._lastPlan);
}

// regen
function onRegenClicked(e) {
  const mealId = e.target.dataset.meal;
  const itemId = e.target.dataset.item;
  const plan = window._lastPlan;
  if (!plan) return;

  if (mealId) {
    const mealIdx = plan.meals.findIndex(m => m.id===mealId);
    if (mealIdx>=0) {
      const slot = plan.meals[mealIdx].slot;
      plan.meals[mealIdx] = buildMeal(slot, mealIdx, plan.meals.length,
        { kcalMin:1800, kcalMax:2400, kcalTarget:2100, proteinMin:120 },
        { mealKcalMax:900, mealSizeMax:6, shakesPerMealMax:2, dayKcalMax:2500, dayCarbMax:300, dayFatMax:90 },
        []
      );
    }
  }
  if (itemId) {
    for (let meal of plan.meals) {
      const idx = meal.items.findIndex(it => it._uid===itemId);
      if (idx>=0) {
        meal.items[idx] = pickPortion(sample(FOODS));
      }
    }
  }
  renderResult(plan);
}
