// main.js — Entry point

import { Planner } from "./planner.js";
import { UI } from "./ui.js";

async function init() {
  const response = await fetch("foods.json");
  const foods = await response.json();

  const dailyTargets = { calories: 2500, protein: 185, carbs: 220, fat: 65 };

  const planner = new Planner(foods, dailyTargets);
  planner.generateMeals();

  const ui = new UI(planner);
  ui.renderMeals();
  ui.setupMealLockButtons();
  ui.setupCSVExport();

  // Regenerate button
  document.getElementById("regenerate").addEventListener("click", () => {
    planner.generateMeals();
    ui.renderMeals();
  });
}

init();
