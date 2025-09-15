// app.js — Safe Foods Meal Generator (entry point)
import { loadFoods } from './foods.js';
import { tryBuildDay } from './planner.js';
import { renderResult } from './render.js';

window.addEventListener('DOMContentLoaded', async () => {
  await loadFoods();

  // Example bootstrapping: attach to button
  document.getElementById('generate').addEventListener('click', () => {
    const targets = {
      calMin: 2200, calMax: 2400,
      pMin: 180, pMax: 210,
      cMin: 190, cMax: 242,
      fMin: 57, fMax: 74
    };
    const plan = tryBuildDay(4, targets, 2, 2);
    if (plan) renderResult(plan);
    else document.getElementById('result').innerHTML =
      `<div class="card warn"><strong>No valid plan generated.</strong></div>`;
  });
});
