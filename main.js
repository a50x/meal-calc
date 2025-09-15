// main.js — entry point
import { FOODS, loadFoods } from './js/foods.js'; // foods.json loader
import { tryBuildDay } from './js/planner.js';
import { pickPortion, buildMealOrder, foodsForMealIndex } from './js/meals.js';
import { uid, rand, sample, isShake } from './js/utils.js';

// Simple UI binding function
function renderMealsUI(plan) {
  for (const [mealType, foods] of Object.entries(plan)) {
    const el = document.getElementById(mealType);
    if (!el) continue;
    el.innerHTML = foods.map(f => `<div>${f.label || f.name} (${f.kcal} kcal)</div>`).join('');
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadFoods(); // load foods.json into FOODS

    const generateBtn = document.getElementById('generateBtn');
    generateBtn.addEventListener('click', () => {
      const targets = {
        calMin: Number(document.getElementById('calTarget').value) - Number(document.getElementById('calRange').value),
        calMax: Number(document.getElementById('calTarget').value) + Number(document.getElementById('calRange').value),
        pMin: Number(document.getElementById('pTarget').value) - Number(document.getElementById('pRange').value),
        pMax: Number(document.getElementById('pTarget').value) + Number(document.getElementById('pRange').value),
        cMin: Number(document.getElementById('cTarget').value) - Number(document.getElementById('cRange').value),
        cMax: Number(document.getElementById('cTarget').value) + Number(document.getElementById('cRange').value),
        fMin: Number(document.getElementById('fTarget').value) - Number(document.getElementById('fRange').value),
        fMax: Number(document.getElementById('fTarget').value) + Number(document.getElementById('fRange').value)
      };

      const mealCountInput = document.getElementById('mealCount').value;
      const mealCount = mealCountInput === 'optimal'
        ? 3 + Math.floor(Math.random() * 3)
        : Number(mealCountInput);

      const plan = tryBuildDay(mealCount, targets, FOODS);

      if (plan) {
        renderMealsUI(plan);
        window.currentPlanner = { meals: plan }; // placeholder for export
      } else {
        document.getElementById('result').innerHTML =
          `<div class="card warn"><strong>No valid plan generated.</strong></div>`;
      }
    });

  } catch (err) {
    document.getElementById('result').innerHTML =
      `<div class="card warn"><strong>Error loading foods.json:</strong><br>${err}</div>`;
  }
});
