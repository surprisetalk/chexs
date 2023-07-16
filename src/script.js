const qs = (...args) => document.querySelector(...args);
const qsa = (...args) => document.querySelectorAll(...args);
const qt = (q, r) => qs(`[q="${q}"][r="${r}"]`);

const post = (path, body, opts) =>
  fetch(path, {
    ...opts,
    method: "POST",
    body: body && JSON.stringify(body),
  });

const tile = x => ({
  piece: x.getAttribute("piece"),
  color: x.getAttribute("color"),
  q: parseInt(x.getAttribute("q")),
  r: parseInt(x.getAttribute("r")),
  s: parseInt(x.getAttribute("s")),
});

const game_id = new URLSearchParams(window.location.search).get("id");

async function checkUser() {
  const res = await fetch("/usr");
  let usr;
  try {
    usr = await res.json();
  } catch (_) {}
  for (const x of qsa(".logged-in")) x.style.display = usr ? "block" : "none";
  for (const x of qsa(".logged-out")) x.style.display = usr ? "none" : "block";
  return usr;
}

async function logout() {
  await post("/logout");
  if (!(await checkUser())) window.location.replace(`/index.html`);
}

async function login() {
  await post("/login", {
    username: qs("#login [name=username]").value,
    password: qs("#login [name=password]").value,
  });
  await checkUser();
  if (await checkUser()) window.location.replace(`/index.html`);
}

async function signup() {
  await post("/signup", {
    email: qs("#signup [name=email]").value,
    username: qs("#signup [name=username]").value,
    password: qs("#signup [name=password]").value,
  });
  await checkUser();
  if (await checkUser()) window.location.replace(`/index.html`);
}

async function start() {
  const res = await post("/game");
  await games();
  const id = await res.text();
  if (id) window.location.replace(`/game.html?id=${id}`);
}

async function join(game_id) {
  await post(`/game/${game_id}`, { color: "black" });
  game();
}

function highlight(x) {
  if (qs(".selected")) return;
  for (const a of qsa(".tile.possible")) a.classList.remove("possible");
  if (!x) return;
  const { piece, color, q, r } = tile(x);
  const poss = x => (
    x && x.classList.add("possible"), x?.getAttribute("color")
  );
  const hop = x => x?.getAttribute("color") !== color && poss(x);
  const run = x => {
    for (let i = 1; i < 100; i++)
      if (x(i)?.getAttribute("color") === color) break;
      else if (poss(x(i))) break;
  };
  switch (piece) {
    case "p": {
      const c = color == "b" ? 1 : -1;
      const cap = x => x?.getAttribute("color") && hop(x);
      const nocap = x => !x?.getAttribute("color") && hop(x);
      nocap(qt(q, r + c));
      // TODO: check if first move in move history
      if (true) nocap(qt(q, r + c + c));
      cap(qt(q - c, r + c));
      cap(qt(q + c, r + 0));
      // TODO: check for en passant in move history
      break;
    }
    case "b":
      run(i => qt(q + 2 * i, r - i));
      run(i => qt(q + i, r + i));
      run(i => qt(q + i, r - 2 * i));
      run(i => qt(q - 2 * i, r + i));
      run(i => qt(q - i, r + 2 * i));
      run(i => qt(q - i, r - i));
      break;
    case "r":
      run(i => qt(q + i, r - i));
      run(i => qt(q + i, r));
      run(i => qt(q - i, r + i));
      run(i => qt(q - i, r));
      run(i => qt(q, r + i));
      run(i => qt(q, r - i));
      break;
    case "q":
      run(i => qt(q + 2 * i, r - i));
      run(i => qt(q + i, r + i));
      run(i => qt(q + i, r - 2 * i));
      run(i => qt(q + i, r - i));
      run(i => qt(q + i, r));
      run(i => qt(q - 2 * i, r + i));
      run(i => qt(q - i, r + 2 * i));
      run(i => qt(q - i, r + i));
      run(i => qt(q - i, r - i));
      run(i => qt(q - i, r));
      run(i => qt(q, r + i));
      run(i => qt(q, r - i));
      break;
    case "n":
      hop(qt(q + 1, r + 2));
      hop(qt(q + 1, r - 3));
      hop(qt(q + 2, r + 1));
      hop(qt(q + 2, r - 3));
      hop(qt(q + 3, r - 1));
      hop(qt(q + 3, r - 2));
      hop(qt(q - 1, r + 3));
      hop(qt(q - 1, r - 2));
      hop(qt(q - 2, r + 3));
      hop(qt(q - 2, r - 1));
      hop(qt(q - 3, r + 1));
      hop(qt(q - 3, r + 2));
      break;
    case "k":
      hop(qt(q + 0, r + 1));
      hop(qt(q + 0, r - 1));
      hop(qt(q + 1, r + 0));
      hop(qt(q + 1, r + 1));
      hop(qt(q + 1, r - 1));
      hop(qt(q + 1, r - 2));
      hop(qt(q + 2, r - 1));
      hop(qt(q - 1, r + 0));
      hop(qt(q - 1, r + 1));
      hop(qt(q - 1, r + 2));
      hop(qt(q - 1, r - 1));
      hop(qt(q - 2, r + 1));
      break;
  }
}

