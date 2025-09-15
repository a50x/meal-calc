import { pickPortion, sample } from "./foods.js";
import { tryBuildDay } from "./mealBuilder.js";

let LOCKS = { foods: {}, meals: {} };
let PLAN = null;

// ---------------------------
// Rendering
export function renderResult(plan) {
  PLAN = plan;
  const resultDiv = document.getElementById("result");
  if (!plan) {
    resultDiv.innerHTML = "<div class='card warn'>No plan generated.</div>";
    return;
  }

  let html = "";
  plan.meals.forEach((meal, mi) => {
    const mealUid = `meal-${mi}`;
    const totals = mealTotals(meal);

    html += `<div class="card meal-block" data-mi="${mi}" data-meal-uid="${mealUid}">
      <div class="meal-header">
        <h3>Meal ${mi + 1}</h3>
        <div>
          <button class="regen-btn" data-type="meal" data-mi="${mi}" onclick="onRegenClicked(event)">🔁</button>
          <button class="lock-btn ${LOCKS.meals[mealUid] ? "active" : ""}" onclick="toggleLockMeal('${mealUid}')">${LOCKS.meals[mealUid] ? "🔒" : "🔓"}</button>
        </div>
      </div>
      <table class="food-table" data-mi="${mi}">
        <thead>
          <tr>
            <th>Food</th><th>kcal</th><th>P</th><th>C</th><th>F</th><th></th>
          </tr>
        </thead>
        <tbody>`;

    meal.items.forEach((it, fi) => {
      html += `<tr class="food-row" draggable="true" data-uid="${it._uid}" data-mi="${mi}">
        <td>${it.label}</td>
        <td>${it.kcal.toFixed(0)}</td>
        <td>${it.p.toFixed(1)}</td>
        <td>${it.c.toFixed(1)}</td>
        <td>${it.f.toFixed(1)}</td>
        <td>
          <button class="regen-btn" data-type="food" data-item-uid="${it._uid}" onclick="onRegenClicked(event)">🔁</button>
          <button class="lock-btn ${LOCKS.foods[it._uid] ? "active" : ""}" onclick="toggleLockFood('${it._uid}')">${LOCKS.foods[it._uid] ? "🔒" : "🔓"}</button>
        </td>
      </tr>`;
    });

    html += `</tbody>
      <tfoot>
        <tr class="totals-row">
          <td>Meal total</td>
          <td>${totals.kcal.toFixed(0)}</td>
          <td>${totals.p.toFixed(1)}</td>
          <td>${totals.c.toFixed(1)}</td>
          <td>${totals.f.toFixed(1)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
    </div>`;
  });

  // Day totals
  const dayTotals = planTotals(plan);
  html += `<div class="card">
    <h3>Day Totals</h3>
    <table>
      <tr class="totals-row">
        <td>Calories</td><td>${dayTotals.kcal.toFixed(0)}</td>
        <td>Protein</td><td>${dayTotals.p.toFixed(1)}</td>
        <td>Carbs</td><td>${dayTotals.c.toFixed(1)}</td>
        <td>Fat</td><td>${dayTotals.f.toFixed(1)}</td>
      </tr>
    </table>
  </div>`;

  resultDiv.innerHTML = html;
  enableDragAndDrop();
}

// ---------------------------
// Totals helpers
function mealTotals(meal) {
  return meal.items.reduce(
    (acc, it) => {
      acc.kcal += it.kcal;
      acc.p += it.p;
      acc.c += it.c;
      acc.f += it.f;
      return acc;
    },
    { kcal: 0, p: 0, c: 0, f: 0 }
  );
}

function planTotals(plan) {
  return plan.meals.reduce(
    (acc, meal) => {
      const t = mealTotals(meal);
      acc.kcal += t.kcal;
      acc.p += t.p;
      acc.c += t.c;
      acc.f += t.f;
      return acc;
    },
    { kcal: 0, p: 0, c: 0, f: 0 }
  );
}

// ---------------------------
// Locks
window.toggleLockFood = function (uid) {
  LOCKS.foods[uid] = !LOCKS.foods[uid];
  renderResult(PLAN);
};

window.toggleLockMeal = function (mealUid) {
  LOCKS.meals[mealUid] = !LOCKS.meals[mealUid];
  renderResult(PLAN);
};

// ---------------------------
// Regen
window.onRegenClicked = function (e) {
  const btn = e.currentTarget;
  const type = btn.dataset.type;
  if (type === "meal") {
    const mi = Number(btn.dataset.mi);
    PLAN.meals[mi] = tryBuildDay(1, {}, 0, 1).meals[0];
  } else if (type === "food") {
    const uid = btn.dataset.itemUid;
    for (const meal of PLAN.meals) {
      const idx = meal.items.findIndex((x) => x._uid === uid);
      if (idx >= 0) {
        meal.items[idx] = sample(meal.items); // naive regen placeholder
        break;
      }
    }
  }
  renderResult(PLAN);
};

// ---------------------------
// Drag & Drop
function enableDragAndDrop() {
  const rows = document.querySelectorAll(".food-row");
  let dragged = null;

  rows.forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      dragged = row;
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", (e) => {
      row.classList.remove("dragging");
      dragged = null;
    });
  });

  const tables = document.querySelectorAll(".food-table tbody");
  tables.forEach((tbody) => {
    tbody.addEventListener("dragover", (e) => {
      e.preventDefault();
      tbody.classList.add("drag-over");
    });
    tbody.addEventListener("dragleave", () => {
      tbody.classList.remove("drag-over");
    });
    tbody.addEventListener("drop", (e) => {
      e.preventDefault();
      tbody.classList.remove("drag-over");
      if (dragged) {
        const oldMi = Number(dragged.dataset.mi);
        const uid = dragged.dataset.uid;
        const newMi = Number(tbody.parentElement.dataset.mi);

        if (oldMi !== newMi) {
          const oldMeal = PLAN.meals[oldMi];
          const idx = oldMeal.items.findIndex((x) => x._uid === uid);
          const [item] = oldMeal.items.splice(idx, 1);
          PLAN.meals[newMi].items.push(item);
          renderResult(PLAN);
        }
      }
    });
  });
}
