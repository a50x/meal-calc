// main.js
import { FOODS, loadFoods } from './js/foods.js'; // foods.json is in root, foods.js in /js/
import { tryBuildDay } from './js/planner.js';
import { bindUI } from './js/ui.js';
import { pickPortion, buildMealOrder, foodsForMealIndex } from './js/meals.js';
import { uid, rand, sample, isShake } from './js/utils.js';

window.addEventListener("DOMContentLoaded", async () => {
  try {
    // Load foods.json asynchronously
    const foods = await loadFoods();

    // Initialize UI bindings
    bindUI();

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

      // Generate meal plan using loaded foods
      const plan = tryBuildDay(foods, mealCount, targets);

      if (plan) {
        // Render meals in UI
        for (const [mealType, foods] of Object.entries(plan)) {
          const el = document.getElementById(mealType);
          if (!el) continue;
          el.innerHTML = foods
            .map(f => `<div>${f.label || f.name} (${f.kcal} kcal)</div>`)
            .join('');
        }

        // Store current plan for CSV export
        window.currentPlanner = {
          meals: plan,
          exportCSV: () => {
            let csv = "Meal,Food,Qty,Calories,Protein,Carbs,Fat\n";
            for (const [meal, items] of Object.entries(plan)) {
              for (const f of items) {
                csv += `${meal},${f.name},${f.qty},${f.kcal},${f.p},${f.c},${f.f}\n`;
              }
            }
            return csv;
          }
        };
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
