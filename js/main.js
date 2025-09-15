// main.js
import { loadFoods } from './foods.js';
import { tryBuildDay } from './mealBuilder.js';
import { renderResult } from './ui.js';

async function init() {
  try {
    await loadFoods();
    document.getElementById('generate').addEventListener('click', generateDay);
  } catch (err) {
    document.getElementById('result').innerHTML =
      `<div class="card warn">Error loading foods.json</div>`;
  }
}

function generateDay() {
  const mealCount = Number(document.getElementById('mealCount').value || 4);
  const targets = collectTargetsFromUI();
  const maxShakes = Number(document.getElementById('maxShakes').value || 0);
  const maxRepeats = Number(document.getElementById('maxRepeats').value || 1);

  const plan = tryBuildDay(mealCount, targets, maxShakes, maxRepeats);
  renderResult(plan);
}

window.addEventListener('DOMContentLoaded', init);
