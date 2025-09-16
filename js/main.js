// main.js — handles wiring & generate()
import { renderResult, exportCSV, loadFoods, tryBuildDay, foods, currentPlan } from "./ui.js";

async function generate() {
  const loaded = await loadFoods();
  foods.length = 0;
  foods.push(...loaded);

  const plan = tryBuildDay(foods);
  if (plan) {
    Object.assign(currentPlan, plan);
    renderResult(plan);
  } else {
    alert("Failed to generate meal plan.");
  }
}

document.getElementById("generate").addEventListener("click", generate);
document.getElementById("export").addEventListener("click", () => exportCSV(currentPlan));

window.addEventListener("DOMContentLoaded", generate);
