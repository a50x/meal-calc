// ------------------------------
// Rendering
// ------------------------------
function renderResult(plan) {
  const container = document.getElementById("result");
  container.innerHTML = "";

  plan.meals.forEach((meal) => {
    const card = document.createElement("div");
    card.className = "card meal";
    card.dataset.id = meal.id;

    // Header
    const header = document.createElement("div");
    header.className = "meal-header";
    header.innerHTML = `
      <h2>${meal.slot.toUpperCase()}</h2>
      <div>
        <button class="lock-btn ${window.LOCKS.meals[meal.id] ? "active" : ""}" data-id="${meal.id}">🔒</button>
        <button class="regen-btn" data-id="${meal.id}">🔁</button>
      </div>
    `;
    card.appendChild(header);

    // Table
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th>Food</th><th>Qty</th><th>kcal</th><th>P</th><th>C</th><th>F</th><th></th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    meal.items.forEach((it) => {
      const row = document.createElement("tr");
      row.className = "food-row";
      row.dataset.id = it._uid;
      row.draggable = true;
      row.innerHTML = `
        <td>${it.name}</td>
        <td>${it.qty}${it.unit || ""}</td>
        <td>${it.kcal.toFixed(0)}</td>
        <td>${it.p.toFixed(1)}</td>
        <td>${it.c.toFixed(1)}</td>
        <td>${it.f.toFixed(1)}</td>
        <td>
          <button class="lock-btn ${window.LOCKS.foods[it._uid] ? "active" : ""}" data-id="${it._uid}">🔒</button>
          <button class="regen-btn" data-id="${it._uid}">🔁</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    // Totals row
    const totalRow = document.createElement("tr");
    totalRow.className = "totals-row";
    totalRow.innerHTML = `
      <td><em>Meal total</em></td>
      <td></td>
      <td>${meal.subtotal.kcal.toFixed(0)}</td>
      <td>${meal.subtotal.p.toFixed(1)}</td>
      <td>${meal.subtotal.c.toFixed(1)}</td>
      <td>${meal.subtotal.f.toFixed(1)}</td>
      <td></td>
    `;
    tbody.appendChild(totalRow);

    table.appendChild(tbody);
    card.appendChild(table);
    container.appendChild(card);
  });

  // Daily totals
  const totalsCard = document.createElement("div");
  totalsCard.className = "card";
  totalsCard.innerHTML = `
    <h2>Daily Totals</h2>
    <div class="pill">kcal: ${plan.totals.kcal.toFixed(0)}</div>
    <div class="pill">P: ${plan.totals.p.toFixed(1)} g</div>
    <div class="pill">C: ${plan.totals.c.toFixed(1)} g</div>
    <div class="pill">F: ${plan.totals.f.toFixed(1)} g</div>
  `;
  container.appendChild(totalsCard);

  attachUIHandlers();
}

// ------------------------------
// UI Handlers
// ------------------------------
function attachUIHandlers() {
  // Lock buttons
  document.querySelectorAll(".lock-btn").forEach((btn) => {
    btn.onclick = (e) => {
      const id = e.target.dataset.id;
      if (id.startsWith("i")) {
        window.LOCKS.foods[id] = !window.LOCKS.foods[id];
      } else if (id.startsWith("m")) {
        window.LOCKS.meals[id] = !window.LOCKS.meals[id];
      }
      renderResult(window._lastPlan);
    };
  });

  // Regen buttons
  document.querySelectorAll(".regen-btn").forEach((btn) => {
    btn.onclick = (e) => {
      const id = e.target.dataset.id;
      if (id.startsWith("i")) {
        regenItem(id);
      } else if (id.startsWith("m")) {
        regenMeal(id);
      }
    };
  });

  // Drag/drop
  document.querySelectorAll(".food-row").forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", row.dataset.id);
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
  });

  document.querySelectorAll(".meal table tbody").forEach((tbody) => {
    tbody.addEventListener("dragover", (e) => {
      e.preventDefault();
      tbody.classList.add("drag-over");
    });
    tbody.addEventListener("dragleave", () => tbody.classList.remove("drag-over"));
    tbody.addEventListener("drop", (e) => {
      e.preventDefault();
      tbody.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      moveItemToMeal(id, tbody.closest(".meal").dataset.id);
    });
  });
}

// ------------------------------
// Regen helpers
// ------------------------------
function regenItem(itemId) {
  const plan = window._lastPlan;
  plan.meals.forEach((meal) => {
    const idx = meal.items.findIndex((it) => it._uid === itemId);
    if (idx !== -1 && !window.LOCKS.foods[itemId]) {
      meal.items[idx] = pickPortion(sample(window.FOODS));
    }
  });
  recalcTotals(plan);
  renderResult(plan);
}

function regenMeal(mealId) {
  const plan = window._lastPlan;
  const mealIdx = plan.meals.findIndex((m) => m.id === mealId);
  if (mealIdx !== -1 && !window.LOCKS.meals[mealId]) {
    const slot = plan.meals[mealIdx].slot;
    const { items, subtotal } = buildMeal(window._lastOpts, slot, plan.totals, []);
    plan.meals[mealIdx].items = items;
    plan.meals[mealIdx].subtotal = subtotal;
  }
  recalcTotals(plan);
  renderResult(plan);
}

// ------------------------------
// Drag/drop helpers
// ------------------------------
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
  const targetMeal = plan.meals.find((m) => m.id === targetMealId);
  if (movingItem && targetMeal) {
    targetMeal.items.push(movingItem);
    recalcMeal(targetMeal);
  }

  recalcTotals(plan);
  renderResult(plan);
}

// ------------------------------
// Recalc helpers
// ------------------------------
function recalcMeal(meal) {
  meal.subtotal = { kcal: 0, p: 0, c: 0, f: 0 };
  meal.items.forEach((it) => {
    meal.subtotal.kcal += it.kcal;
    meal.subtotal.p += it.p;
    meal.subtotal.c += it.c;
    meal.subtotal.f += it.f;
  });
}

function recalcTotals(plan) {
  plan.totals = { kcal: 0, p: 0, c: 0, f: 0 };
  plan.meals.forEach((meal) => {
    plan.totals.kcal += meal.subtotal.kcal;
    plan.totals.p += meal.subtotal.p;
    plan.totals.c += meal.subtotal.c;
    plan.totals.f += meal.subtotal.f;
  });
}

// ------------------------------
// CSV Export
// ------------------------------
function exportCSV() {
  const plan = window._lastPlan;
  if (!plan) return;

  let csv = "Meal,Food,Qty,kcal,P,C,F\n";
  plan.meals.forEach((meal, mi) => {
    meal.items.forEach((it) => {
      csv += `${meal.slot},${it.name},${it.qty}${it.unit},${it.kcal.toFixed(0)},${it.p.toFixed(1)},${it.c.toFixed(1)},${it.f.toFixed(1)}\n`;
    });
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mealplan.csv";
  a.click();
  URL.revokeObjectURL(url);
}
