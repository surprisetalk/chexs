// IMPORTS ////////////////////////////////////////////////////////////////////

import {
  Application,
  Router,
  send,
} from "https://deno.land/x/oak@v12.1.0/mod.ts";

import pg from "https://deno.land/x/postgresjs@v3.3.4/mod.js";

// PG /////////////////////////////////////////////////////////////////////////

export const sql = pg(
  Deno.env.get(`DATABASE_URL`)?.replace(/flycast/, "internal") ??
    `postgres://chexs:password1234@localhost:5432/chexs`,
  {
    database: "chexs",
  }
);

Deno.addSignalListener(`SIGINT`, async () => {
  await sql.end();
  Deno.exit();
});

// ROUTES /////////////////////////////////////////////////////////////////////

// const board = [
//   //////////////////////////////////////////////////////////////////
//   [____, ____, ____, ____, ____, null, null, null, null, null, null],
//   //////////////////////////////////////////////////////////////////
//   [____, ____, ____, ____, "PB", null, null, null, null, null, "PW"],
//   //////////////////////////////////////////////////////////////////
//   [____, ____, ____, "RB", "PB", null, null, null, null, "PW", "RW"],
//   //////////////////////////////////////////////////////////////////
//   [____, ____, "NB", null, "PB", null, null, null, "PW", null, "NW"],
//   //////////////////////////////////////////////////////////////////
//   [____, "QB", null, null, "PB", null, null, "PW", null, null, "QW"],
//   //////////////////////////////////////////////////////////////////
//   ["BB", "BB", "BB", null, "PB", null, "PW", null, "BW", "BW", "BW"],
//   //////////////////////////////////////////////////////////////////
//   ["KB", null, null, "PB", null, null, "PW", null, null, "KW", ____],
//   //////////////////////////////////////////////////////////////////
//   ["NB", null, "PB", null, null, null, "PW", null, "NW", ____, ____],
//   //////////////////////////////////////////////////////////////////
//   ["RB", "PB", null, null, null, null, "PW", "RW", ____, ____, ____],
//   //////////////////////////////////////////////////////////////////
//   ["PB", null, null, null, null, null, "PW", ____, ____, ____, ____],
//   //////////////////////////////////////////////////////////////////
//   [null, null, null, null, null, null, ____, ____, ____, ____, ____],
//   //////////////////////////////////////////////////////////////////
// ];

const router = new Router();

router.post("/signup", async ctx => {
  const { email, username, password } = await ctx.request.body({ type: "json" })
    .value;
  const [{ usr_id } = { usr_id: null }] = await sql`
    insert into usr (email, username, password)
    values (${email}, ${username}, crypt(${password}, gen_salt('bf')))
    returning *
  `;
  await ctx.cookies.set("usr_id", usr_id);
  ctx.response.status = 204;
});

router.post("/logout", async ctx => {
  await ctx.cookies.set("usr_id", null);
  ctx.response.status = 204;
});

router.post("/login", async ctx => {
  const { username, password } = await ctx.request.body({ type: "json" }).value;
  const [{ usr_id } = { usr_id: null }] = await sql`
    select usr_id from usr 
    where username = ${username} 
      and password = crypt(${password}, password)
  `;
  await ctx.cookies.set("usr_id", usr_id);
  ctx.response.status = usr_id ? 204 : 401;
});

router.get("/usr", async ctx => {
  const usr_id = (await ctx.cookies.get("usr_id")) ?? null;
  const [usr] = await sql`
    select usr_id, username, email, bio from usr 
    where usr_id = ${usr_id} 
  `;
  ctx.response.body = usr;
  ctx.response.status = usr ? 200 : 403;
});

