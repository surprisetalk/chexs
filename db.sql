create schema public;

create extension if not exists pgcrypto;

create extension if not exists hstore;

create domain ntext text check ( value <> '' );

create domain url text check ( value ~ '^https?://[^\s/$.?#].[^\s]*$' );

create domain email citext check ( value ~ '^.+@.+[.].+$' );

create table usr
( usr_id bigint not null primary key generated always as identity
, email email not null unique
, username ntext not null unique check ( username ~ '[-_a-zA-Z0-9]{3,16}' )
, password text not null
, bio ntext check ( length(bio) < 180 )
, created_at timestamptz not null default now()
, updated_at timestamptz not null default now()
)
;

create table game
( game_id text not null primary key
, white_usr_id bigint not null references usr (usr_id)
, black_usr_id bigint references usr (usr_id)
, points real
, is_public boolean not null
, _board text[] not null
, _white_username ntext
, _black_username ntext
, created_at timestamptz not null default now()
, updated_at timestamptz not null default now()
)
;

create table move
( game_id text not null references game (game_id)
, _piece char(2) not null
, piece_from_q smallint not null
, piece_from_r smallint not null
, piece_to_q smallint not null
, piece_to_r smallint not null
, created_at timestamptz not null default now()
)
;
