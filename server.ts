// IMPORTS ////////////////////////////////////////////////////////////////////

import { Application, Router } from "https://deno.land/x/oak/mod.ts";

import pg from "https://deno.land/x/postgresjs@v3.3.4/mod.js";

// PG /////////////////////////////////////////////////////////////////////////

export const sql = pg(
  Deno.env.get(`DATABASE_URL`)?.replace(/flycast/, "internal") ??
    `postgres://taylor:password1234@localhost:5432/chexs`,
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

router.get("/game", async ctx => {
  const usr_id = ctx.state.usr_id ?? null;
  const [games] = await sql`
    select null
    , jsonb_agg
      ( select game_id
        , _white_username as white_username
        , _black_username as black_username
        , white_usr_id as white_usr_id
        , black_usr_id as black_usr_id
        from game 
        where is_public is true 
          and (white_usr_id is null or black_usr_id is null)
        order by created_at desc
      ) as pending
    , jsonb_agg
      ( select game_id
        , _white_username as white_username
        , _black_username as black_username
        , white_usr_id as white_usr_id
        , black_usr_id as black_usr_id
        from game 
        where is_public is true 
          and white_usr_id is not null 
          and black_usr_id is not null 
          and _is_checkmate is false 
          and now() - created_at < interval '1 day'
        order by created_at desc
      ) as active
    , jsonb_agg
      ( select game_id
        , _white_username as white_username
        , _black_username as black_username
        , white_usr_id as white_usr_id
        , black_usr_id as black_usr_id
        , _is_checkmate as is_checkmate 
        from game 
        where is_public is true and _is_checkmate is true
        order by created_at desc
        limit 100
      ) as recent
    , jsonb_agg
      ( select game_id
        , _white_username as white_username
        , _black_username as black_username
        , white_usr_id as white_usr_id
        , black_usr_id as black_usr_id
        , _is_checkmate as is_checkmate 
        from game 
        where white_usr_id = ${usr_id} or black_usr_id = ${usr_id}
        order by created_at desc
      ) as personal
  `;
  ctx.response.body = games;
  ctx.response.status = 200;
});

router.post("/game", async ctx => {
  const black = await ctx.request.body().value;
  const id = (Math.random() + 1).toString(36).substring(7);
  const ____ = undefined;
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
  games[id] = { black, white: null, board, history: [] };
  lobbies.add(id);
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
  const id = ctx.params.game_id;
  const {
    color,
    usr_id,
    from,
    to,
  }: {
    color: "black" | "white";
    usr_id: string;
    from: { q: number; r: number };
    to: { q: number; r: number };
  } = await ctx.request.body().value;
  const { board, ...game } = { ...games[id] };
  if (!board) return (ctx.response.status = 404);
  if (!games[id][color]) games[id][color] = usr_id;
  lobbies.delete(id);
  if (game[color] !== usr_id) return (ctx.response.status = 403);
  if (!board[from.q][from.r]) return (ctx.response.status = 400);
  if (board[to.q][to.r] === undefined) return (ctx.response.status = 400);
  // TODO: end game if checkmate or stalemate
  const q_ = to.q - from.q;
  const r_ = to.r - from.r;
  const abs = Math.abs;
  // TODO: Validate all moves (and captures) by piece.
  switch (board[from.q][from.r]?.[0]) {
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
      if (!(q_ === r_ || 2 * abs(q_) === abs(r_) || 2 * abs(r_) === abs(q_))) {
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
  games[id].board[to.q][to.r] = games[id].board[from.q][from.r];
  games[id].board[from.q][from.r] = null;
  games[id].history.push([
    [from.q, from.r],
    [to.q, to.r],
  ]);
  ctx.response.status = 204;
});

// APP ////////////////////////////////////////////////////////////////////////

export const app = new Application();

// TODO: Add rate-limiting.

app.use(router.routes());
app.use(router.allowedMethods());

app.listen({ port: parseInt(Deno.env.get(`PORT`) ?? ``) || 6666 });
