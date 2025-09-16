window.addEventListener("DOMContentLoaded", async () => {
  await loadFoods();

  document.getElementById("generateBtn").onclick = () => {
    const opts = {
      totalMeals: 4,
      totalKcalMin: 1800,
      totalKcalMax: 2500,
      totalProteinMin: 100,
      totalCarbMax: 300,
      totalFatMax: 90,
      perMealKcalMax: 700,
      perMealCarbMax: 100,
      perMealFatMax: 35,
      maxAttempts: 200,
    };

    window._lastOpts = opts;
    const plan = tryBuildDay(opts);
    if (plan) {
      window._lastPlan = plan;
      window._lastPlan.allItems = plan.meals.flatMap((m) => m.items);
      renderResult(plan);
    } else {
      document.getElementById("results").innerHTML = "<p>No valid plan found.</p>";
    }
  };
});
