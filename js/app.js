import { loadFoods } from './foods.js';
import { tryBuildDay } from './planner.js';
import { UI } from './ui.js';

window.addEventListener('DOMContentLoaded', async () => {
  await loadFoods();
  const planner = tryBuildDay(4, {
    calMin: 2200, calMax: 2400,
    pMin: 180, pMax: 210,
    cMin: 190, cMax: 242,
    fMin: 57, fMax: 74
  }, 2, 2);

  const ui = new UI(planner);
  ui.renderMeals();

  document.getElementById('generateBtn').addEventListener('click', () => {
    planner.generateMeals();
    ui.renderMeals();
  });

  document.getElementById('exportBtn').addEventListener('click', () => ui.setupCSVExport());
});
