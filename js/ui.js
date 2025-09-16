// ui.js

let currentDay = {};
let lockedFoods = { breakfast: [], lunch: [], snack: [], dinner: [] };

// ─── Rendering ──────────────────────────────────────────

function renderDay(day) {
    currentDay = day;
    ['breakfast','lunch','snack','dinner'].forEach(mealTag => {
        renderMeal(mealTag, day[mealTag]);
    });
    updateTotals();
}

function renderMeal(mealTag, foods) {
    const container = document.getElementById(mealTag);
    container.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'card';

    const header = document.createElement('div');
    header.className = 'meal-header';
    header.innerHTML = `<h2>${mealTag.charAt(0).toUpperCase() + mealTag.slice(1)}</h2>`;
    card.appendChild(header);

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Food</th>
            <th>Qty</th>
            <th>Protein</th>
            <th>Carbs</th>
            <th>Fat</th>
            <th>Calories</th>
            <th>Lock</th>
        </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    foods.forEach(food => {
        const tr = document.createElement('tr');
        tr.draggable = true;
        tr.dataset.meal = mealTag;
        tr.dataset.food = food.name;

        tr.innerHTML = `
            <td>${food.name}</td>
            <td>${food.qty}</td>
            <td>${food.protein * food.qty}</td>
            <td>${food.carbs * food.qty}</td>
            <td>${food.fat * food.qty}</td>
            <td>${food.calories * food.qty}</td>
            <td><button class="lock-btn ${lockedFoods[mealTag].includes(food.name) ? 'active' : ''}">🔒</button></td>
        `;

        // lock button
        tr.querySelector('.lock-btn').onclick = () => toggleLock(mealTag, food.name);

        // drag events
        tr.addEventListener('dragstart', handleDragStart);
        tr.addEventListener('dragend', handleDragEnd);

        tbody.appendChild(tr);
    });

    // meal totals
    const mealTotals = calculateTotals({ [mealTag]: foods });
    const totalsRow = document.createElement('tr');
    totalsRow.className = 'totals-row';
    totalsRow.innerHTML = `
        <td>Meal Totals</td>
        <td></td>
        <td>${mealTotals.protein}</td>
        <td>${mealTotals.carbs}</td>
        <td>${mealTotals.fat}</td>
        <td>${mealTotals.calories}</td>
        <td></td>
    `;
    tbody.appendChild(totalsRow);

    table.appendChild(tbody);
    card.appendChild(table);
    container.appendChild(card);

    // drop area
    table.addEventListener('dragover', e => handleDragOver(e, mealTag));
    table.addEventListener('drop', e => handleDrop(e, mealTag));
}

// ─── Locks ─────────────────────────────────────────────

function toggleLock(mealTag, foodName) {
    if (lockedFoods[mealTag].includes(foodName)) {
        lockedFoods[mealTag] = lockedFoods[mealTag].filter(f => f !== foodName);
    } else {
        lockedFoods[mealTag].push(foodName);
    }
    renderDay(currentDay);
}

// ─── Totals ───────────────────────────────────────────

function updateTotals() {
    const totals = calculateTotals(currentDay);
    const totalsEl = document.getElementById('totals');
    totalsEl.innerHTML = `
        <div class="card">
            <h2>Daily Totals</h2>
            <table>
                <tr class="totals-row">
                    <td>Protein</td>
                    <td>${totals.protein} g</td>
                </tr>
                <tr class="totals-row">
                    <td>Carbs</td>
                    <td>${totals.carbs} g</td>
                </tr>
                <tr class="totals-row">
                    <td>Fat</td>
                    <td>${totals.fat} g</td>
                </tr>
                <tr class="totals-row">
                    <td>Calories</td>
                    <td>${totals.calories}</td>
                </tr>
            </table>
        </div>`;
}

// ─── Drag & Drop ──────────────────────────────────────

let draggedRow = null;

function handleDragStart(e) {
    draggedRow = e.currentTarget;
    draggedRow.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    if (draggedRow) draggedRow.classList.remove('dragging');
    draggedRow = null;
}

function handleDragOver(e, mealTag) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const table = e.currentTarget;
    table.classList.add('drag-over');
}

function handleDrop(e, mealTag) {
    e.preventDefault();
    const table = e.currentTarget;
    table.classList.remove('drag-over');
    if (!draggedRow) return;

    const fromMeal = draggedRow.dataset.meal;
    const foodName = draggedRow.dataset.food;

    // find food object
    const foodObj = currentDay[fromMeal].find(f => f.name === foodName);
    if (!foodObj) return;

    // remove from old meal
    currentDay[fromMeal] = currentDay[fromMeal].filter(f => f.name !== foodName);
    // add to new meal
    currentDay[mealTag].push(foodObj);

    renderDay(currentDay);
}
