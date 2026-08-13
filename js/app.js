(function () {
  const data = window.GYM_DATA;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const storage = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  };

  function exerciseSvg(index) {
    const variants = [
      '<circle cx="60" cy="18" r="9"/><path d="M60 27v30m0-19L38 51m22-13 22 13M60 57L43 85m17-28 19 28"/><path d="M28 51h20m24 0h20"/>',
      '<circle cx="44" cy="19" r="9"/><path d="M47 28l19 28 28 3M66 56L48 81m18-25 14 27"/><path d="M21 82h78M28 68h20"/>',
      '<circle cx="57" cy="18" r="9"/><path d="M57 27v31M57 39L31 30m26 9 27-9M57 58L39 86m18-28 20 28"/><path d="M24 29h15m38 0h15"/>'
    ];
    return `<svg viewBox="0 0 120 100" aria-hidden="true">${variants[index % variants.length]}</svg>`;
  }

  function exerciseMedia(id, className) {
    const ex = data.exercises[id];
    if (!ex?.gif) return `<div class="${className} fallback">${exerciseSvg(0)}</div>`;
    const note = ex.gifNote ? `<figcaption class="media-note">${ex.gifNote}</figcaption>` : "";
    return `<figure class="${className}">
      <img src="${ex.gif}" alt="Как выполнять: ${ex.name}" loading="lazy" decoding="async">
      ${note}
    </figure>`;
  }

  function initGuide() {
    const root = $("#workout-app");
    if (!root) return;
    const personId = document.body.dataset.person;
    const person = data.people[personId];
    let day = storage.get(`zal-day-${personId}`, "A");
    let phase = storage.get(`zal-phase-${personId}`, 0);
    $("#person-title").textContent = person.name;
    $("#person-subtitle").textContent = person.subtitle;
    $("#person-note").textContent = person.note;
    const phaseSelect = $("#phase-select");
    phaseSelect.innerHTML = data.phases.map((p, i) => `<option value="${i}">${p.title}</option>`).join("");
    phaseSelect.value = phase;

    function renderPhase() {
      const selected = data.phases[phase];
      $("#phase-info").innerHTML = `<strong>${selected.title}</strong><p>${selected.text}</p>`;
    }

    function render() {
      $$(".switcher button").forEach(btn => btn.classList.toggle("active", btn.dataset.day === day));
      const sessionKey = `zal-log-${personId}-${day}`;
      const log = storage.get(sessionKey, {});
      root.innerHTML = person.days[day].map(([id, name, sets, reps], index) => {
        const row = log[id] || {};
        const setCount = Math.min(3, parseInt(sets, 10) || 1);
        const fields = id === "cardio"
          ? `<input aria-label="Результат" data-field="result" value="${row.result || ""}" placeholder="мин / уровень">`
          : Array.from({ length: setCount }, (_, i) =>
              `<input aria-label="Подход ${i + 1}" data-field="set${i + 1}" value="${row[`set${i + 1}`] || ""}" placeholder="${i + 1}: кг × повт">`
            ).join("");
        return `<article class="exercise-row ${row.done ? "done" : ""}" data-id="${id}">
          ${exerciseMedia(id, "exercise-thumb-wrap")}
          <input class="check" type="checkbox" aria-label="Выполнено" ${row.done ? "checked" : ""}>
          <div class="exercise-copy">
            <div class="exercise-name">${index + 1}. ${name}</div>
            <a class="exercise-technique" href="technique.html#${id}">Техника и GIF →</a>
          </div>
          <div class="exercise-meta">${sets} × ${reps}</div>
          <div class="sets-log">${fields}</div>
        </article>`;
      }).join("");

      $$(".exercise-row", root).forEach(row => {
        const id = row.dataset.id;
        $(".check", row).addEventListener("change", event => {
          const current = storage.get(sessionKey, {});
          current[id] = { ...(current[id] || {}), done: event.target.checked };
          storage.set(sessionKey, current);
          row.classList.toggle("done", event.target.checked);
        });
        $$("input[data-field]", row).forEach(input => input.addEventListener("change", () => {
          const current = storage.get(sessionKey, {});
          current[id] = { ...(current[id] || {}), [input.dataset.field]: input.value };
          storage.set(sessionKey, current);
        }));
      });
    }

    $$(".switcher button").forEach(btn => btn.addEventListener("click", () => {
      day = btn.dataset.day;
      storage.set(`zal-day-${personId}`, day);
      render();
    }));
    phaseSelect.addEventListener("change", () => {
      phase = Number(phaseSelect.value);
      storage.set(`zal-phase-${personId}`, phase);
      renderPhase();
    });
    $("#reset-session")?.addEventListener("click", () => {
      if (confirm(`Очистить записи тренировки ${day}?`)) {
        localStorage.removeItem(`zal-log-${personId}-${day}`);
        render();
      }
    });
    renderPhase();
    render();
  }

  function initProgression() {
    const root = $("#progression-app");
    if (!root) return;
    const p = data.progression;
    root.innerHTML = `
      <p class="lead">${p.intro}</p>
      <div class="progression-grid">
        <article class="card signal-up"><h3>↑ Повышать вес</h3><ul>${p.increase.map(i => `<li>${i}</li>`).join("")}</ul></article>
        <article class="card signal-hold"><h3>= Оставить вес</h3><ul>${p.hold.map(i => `<li>${i}</li>`).join("")}</ul></article>
        <article class="card signal-down"><h3>↓ Понизить вес</h3><ul>${p.decrease.map(i => `<li>${i}</li>`).join("")}</ul></article>
      </div>
      <div class="card" style="margin-top:16px"><p><strong>Важно:</strong> ${p.timing}</p></div>
      <div class="examples-grid">${p.examples.map(ex => `<div class="example-chip"><span class="eyebrow">${ex.label}</span><p>${ex.text}</p></div>`).join("")}</div>`;
  }

  function initNutrition() {
    const root = $("#nutrition-app");
    if (!root) return;
    const personId = document.body.dataset.person;
    const n = data.nutrition[personId];
    if (!n) return;
    const macroTotal = n.macros.protein * 4 + n.macros.fat * 9 + n.macros.carbs * 4;
    root.innerHTML = `
      <p class="muted">${n.profile}</p>
      <p class="lead">${n.goal}</p>
      <div class="macro-hero card">
        <div><span class="macro-num">${n.caloriesRange || n.calories}</span><span class="macro-label">ккал / день</span></div>
        <div class="macro-bars">
          <div class="macro-row"><span>Белки</span><strong>${n.macros.protein} г</strong><span>${Math.round(n.macros.protein * 4 / macroTotal * 100)}%</span></div>
          <div class="macro-row"><span>Жиры</span><strong>${n.macros.fat} г</strong><span>${Math.round(n.macros.fat * 9 / macroTotal * 100)}%</span></div>
          <div class="macro-row"><span>Углеводы</span><strong>${n.macros.carbs} г</strong><span>${Math.round(n.macros.carbs * 4 / macroTotal * 100)}%</span></div>
        </div>
      </div>
      <p class="muted">${n.macroDetail}</p>
      <p class="muted">${n.caloriesNote}</p>
      <p class="muted">${n.water}</p>
      <div class="notice">${n.trainingDay}</div>
      ${n.sampleDays.map(day => `
        <section class="menu-day">
          <h2>${day.title}</h2>
          <div class="meal-list">${day.meals.map(meal => `
            <article class="meal-card">
              <div class="meal-head"><span class="eyebrow">${meal.time}</span><h3>${meal.name}</h3></div>
              <p>${meal.food}</p>
              <p class="meal-macros">≈ ${meal.kcal} ккал · Б ${meal.p} · Ж ${meal.f} · У ${meal.c}</p>
            </article>`).join("")}
          </div>
        </section>`).join("")}
      <p class="muted footer-note">Цифры округлены. Это ориентир, не медицинское назначение. При хронических заболеваниях согласуйте рацион с врачом.</p>`;
  }

  function initTimer() {
    const display = $("#timer-display");
    if (!display) return;
    let timerId;
    let remaining = 0;
    function draw() {
      const min = Math.floor(remaining / 60);
      const sec = remaining % 60;
      display.textContent = `${min}:${String(sec).padStart(2, "0")}`;
    }
    $$("[data-seconds]").forEach(btn => btn.addEventListener("click", () => {
      clearInterval(timerId);
      remaining = Number(btn.dataset.seconds);
      draw();
      timerId = setInterval(() => {
        remaining -= 1;
        draw();
        if (remaining <= 0) {
          clearInterval(timerId);
          if ("vibrate" in navigator) navigator.vibrate([150, 80, 150]);
        }
      }, 1000);
    }));
    $("#timer-stop")?.addEventListener("click", () => {
      clearInterval(timerId);
      remaining = 0;
      draw();
    });
    draw();
  }

  function initTechniques() {
    const root = $("#technique-list");
    if (!root) return;
    const entries = Object.entries(data.exercises);
    root.innerHTML = entries.map(([id, ex], i) => `<article class="card tech-card" id="${id}" data-search="${(ex.name + " " + ex.target).toLowerCase()}">
      ${ex.gif ? exerciseMedia(id, "tech-visual media") : `<div class="tech-visual">${exerciseSvg(i)}</div>`}
      <div class="tech-body">
        <span class="eyebrow">${ex.target}</span>
        <h2>${ex.name}</h2>
        <p>${ex.setup}</p>
        <details open>
          <summary>Пошаговая техника</summary>
          <ol>${ex.steps.map(step => `<li>${step}</li>`).join("")}</ol>
          <p><strong>Частые ошибки:</strong> ${ex.errors}</p>
          <p class="stop"><strong>Остановиться:</strong> ${ex.stop}</p>
        </details>
      </div>
    </article>`).join("");
    $("#tech-search")?.addEventListener("input", event => {
      const query = event.target.value.trim().toLowerCase();
      $$(".tech-card", root).forEach(card => {
        card.hidden = !card.dataset.search.includes(query);
      });
    });
    if (location.hash) setTimeout(() => $(location.hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  initGuide();
  initProgression();
  initNutrition();
  initTimer();
  initTechniques();
})();
