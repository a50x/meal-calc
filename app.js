let foods = [];

// Load foods.json
async function loadFoods() {
  try {
    const response = await fetch("foods.json");
    foods = await response.json();
  } catch (e) {
    console.error("Error loading foods.json", e);
    document.getElementById("result").innerHTML =
      `<div class="card warn">Error loading foods.json</div>`;
  }
}

// Generate a meal plan
function generate() {
  const calTarget = parseInt(document.getElementById("calTarget").value);
  const calRange = parseInt(document.getElementById("calRange").value);
  const pTarget = parseInt(document.getElementById("pTarget").value);
  const pRange = parseInt(document.getElementById("pRange").value);
  const cTarget = parseInt(document.getElementById("cTarget").value);
  const cRange = parseInt(document.getElementById("cRange").value);
  const fTarget = parseInt(document.getElementById("fTarget").value);
  const fRange = parseInt(document.getElementById("fRange").value);

  const mealCount = document.getElementById("mealCount").value;
  const maxShakes = parseInt(document.getElementById("maxShakes").value);
  const maxRepeats = parseInt(document.getElementById("maxRepeats").value);

  const minCal = calTarget - calRange;
  const maxCal = calTarget + calRange;
  const minP = pTarget - pRange;
  const maxP = pTarget + pRange;
  const minC = cTarget - cRange;
  const maxC = cTarget + cRange;
  const minF = fTarget - fRange;
  const maxF = fTarget + fRange;

  let attempts = 0;
  const maxAttempts = 10000;
  let plan = null;

  while (attempts < maxAttempts) {
    attempts++;

    const chosenMeals = [];
    let total = { kcal: 0, p: 0, c: 0, f: 0 };

    // Decide number of meals
    let mealsToMake = 0;
    if (mealCount === "optimal") {
      mealsToMake = Math.floor(Math.random() * 3) + 3; // 3–5
    } else {
      mealsToMake = parseInt(mealCount);
    }

    const usedCounts = {};
    let shakesUsed = 0;

    for (let m = 0; m < mealsToMake; m++) {
      // Pick a random food
      const food = foods[Math.floor(Math.random() * foods.length)];

      // Enforce repeats
      usedCounts[food.id] = (usedCounts[food.id] || 0) + 1;
      if (usedCounts[food.id] > maxRepeats) {
        m--;
        continue;
      }

      // Enforce shake/creami cap
      if (food.tags.includes("shake")) {
        if (shakesUsed >= maxShakes) {
          m--;
          continue;
        }
        shakesUsed++;
      }

      // Handle portionable foods
      let portion = 1;
      if (food.portionable) {
        portion = Math.floor(Math.random() * (food.max - food.min + 1)) + food.min;
      }

      chosenMeals.push({ ...food, portion });

      total.kcal += food.kcal * portion;
      total.p += food.p * portion;
      total.c += food.c * portion;
      total.f += food.f * portion;
    }

    // Check if within ranges
    if (
      total.kcal >= minCal && total.kcal <= maxCal &&
      total.p >= minP && total.p <= maxP &&
      total.c >= minC && total.c <= maxC &&
      total.f >= minF && total.f <= maxF
    ) {
      plan = { meals: chosenMeals, totals: total };
      break;
    }
  }

  if (plan) {
    renderPlan(plan);
  } else {
    document.getElementById("result").innerHTML = `
      <div class="card warn">
        No valid meal plan could be generated within ${maxAttempts.toLocaleString()} attempts.
        Try widening your ranges, allowing more repeats, or raising the shake/creami cap.
      </div>
    `;
  }
}

// Render the plan
function renderPlan(plan) {
  let html = `<div class="card"><h2>Generated Meal Plan</h2><table><tr><th>Meal</th><th>Calories</th><th>P</th><th>C</th><th>F</th></tr>`;
  plan.meals.forEach((meal, i) => {
    const name = meal.portionable
      ? `${meal.name} x${meal.portion}`
      : meal.name;
    html += `<tr>
      <td>${i + 1}. ${name}</td>
      <td>${(meal.kcal * meal.portion).toFixed(0)}</td>
      <td>${(meal.p * meal.portion).toFixed(0)}</td>
      <td>${(meal.c * meal.portion).toFixed(0)}</td>
      <td>${(meal.f * meal.portion).toFixed(0)}</td>
    </tr>`;
  });
  html += `<tr style="font-weight:bold"><td>Total</td>
    <td>${plan.totals.kcal.toFixed(0)}</td>
    <td>${plan.totals.p.toFixed(0)}</td>
    <td>${plan.totals.c.toFixed(0)}</td>
    <td>${plan.totals.f.toFixed(0)}</td>
  </tr></table></div>`;
  document.getElementById("result").innerHTML = html;
}

// Export CSV
function exportCSV() {
  const table = document.querySelector("#result table");
  if (!table) {
    alert("No plan to export!");
    return;
  }
  let csv = [];
  const rows = table.querySelectorAll("tr");
  rows.forEach(row => {
    const cols = row.querySelectorAll("td,th");
    const rowData = [];
    cols.forEach(col => rowData.push(col.innerText));
    csv.push(rowData.join(","));
  });
  const blob = new Blob([csv.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mealplan.csv";
  a.click();
  URL.revokeObjectURL(url);
}
