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
    // ssl: false,
    // fetch_types: false,
    // idle_timeout: 1,
    // max_lifetime: 60 * 30,
    // prepare: false,
    // username: "postgres",
    // password: "QL6tRqze46pgR5o",
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
  const [games] = await sql`
    select
      coalesce(jsonb_agg(g.*) filter (where game_id is not null and is_public is true and (white_usr_id is null or black_usr_id is null)),'[]') as pending
    , coalesce(jsonb_agg(g.*) filter (where game_id is not null and is_public is true and white_usr_id is not null and black_usr_id is not null and points is null and now() - created_at < interval '1 day'),'[]') as active
    , coalesce(jsonb_agg(g.*) filter (where game_id is not null and is_public is true and points is not null),'[]') as recent
    , coalesce(jsonb_agg(g.*) filter (where game_id is not null and white_usr_id = ${usr_id} or black_usr_id = ${usr_id}),'[]') as personal
    from game g
  `;
  ctx.response.body = games;
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
  ];
  await sql`
    insert into game (game_id, white_usr_id, is_public, _board, _white_username)
    values (${id}, ${usr_id}, true, ${board}, (select username from usr where usr_id = ${usr_id}))
    returning *
  `;
  ctx.response.body = id;
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
  } = await ctx.request.body().value;

  try {
    await sql.begin(async sql => {
      await sql`
        update game set 
        white_usr_id = coalesce(white_usr_id, ${usr_id})
          , black_usr_id = coalesce(black_usr_id, ${usr_id})
        where game = ${game_id}
      `;
      const [game] = await sql`
        select * from game 
        where game_id = ${game_id}
        and ${usr_id} = ${sql(`${color}_usr_id`)}
      `;
      if (!game) throw new Error("404");
      if (!game.board[from.q][from.r]) throw new Error("400");
      if (game.board[to.q][to.r] === undefined) throw new Error("400");
      // TODO: end game if checkmate or stalemate
      const q_ = to.q - from.q;
      const r_ = to.r - from.r;
      const abs = Math.abs;
      // TODO: Validate all moves (and captures) by piece.
      switch (game.board[from.q][from.r]?.[0]) {
        case "K":
          if (abs(q_) > 2 || abs(r_) > 2 || abs(q_ + r_) > 1) {
            return (ctx.response.status = 400);
          }
          break;
        case "Q":
          throw new Error("TODO");
          break;
        case "R":
          throw new Error("TODO");
          break;
        case "N":
          throw new Error("TODO");
          break;
        case "B":
          if (
            !(q_ === r_ || 2 * abs(q_) === abs(r_) || 2 * abs(r_) === abs(q_))
          ) {
            return (ctx.response.status = 400);
          }
          throw new Error("TODO");
          break;
        case "P":
          // TODO: direction based on board[from.q][from.r]?.[1]
          throw new Error("TODO");
          break;
        default:
          return (ctx.response.status = 400);
      }

      // TODO: insert stuff

      // games[id].board[to.q][to.r] = games[id].board[from.q][from.r];
      // games[id].board[from.q][from.r] = null;
      // games[id].history.push([ [from.q, from.r], [to.q, to.r] ]);
    });

    ctx.response.status = 204;
  } catch (e) {
    ctx.response.status = parseInt(e) || 500;
  }
});

// APP ////////////////////////////////////////////////////////////////////////

export const app = new Application();

app.use(async (context, next) => {
  try {
    await context.send({
      // TODO: use dist instead
      root: `${Deno.cwd()}/src`,
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

app.listen({ port: parseInt(Deno.env.get(`PORT`) ?? ``) || 8666 });