async function move() {
  const selected = qs(".tile.selected");
  if (selected) {
    const color = selected?.getAttribute("color");
    if (!this.classList.contains("selected"))
      await post(`/game/${game_id}`, {
        color: color === "w" ? "white" : "black",
        from: tile(selected),
        to: tile(this),
      });
    selected.classList.remove("selected");
    for (const b of qsa(".tile.possible")) b.classList.remove("possible");
    await game();
  } else {
    highlight(this);
    this.classList.add("selected");
  }
}

function game() {
  fetch(`/game/${game_id}`).then(async res => {
    const game = await res.json();
    if (!game.white_usr_id || !game.black_usr_id)
      qs("#game").insertAdjacentHTML(
        "afterbegin",
        `<button id="join" onclick="join('${game_id}')">join game</button>`
      );
    else {
      qs("#join")?.remove();
      const board = qs("#board");
      if (!board) return;
      board.innerHTML = "";
      for (const q of new Array(11).fill(null).map((_, i) => i - 5))
        for (const r of new Array(11).fill(null).map((_, i) => i - 5)) {
          const s = 0 - q - r;
          const w = 50;
          const h = w / 1.1547;
          const m = 10;
          if (Math.abs(q) > 5 || Math.abs(r) > 5 || Math.abs(s) > 5) continue;
          const div = document.createElement("div");
          div.setAttribute("q", q);
          div.setAttribute("r", r);
          div.setAttribute("s", s);
          div.className = `tile c${(100 + q - r) % 3}`;
          div.style.top =
            Math.round(5 * (h + m) + ((h + m) * (r - s)) / 2) + "px";
          div.style.left =
            Math.round(3.75 * (w + m) + (((w + m) / 2) * (2 * q - r - s)) / 2) +
            "px";
          div.onclick = move;
          div.onmouseenter = e => highlight(e.target);
          div.onmouseleave = () => highlight();
          board.append(div);
        }
      for (const piece of game._board) {
        const [p, q_, r_] = piece.split(":");
        const q = parseInt(q_);
        const r = parseInt(r_);
        document
          .querySelector(`[q="${q}"][r="${r}"]`)
          .setAttribute("piece", p[0].toLowerCase());
        document
          .querySelector(`[q="${q}"][r="${r}"]`)
          .setAttribute("color", p[1].toLowerCase());
      }
    }
  });
}

async function games() {
  const games = qs("#games");
  if (games)
    fetch("/game").then(async res => {
      const glist = await res.json();
      games.innerHTML = "";
      const ulli = xs => `<ul>${xs.map(x => `<li>${x}</li>`).join("")}</ul>`;
      const game = g =>
        g._black_username
          ? `<a href="/game.html?id=${g.game_id}">${g._white_username} vs. ${g._black_username}</a>`
          : `<a href="/game.html?id=${g.game_id}">${g._white_username} waiting</a>`;
      for (const x of ["lobby", "active", "recent", "personal"]) {
        if (!glist[x]?.length) continue;
        games.insertAdjacentHTML(
          "beforeend",
          `<div><h3>${x}</h3>${ulli(glist[x].map(game))}</div>`
        );
      }
    });
}

checkUser();
games();
if (game_id) game();
