// ui.js
import { pickPortion, sample } from "./foods.js";
import { tryBuildDay } from "./mealBuilder.js";

let LOCKS = { foods: {}, meals: {} };

// ---------------------------
// Rendering
export function renderResult(plan) {
  const resultDiv = document.getElementById("result");
  if (!plan) {
    resultDiv.innerHTML = "<div class='card warn'>No plan generated.</div>";
    return;
  }

  let html = "";
  plan.meals.forEach((meal, mi) => {
    const mealUid = `meal-${mi}`;
    html += `<div class="meal-block" data-mi="${mi}" data-meal-uid="${mealUid}">
      <h3>Meal ${mi + 1}
        <button data-type="meal" data-mi="${mi}" onclick="onRegenClicked(event)">🔁</button>
        <button onclick="toggleLockMeal('${mealUid}')">${LOCKS.meals[mealUid] ? "🔒" : "🔓"}</button>
      </h3>
      <ul>`;
    meal.items.forEach((it, fi) => {
      html += `<li data-uid="${it._uid}">
        ${it.label} (${it.kcal.toFixed(0)} kcal, P:${it.p.toFixed(1)} C:${it.c.toFixed(
        1
      )} F:${it.f.toFixed(1)})
        <button data-type="food" data-item-uid="${it._uid}" onclick="onRegenClicked(event)">🔁</button>
        <button onclick="toggleLockFood('${it._uid}')">${LOCKS.foods[it._uid] ? "🔒" : "🔓"}</button>
      </li>`;
    });
    html +
