// ui.js — Handles DOM updates & interactivity

export class UI {
  constructor(planner) {
    this.planner = planner;
    this.mealContainers = {
      breakfast: document.getElementById("breakfast"),
      lunch: document.getElementById("lunch"),
      dinner: document.getElementById("dinner"),
      snack: document.getElementById("snack")
    };
  }

  renderMeals() {
    for (const [meal, foods] of Object.entries(this.planner.meals)) {
      const container = this.mealContainers[meal];
      container.innerHTML = "";

      foods.forEach(food => {
        const div = document.createElement("div");
        div.className = "food-item";
        div.draggable = true;
        div.innerHTML = `
          <span>${food.name} (${food.qty})</span>
          <button class="lock-btn" data-food="${food.name}">🔒</button>
        `;
        container.appendChild(div);
      });

      // Lock button events
      container.querySelectorAll(".lock-btn").forEach(btn => {
        btn.addEventListener("click", e => {
          const foodName = e.target.dataset.food;
          this.planner.toggleFoodLock(foodName);
          e.target.classList.toggle("locked");
        });
      });
    }
  }

  setupMealLockButtons() {
    document.querySelectorAll(".meal-lock").forEach(btn => {
      btn.addEventListener("click", e => {
        const meal = e.target.dataset.meal;
        this.planner.toggleMealLock(meal);
        e.target.classList.toggle("locked");
      });
    });
  }

  setupCSVExport() {
    document.getElementById("exportCSV").addEventListener("click", () => {
      const blob = new Blob([this.planner.exportCSV()], {
        type: "text/csv"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "meals.csv";
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}
