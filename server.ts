// IMPORTS ////////////////////////////////////////////////////////////////////

import { Application, Router } from "https://deno.land/x/oak@v12.1.0/mod.ts";

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

const router = new Router();

router.post("/signup", async ctx => {
  const { email, username, password } = await ctx.request.body().value;
  const [{ usr_id } = { usr_id: null }] = await sql`
    insert into usr (email, username, password)
    values (${email}, crypt(${username}, gen_salt('bf')), ${password})
    returning *
  `;
  await ctx.cookies.set("usr_id", usr_id);
  ctx.response.status = 204;
});

router.post("/login", async ctx => {
  const { username, password } = await ctx.request.body().value;
  const [{ usr_id } = { usr_id: null }] = await sql`
    select usr_id from usr 
    where username = ${username} 
      and password = crypt(${password}, password)
  `;
  await ctx.cookies.set("usr_id", usr_id);
  ctx.response.status = 204;
});

router.get("/game", async ctx => {
  const usr_id = (await ctx.cookies.get("usr_id")) ?? null;
  const [games] = await sql`
    select null
    , jsonb_agg
      ( select game_id
        , _white_username as white_username
        , _black_username as black_username
        , _win_username as win_username
        , white_usr_id
        , black_usr_id
        , points
        from game 
        where is_public is true 
          and (white_usr_id is null or black_usr_id is null)
        order by created_at desc
      ) as pending
    , jsonb_agg
      ( select game_id
        , _white_username as white_username
        , _black_username as black_username
        , white_usr_id
        , black_usr_id
        , points
        from game 
        where is_public is true 
          and white_usr_id is not null 
          and black_usr_id is not null 
          and points is null
          and now() - created_at < interval '1 day'
        order by created_at desc
      ) as active
    , jsonb_agg
      ( select game_id
        , _white_username as white_username
        , _black_username as black_username
        , white_usr_id
        , black_usr_id
        , points
        from game 
        where is_public is true and points is not null
        order by created_at desc
        limit 100
      ) as recent
    , jsonb_agg
      ( select game_id
        , _white_username as white_username
        , _black_username as black_username
        , white_usr_id
        , black_usr_id
        , points
        from game 
        where white_usr_id = ${usr_id} or black_usr_id = ${usr_id}
        order by created_at desc
      ) as personal
  `;
  ctx.response.body = games;
  ctx.response.status = 200;
});

router.post("/game", async ctx => {
  const usr_id = (await ctx.cookies.get("usr_id")) ?? null;
  const id = (Math.random() + 1).toString(36).substring(4);
  const ____ = 0;
  const board = [
    //////////////////////////////////////////////////////////////////
    [____, ____, ____, ____, ____, null, null, null, null, null, null],
    //////////////////////////////////////////////////////////////////
    [____, ____, ____, ____, "PB", null, null, null, null, null, "PW"],
    //////////////////////////////////////////////////////////////////
    [____, ____, ____, "RB", "PB", null, null, null, null, "PW", "RW"],
    //////////////////////////////////////////////////////////////////
    [____, ____, "NB", null, "PB", null, null, null, "PW", null, "NW"],
    //////////////////////////////////////////////////////////////////
    [____, "QB", null, null, "PB", null, null, "PW", null, null, "QW"],
    //////////////////////////////////////////////////////////////////
    ["BB", "BB", "BB", null, "PB", null, "PW", null, "BW", "BW", "BW"],
    //////////////////////////////////////////////////////////////////
    ["KB", null, null, "PB", null, null, "PW", null, null, "KW", ____],
    //////////////////////////////////////////////////////////////////
    ["NB", null, "PB", null, null, null, "PW", null, "NW", ____, ____],
    //////////////////////////////////////////////////////////////////
    ["RB", "PB", null, null, null, null, "PW", "RW", ____, ____, ____],
    //////////////////////////////////////////////////////////////////
    ["PB", null, null, null, null, null, "PW", ____, ____, ____, ____],
    //////////////////////////////////////////////////////////////////
    [null, null, null, null, null, null, ____, ____, ____, ____, ____],
    //////////////////////////////////////////////////////////////////
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
    select g.*, jsonb_agg(move.*) as moves
    from game g
    left join move m using (game_id)
    group by g.game_id
    where game_id = ${ctx.params.game_id}
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

// TODO: add signature keys for cookies

// TODO: Add rate-limiting.

app.use(router.routes());
app.use(router.allowedMethods());

app.listen({ port: parseInt(Deno.env.get(`PORT`) ?? ``) || 6666 });
