// ui.js
import { pickPortion, sample, getFoods, isShake } from "./foods.js";
import { tryBuildDay } from "./mealBuilder.js";

export let LOCKS = { foods: {}, meals: {} };

// ---------------------------
// Rendering
export function renderResult(plan) {
  const resultDiv = document.getElementById("result");
  if (!plan) {
    resultDiv.innerHTML = "<div class='card warn'>No plan generated.</div>";
    return;
  }

  window._lastPlan = { plan }; // keep global ref for CSV export

  let html = "";
  plan.meals.forEach((meal, mi) => {
    const mealUid = `meal-${mi}`;
    html += `<div class="meal-block card" data-mi="${mi}" data-meal-uid="${mealUid}">
      <h3>Meal ${mi + 1}
        <button class="regen-btn" data-type="meal" data-mi="${mi}">🔁</button>
        <button class="lock-btn" data-type="meal" data-uid="${mealUid}">
          ${LOCKS.meals[mealUid] ? "🔒" : "🔓"}
        </button>
      </h3>
      <ul>`;
    meal.items.forEach((it, fi) => {
      html += `<li data-uid="${it._uid}">
        ${it.label} (${it.kcal.toFixed(0)} kcal, P:${it.p.toFixed(1)} C:${it.c.toFixed(
        1
      )} F:${it.f.toFixed(1)})
        <button class="regen-btn" data-type="food" data-item-uid="${it._uid}" data-mi="${mi}">🔁</button>
        <button class="lock-btn" data-type="food" data-uid="${it._uid}">
          ${LOCKS.foods[it._uid] ? "🔒" : "🔓"}
        </button>
      </li>`;
    });
    html += `</ul></div>`;
  });

  resultDiv.innerHTML = html;

  // wire up buttons after rendering
  resultDiv.querySelectorAll(".regen-btn").forEach(btn =>
    btn.addEventListener("click", onRegenClicked)
  );
  resultDiv.querySelectorAll(".lock-btn").forEach(btn =>
    btn.addEventListener("click", onLockClicked)
  );
}

// ---------------------------
// Locking
function onLockClicked(e) {
  const btn = e.currentTarget;
  const type = btn.dataset.type;
  const uid = btn.dataset.uid;
  if (type === "food") {
    LOCKS.foods[uid] = !LOCKS.foods[uid];
  } else if (type === "meal") {
    LOCKS.meals[uid] = !LOCKS.meals[uid];
  }
  renderResult(window._lastPlan.plan);
}

// ---------------------------
// Regeneration
function onRegenClicked(e) {
  const btn = e.currentTarget;
  const type = btn.dataset.type;
  const plan = window._lastPlan?.plan;
  if (!plan) return;

  if (type === "food") {
    const itemUid = btn.dataset.itemUid;
    const mi = Number(btn.dataset.mi);
    if (LOCKS.foods[itemUid]) return;

    const meal = plan.meals[mi];
    const fi = meal.items.findIndex(x => x._uid === itemUid);
    if (fi < 0) return;

    const foods = getFoods();
    let newItem = null;
    for (let attempt = 0; attempt < 200; attempt++) {
      const candidate = pickPortion(sample(foods));
      if (candidate && candidate._uid !== itemUid) {
        newItem = candidate;
        break;
      }
    }
    if (newItem) {
      meal.items[fi] = newItem;
    }
  }

  if (type === "meal") {
    const mi = Number(btn.dataset.mi);
    const mealUid = `meal-${mi}`;
    if (LOCKS.meals[mealUid]) return;

    const foods = getFoods();
    const newMeal = { items: [] };
    const count = plan.meals[mi].items.length;
    for (let j = 0; j < count; j++) {
      newMeal.items.push(pickPortion(sample(foods)));
    }
    plan.meals[mi] = newMeal;
  }

  renderResult(plan);
}

// ---------------------------
// CSV Export
export function exportCSV(plan) {
  if (!plan) return;
  let csv = "Meal,Food,Qty,kcal,Protein,Carbs,Fat\n";
  plan.meals.forEach((meal, mi) => {
    meal.items.forEach(it => {
      csv += `${mi + 1},${it.name},${it.qty || 1},${it.kcal.toFixed(0)},${it.p.toFixed(
        1
      )},${it.c.toFixed(1)},${it.f.toFixed(1)}\n`;
    });
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `meal_plan.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
