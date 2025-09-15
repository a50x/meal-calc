import { FOODS, loadFoods } from './foods.js'; // foods.json loader in root
import { Planner, tryBuildDay } from './js/planner.js';
import { bindUI } from './js/ui.js';
import { pickPortion, buildMealOrder, foodsForMealIndex } from './js/meals.js';
import { uid, rand, sample, isShake } from './js/utils.js';

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadFoods?.(); // optional loader if FOODS need dynamic loading

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

      const plan = tryBuildDay(mealCount, targets);

      if (plan) {
        // Render meals in UI
        for (const [mealType, foods] of Object.entries(plan)) {
          const el = document.getElementById(mealType);
          if (!el) continue;
          el.innerHTML = foods.map(f => `<div>${f.label || f.name} (${f.kcal} kcal)</div>`).join('');
        }
        window.currentPlanner = { meals: plan, exportCSV: () => '' }; // placeholder for export
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
