import { Planner } from './planner.js';

export function bindUI() {
  const generateBtn = document.getElementById('generateBtn');
  const exportBtn = document.getElementById('exportBtn');

  const getTargets = () => ({
    kcal: Number(document.getElementById('calTarget').value),
    p: Number(document.getElementById('pTarget').value),
    c: Number(document.getElementById('cTarget').value),
    f: Number(document.getElementById('fTarget').value)
  });

  generateBtn.addEventListener('click', () => {
    const mealCountInput = document.getElementById('mealCount').value;
    const mealCount = mealCountInput === 'optimal' ? 4 : Number(mealCountInput);

    const planner = new Planner(getTargets(), 
      Number(document.getElementById('maxShakes').value),
      Number(document.getElementById('maxRepeats').value)
    );

    const meals = planner.generateMeals(mealCount);

    for (const [mealType, foods] of Object.entries(meals)) {
      const el = document.getElementById(mealType);
      if (!el) continue;
      el.innerHTML = foods.map(f => `<div>${f.label} (${f.kcal} kcal)</div>`).join('');
    }

    window.currentPlanner = planner;
  });

  exportBtn.addEventListener('click', () => {
    if (!window.currentPlanner) return;
    const csv = window.currentPlanner.exportCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meal-plan.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
}