router.get("/game", async ctx => {
  const usr_id = (await ctx.cookies.get("usr_id")) ?? null;
  const [lobby, active, recent, personal] = await Promise.all([
    sql`select * from game where game_id is not null and is_public is true and (white_usr_id is null or black_usr_id is null) order by created_at desc limit 100`,
    sql`select * from game where game_id is not null and is_public is true and now() - created_at < interval '2 days' order by updated_at desc limit 100`,
    sql`select * from game where game_id is not null and is_public is true and now() - created_at < interval '2 days' order by created_at desc limit 100`,
    sql`select * from game where game_id is not null and white_usr_id = ${usr_id} or black_usr_id = ${usr_id} and now() - created_at < interval '7 days' order by created_at desc limit 100`,
  ]);
  ctx.response.body = { lobby, active, recent, personal };
  ctx.response.status = 200;
});

router.post("/game", async ctx => {
  const usr_id = (await ctx.cookies.get("usr_id")) ?? null;
  const id = (Math.random() + 1).toString(36).substring(4);
  const board = [
    "BW:+0:+5",
    "BW:+0:+4",
    "BW:+0:+3",
    "PW:-4:+5",
    "PW:-3:+4",
    "PW:-2:+3",
    "PW:-1:+2",
    "PW:+0:+1",
    "PW:+1:+1",
    "PW:+2:+1",
    "PW:+3:+1",
    "PW:+4:+1",
    "BB:+0:-5",
    "BB:+0:-4",
    "BB:+0:-3",
    "PB:+4:-5",
    "PB:+3:-4",
    "PB:+2:-3",
    "PB:+1:-2",
    "PB:+0:-1",
    "PB:-1:-1",
    "PB:-2:-1",
    "PB:-3:-1",
    "PB:-4:-1",
    "RW:-3:+5",
    "NW:-2:+5",
    "KW:-1:+5",
    "QW:+1:+4",
    "NW:+2:+3",
    "RW:+3:+2",
    "RB:+3:-5",
    "NB:+2:-5",
    "QB:+1:-5",
    "KB:-1:-4",
    "NB:-2:-3",
    "RB:-3:-2",
  ];
  const [{ game_id } = { game_id: null }] = await sql`
    insert into game (game_id, white_usr_id, is_public, _board, _white_username)
    select ${id}, ${usr_id}, true, ${board}, (select username from usr where usr_id = ${usr_id})
    where not exists (select * from game where white_usr_id = ${usr_id} and black_usr_id is null)
    returning *
  `;
  ctx.response.body = game_id;
  ctx.response.status = 201;
});

router.get("/game/:game_id", async ctx => {
  const [game] = await sql`
    select g.*, jsonb_agg(m.*) filter (where m is not null) as moves
    from game g left join move m using (game_id)
    where game_id = ${ctx.params.game_id}
    group by g.game_id
  `;
  ctx.response.body = game;
  ctx.response.status = game ? 200 : 404;
});

