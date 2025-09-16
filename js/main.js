window.addEventListener("DOMContentLoaded", async () => {
  await loadFoods();

  document.getElementById("generateBtn").addEventListener("click", () => {
    generate();
  });

  document.getElementById("exportBtn").addEventListener("click", () => {
    exportCSV();
  });
});

function generate() {
  const cal = parseInt(document.getElementById("calTarget").value, 10);
  const calRange = parseInt(document.getElementById("calRange").value, 10);
  const p = parseInt(document.getElementById("pTarget").value, 10);
  const pRange = parseInt(document.getElementById("pRange").value, 10);
  const c = parseInt(document.getElementById("cTarget").value, 10);
  const cRange = parseInt(document.getElementById("cRange").value, 10);
  const f = parseInt(document.getElementById("fTarget").value, 10);
  const fRange = parseInt(document.getElementById("fRange").value, 10);

  let meals = document.getElementById("mealCount").value;
  if (meals === "optimal") meals = rand(3, 5);
  else meals = parseInt(meals, 10);

  const opts = {
    totalMeals: meals,
    totalKcalMin: cal - calRange,
    totalKcalMax: cal + calRange,
    totalProteinMin: p - pRange,
    totalCarbMax: c + cRange,
    totalFatMax: f + fRange,
    perMealKcalMax: Math.ceil((cal + calRange) / meals),
    perMealCarbMax: Math.ceil((c + cRange) / meals),
    perMealFatMax: Math.ceil((f + fRange) / meals),
    maxAttempts: 400,
  };

  window._lastOpts = opts;
  const plan = tryBuildDay(opts);
  if (plan) {
    window._lastPlan = plan;
    window._lastPlan.allItems = plan.meals.flatMap((m) => m.items);
    renderResult(plan);
  } else {
    document.getElementById("result").innerHTML = "<p>No valid plan found. Try widening ranges.</p>";
  }
}
