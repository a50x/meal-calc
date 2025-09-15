// main.js
import { loadFoods } from './foods.js';
import { tryBuildDay } from './mealBuilder.js';
import { renderResult } from './ui.js';
import { exportCSV } from './ui.js'; // CSV export lives in ui.js

// Collect target macros/ranges directly from UI inputs
function collectTargetsFromUI() {
  return {
    calMin: Number(document.getElementById('calTarget').value) - Number(document.getElementById('calRange').value),
    calMax: Number(document.getElementById('calTarget').value) + Number(document.getElementById('calRange').value),
    pMin: Number(document.getElementById('pTarget').value) - Number(document.getElementById('pRange').value),
    pMax: Number(document.getElementById('pTarget').value) + Number(document.getElementById('pRange').value),
    cMin: Number(document.getElementById('cTarget').value) - Number(document.getElementById('cRange').value),
    cMax: Number(document.getElementById('cTarget').value) + Number(document.getElementById('cRange').value),
    fMin: Number(document.getElementById('fTarget').value) - Number(document.getElementById('fRange').value),
    fMax: Number(document.getElementById('fTarget').value) + Number(document.getElementById('fRange').value)
  };
}

function generateDay() {
  const mealCountSel = document.getElementById('mealCount').value;
  let mealCount;
  if (mealCountSel === 'optimal') {
    // pick random between 3–5 meals if optimal
    mealCount = Math.floor(Math.random() * 3) + 3;
  } else {
    mealCount = Number(mealCountSel);
  }

  const targets = collectTargetsFromUI();
  const maxShakes = Number(document.getElementById('maxShakes').value || 0);
  const maxRepeats = Number(document.getElementById('maxRepeats').value || 1);

  const plan = tryBuildDay(mealCount, targets, maxShakes, maxRepeats);

  if (!plan) {
    document.getElementById('result').innerHTML =
      `<div class="card warn">❌ Could not generate plan. Try widening ranges or increasing repeats.</div>`;
    return;
  }

  renderResult(plan);
}

async function init() {
  try {
    await loadFoods();

    document.getElementById('generateBtn').addEventListener('click', generateDay);
    document.getElementById('exportCsvBtn').addEventListener('click', () => {
      if (window._lastPlan?.plan) {
        exportCSV(window._lastPlan.plan);
      }
    });

  } catch (err) {
    document.getElementById('result').innerHTML =
      `<div class="card warn">⚠️ Error loading foods.json</div>`;
    console.error(err);
  }
}

window.addEventListener('DOMContentLoaded', init);
