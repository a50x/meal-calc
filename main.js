import { loadFoods } from './foods.js';
import { tryBuildDay } from './planner.js';
import { UI } from './ui.js';

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadFoods();

    const ui = new UI({ meals: {} }); // temporary empty
    ui.setupCSVExport();

    document.getElementById('generateBtn').addEventListener('click', () => {
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

      const mealCount = document.getElementById('mealCount').value === 'optimal'
        ? 3 + Math.floor(Math.random() * 3)
        : Number(document.getElementById('mealCount').value);

      const plan = tryBuildDay(mealCount, targets);

      if (plan) {
        ui.planner.meals = plan;
        ui.renderMeals();
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
