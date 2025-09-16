// ------------------------------
// Rendering
// ------------------------------
function renderResult(plan) {
  const container = document.getElementById("results");
  container.innerHTML = "";

  plan.meals.forEach((meal) => {
    const mealDiv = document.createElement("div");
    mealDiv.className = "meal";
    mealDiv.id = meal.id;

    const header = document.createElement("div");
    header.className = "meal-header";
    header.innerHTML = `
      <strong>${meal.slot.toUpperCase()}</strong>
      <button class="lock" data-id="${meal.id}">🔒</button>
      <button class="regen" data-id="${meal.id}">♻️</button>
    `;

    const itemsDiv = document.createElement("div");
    itemsDiv.className = "meal-items";
    meal.items.forEach((it) => {
      const itDiv = document.createElement("div");
      itDiv.className = "item";
      itDiv.draggable = true;
      itDiv.dataset.id = it._uid;
      itDiv.innerHTML = `
        ${it.name} (${it.qty}${it.unit}) - ${it.kcal.toFixed(0)} kcal
        <button class="lock" data-id="${it._uid}">🔒</button>
        <button class="regen" data-id="${it._uid}">♻️</button>
      `;
      itemsDiv.appendChild(itDiv);
    });

    const subtotalDiv = document.createElement("div");
    subtotalDiv.innerHTML = `
      <em>Subtotal: ${meal.subtotal.kcal.toFixed(0)} kcal, 
      P ${meal.subtotal.p.toFixed(1)}, 
      C ${meal.subtotal.c.toFixed(1)}, 
      F ${meal.subtotal.f.toFixed(1)}</em>
    `;

    mealDiv.appendChild(header);
    mealDiv.appendChild(itemsDiv);
    mealDiv.appendChild(subtotalDiv);

    container.appendChild(mealDiv);
  });

  const totalsDiv = document.createElement("div");
  totalsDiv.innerHTML = `
    <h3>Daily Totals</h3>
    ${plan.totals.kcal.toFixed(0)} kcal — 
    P ${plan.totals.p.toFixed(1)}, 
    C ${plan.totals.c.toFixed(1)}, 
    F ${plan.totals.f.toFixed(1)}
  `;
  container.appendChild(totalsDiv);

  attachUIHandlers();
}

// ------------------------------
// UI Handlers
// ------------------------------
function attachUIHandlers() {
  document.querySelectorAll(".lock").forEach((btn) => {
    btn.onclick = (e) => {
      const id = e.target.dataset.id;
      if (window.LOCKS.foods[id]) {
        delete window.LOCKS.foods[id];
      } else if (id.startsWith("i")) {
        window.LOCKS.foods[id] = true;
      } else if (id.startsWith("m")) {
        window.LOCKS.meals[id] = true;
      }
      e.target.classList.toggle("locked");
    };
  });

  document.querySelectorAll(".regen").forEach((btn) => {
    btn.onclick = (e) => {
      const id = e.target.dataset.id;
      if (id.startsWith("i")) {
        regenItem(id);
      } else if (id.startsWith("m")) {
        regenMeal(id);
      }
    };
  });
}

function regenItem(itemId) {
  const plan = window._lastPlan;
  plan.meals.forEach((meal) => {
    const idx = meal.items.findIndex((it) => it._uid === itemId);
    if (idx !== -1) {
      meal.items[idx] = pickPortion(sample(window.FOODS));
    }
  });
  renderResult(plan);
}

function regenMeal(mealId) {
  const plan = window._lastPlan;
  const mealIdx = plan.meals.findIndex((m) => m.id === mealId);
  if (mealIdx !== -1) {
    const slot = plan.meals[mealIdx].slot;
    const { items, subtotal } = buildMeal(window._lastOpts, slot, plan.totals, []);
    plan.meals[mealIdx].items = items;
    plan.meals[mealIdx].subtotal = subtotal;
  }
  renderResult(plan);
}