// TODO: resign game by moving your king to **. or maybe infinity?
router.post("/game/:game_id", async ctx => {
  const game_id = ctx.params.game_id;
  const usr_id = (await ctx.cookies.get("usr_id")) ?? null;
  const {
    color,
    from,
    to,
  }: {
    color: "black" | "white";
    from: { q: number; r: number };
    to: { q: number; r: number };
  } = await ctx.request.body({ type: "json" }).value;
  try {
    await sql.begin(async sql => {
      await sql`
        update game set 
          updated_at = now()
        , white_usr_id = coalesce(white_usr_id, ${usr_id})
        , black_usr_id = coalesce(black_usr_id, ${usr_id})
        , _white_username = coalesce(_white_username, (select username from usr where usr_id = ${usr_id}))
        , _black_username = coalesce(_black_username, (select username from usr where usr_id = ${usr_id}))
        where game_id = ${game_id}
      `;
      const [game] = await sql`
        select * 
        from game g left join move m using (game_id)
        where g.game_id = ${game_id}
        and ${usr_id} = ${sql(`g.${color}_usr_id`)}
        order by m.created_at desc
        limit 1
      `;
      if (!game) throw new Error("Game not found (or wrong color moved).");
      if (game.points) throw new Error("Game is already complete.");
      if (!from || !to) return;
      if (from.q === to.q && from.r === to.r)
        throw new Error("You didn't move your piece!");
      const c = color[0].toUpperCase();
      if (c === (game._piece?.[1] ?? "W"))
        throw new Error("It's not your turn.");
      const abs = Math.abs;
      if (abs(to.q) > 5 || abs(to.r) > 5 || abs(0 - to.q - to.r) > 5)
        throw new Error("Out-of-bounds!");
      const board: Record<number, Record<number, string | null>> = {};
      for (const q of [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5])
        for (const r of [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5])
          board[q] = { ...board[q], [r]: null };
      for (const m of game._board) {
        const [p, q, r] = m.split(":");
        board[parseInt(q)][parseInt(r)] = p;
      }
      const p = board[from.q][from.r]?.[0];
      if (!p) throw new Error("Trying to move a piece that doesn't exist.");
      if (c === board[to.q][to.r])
        throw new Error("You can't capture your own piece!");
      const q_ = to.q - from.q;
      const r_ = to.r - from.r;
      const s_ = 0 - from.q - from.r - (0 - from.q - to.r);
      if (["Q", "R", "B"].includes(p)) {
        // TODO: throw new Error(`Cannot hop over piece at (${from.q},${r}).`);
      }
      console.log(q_, r_, s_);
      switch (p) {
        case "K":
          if (abs(q_) > 2 || abs(r_) > 2 || abs(q_ + r_) > 1) {
            throw new Error("Invalid king move.");
          }
          break;
        case "Q":
          if (
            q_ &&
            abs(r_) !== abs(s_) &&
            !(q_ === r_ || 2 * abs(q_) === abs(r_) || 2 * abs(r_) === abs(q_))
          ) {
            throw new Error("Invalid queen move.");
          }
          break;
        case "R":
          if (q_ && abs(r_) !== abs(s_)) throw new Error("Invalid rook move.");
          break;
        case "N":
          if (
            !"1:2 1:-3 2:1 2:-3 3:-1 3:-2 -1:3 -1:-2 -2:3 -2:-1 -3:1 -3:2".includes(
              `${q_}:${r_}`
            )
          )
            throw new Error("Invalid knight move");
          break;
        case "B":
          if (
            !(q_ === r_ || 2 * abs(q_) === abs(r_) || 2 * abs(r_) === abs(q_))
          ) {
            throw new Error("Invalid bishop move.");
          }
          break;
        case "P":
          // TODO: direction based on board[from.q][from.r]?.[1]
          throw new Error("TODO");
          break;
        default:
          ctx.response.status = 400;
          throw new Error(`Unknown piece: ${p}.`);
      }
      const _piece = p + c;
      const tid = (p, q, r) =>
        [p, `${q}`.padStart(2, "+"), `${r}`.padStart(2, "+")].join(":");
      const from_ = tid(_piece, from.q, from.r);
      const to_ = tid(_piece, to.q, to.r);
      const cap_ = tid(board[to.q][to.r] ?? "XX", to.q, to.r);
      // TODO: end game (set move.points = 3/4 or 1) if checkmate or stalemate or king captured
      const move = {
        game_id,
        _piece,
        piece_from_q: from.q,
        piece_from_r: from.r,
        piece_to_q: to.q,
        piece_to_r: to.r,
      };
      await sql`
        with move_ as (insert into move ${sql(move)})
        update game 
        set _board = array_remove(array_remove(_board, ${from_}), ${cap_}) || ${to_}::text
          , updated_at = now()
        where game_id = ${game_id};
      `;
    });

    ctx.response.status = 204;
  } catch (e) {
    console.error(e);
    ctx.response.status = 500;
  }
});

// APP ////////////////////////////////////////////////////////////////////////

export const app = new Application();

app.use(async (context, next) => {
  try {
    await context.send({
      root: `${Deno.cwd()}/dist`,
      index: "index.html",
    });
  } catch {
    await next();
  }
});

// TODO: add signature keys for cookies

// TODO: Add rate-limiting.

app.use(router.routes());
app.use(router.allowedMethods());

app.listen({
  hostname: "0.0.0.0",
  port: parseInt(Deno.env.get(`PORT`) ?? ``) || 8666,
});
