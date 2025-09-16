// main.js
window.addEventListener("DOMContentLoaded", async () => {
  await loadFoods();

  document.getElementById("generateBtn").addEventListener("click", () => {
    generate();
  });

  document.getElementById("exportBtn").addEventListener("click", () => {
    exportCSV();
  });
});

// ------------------------------
// Generate a new plan or regenerate day
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
    mealCount: meals,
    calMin: cal - calRange,
    calMax: cal + calRange,
    pMin: p - pRange,
    pMax: p + pRange,
    cMin: c - cRange,
    cMax: c + cRange,
    fMin: f - fRange,
    fMax: f + fRange,
    perMealCalMax: Math.ceil((cal + calRange) / meals),
    perMealCarbMax: Math.ceil((c + cRange) / meals),
    perMealFatMax: Math.ceil((f + fRange) / meals),
    maxAttempts: 1200,
    seededLocked: window.LOCKS || {}, // <-- pass current locks
  };

  window._lastOpts = opts;

  const plan = tryBuildDay(opts);

  if (plan) {
    // Ensure each meal has subtotal & _uid
    plan.meals.forEach(m => {
      if (!m._uid) m._uid = uid('m');
      recalcMeal(m);
    });

    recalcTotals(plan);

    window._lastPlan = plan;
    window._lastPlan.allItems = plan.meals.flatMap(m => m.items);

    renderResult(plan);
  } else {
    document.getElementById("result").innerHTML =
      "<p>No valid plan found. Try widening ranges.</p>";
  }
}

// ------------------------------
// Helpers for recalculating meals & totals
function recalcMeal(meal) {
  const subtotal = { kcal: 0, p: 0, c: 0, f: 0 };
  meal.items.forEach(it => {
    subtotal.cal = (subtotal.cal || 0) + (it.kcal || 0);
    subtotal.kcal = subtotal.cal;
    subtotal.p += it.p || 0;
    subtotal.c += it.c || 0;
    subtotal.f += it.f || 0;
  });
  meal.subtotal = subtotal;
}

function recalcTotals(plan) {
  plan.totals = plan.meals.reduce((acc, meal) => {
    acc.cal += meal.subtotal.kcal || meal.subtotal.cal || 0;
    acc.p += meal.subtotal.p || 0;
    acc.c += meal.subtotal.c || 0;
    acc.f += meal.subtotal.f || 0;
    return acc;
  }, { cal: 0, p: 0, c: 0, f: 0 });
}
