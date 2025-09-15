// planner.js — Meal planning logic

export class Planner {
  constructor(foods, dailyTargets) {
    this.foods = foods; // loaded from foods.json
    this.dailyTargets = dailyTargets; // macros/calories
    this.meals = { breakfast: [], lunch: [], dinner: [], snack: [] };
    this.locks = { foods: new Set(), meals: new Set() };
  }

  // Generate all meals
  generateMeals() {
    for (const meal in this.meals) {
      if (!this.locks.meals.has(meal)) {
        this.meals[meal] = this.generateMeal(meal);
      }
    }
  }

  // Generate one meal
  generateMeal(mealType) {
    const available = this.foods.filter(f => f.tags.includes(mealType));
    const picks = [];

    for (let i = 0; i < 3; i++) {
      const food = available[Math.floor(Math.random() * available.length)];
      if (this.locks.foods.has(food.name)) continue;
      const portion = this.scalePortion(food);
      picks.push({ ...food, qty: portion });
    }
    return picks;
  }

  // Portion scaling if portionable
  scalePortion(food) {
    if (food.portionable) {
      const amount = Math.floor(
        Math.random() * (food.max - food.min + 1)
      ) + food.min;
      return `${amount} ${food.unit}`;
    }
    return food.unit || "1 serving";
  }

  // Lock/unlock a food
  toggleFoodLock(foodName) {
    if (this.locks.foods.has(foodName)) {
      this.locks.foods.delete(foodName);
    } else {
      this.locks.foods.add(foodName);
    }
  }

  // Lock/unlock a meal
  toggleMealLock(mealType) {
    if (this.locks.meals.has(mealType)) {
      this.locks.meals.delete(mealType);
    } else {
      this.locks.meals.add(mealType);
    }
  }

  // Export meals to CSV
  exportCSV() {
    let csv = "Meal,Food,Qty,Calories,Protein,Carbs,Fat\n";
    for (const [meal, foods] of Object.entries(thi
