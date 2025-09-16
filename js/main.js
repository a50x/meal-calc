// main.js — bootstrap

(async function(){
  await loadFoods();

  const plan = tryBuildDay(
    { kcalMin:1800, kcalMax:2400, kcalTarget:2100, proteinMin:120 },
    { mealKcalMax:900, mealSizeMax:6, shakesPerMealMax:2, dayKcalMax:2500, dayCarbMax:300, dayFatMax:90 },
    4
  );
  if (plan) renderResult(plan);
})();
