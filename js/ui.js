// ui.js — handles rendering, locks, regen, drag/drop, totals
import { tryBuildDay } from "./mealBuilder.js";
import { loadFoods } from "./foods.js";

let foods = [];
let currentPlan = {};
let lockedMeals = {};
let lockedFoods = {};

// --- Rendering ---
function renderResult(plan) {
  const container = document.getElementById("result");
  container.innerHTML = "";

  for (const [mealType, items] of Object.entries(plan)) {
    const mealDiv = document.createElement("div");
    mealDiv.className = "meal";
    mealDiv.innerHTML = `<h3>${mealType}</h3>`;

    const ul = document.createElement("ul");

    items.forEach(item => {
      const li = document.createElement("li");
      li.textContent = `${item.name} (${item.qty} ${item.unit})`;

      // Lock food button
      const lockBtn = document.createElement("button");
      lockBtn.textContent = lockedFoods[item.id] ? "🔒" : "🔓";
      lockBtn.onclick = () => {
        if (lockedFoods[item.id]) {
          delete lockedFoods[item.id];
        } else {
          lockedFoods[item.id] = true;
        }
        renderResult(currentPlan);
      };
      li.appendChild(lockBtn);

      // Regen food button
      const regenBtn = document.createElement("button");
      regenBtn.textContent = "🔄";
      regenBtn.onclick = () => {
        const pool = foods.filter(f => f.tags?.includes(mealType));
        const replacement = pool[Math.floor(Math.random() * pool.length)];
        const idx = currentPlan[mealType].findIndex(f => f.id === item.id);
        if (idx >= 0) currentPlan[mealType][idx] = replacement;
        renderResult(currentPlan);
      };
      li.appendChild(regenBtn);

      ul.appendChild(li);
    });

    // Lock meal button
    const lockMealBtn = document.createElement("button");
    lockMealBtn.textContent = lockedMeals[mealType] ? "Lock meal 🔒" : "Lock meal 🔓";
    lockMealBtn.onclick = () => {
      if (lockedMeals[mealType]) {
        delete lockedMeals[mealType];
      } else {
        lockedMeals[mealType] = true;
      }
      renderResult(currentPlan);
    };

    mealDiv.appendChild(ul);
    mealDiv.appendChild(lockMealBtn);
    container.appendChild(mealDiv);
  }
}

// --- CSV Export ---
function exportCSV(plan) {
  const rows = [["Meal", "Food", "Qty", "Unit"]];
  for (const [mealType, items] of Object.entries(plan)) {
    for (const item of items) {
      rows.push([mealType, item.name, item.qty, item.unit]);
    }
  }
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "meal-plan.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export { renderResult, exportCSV, loadFoods, tryBuildDay, foods, currentPlan, lockedMeals, lockedFoods };
