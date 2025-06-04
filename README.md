# QSS

## Description

Quiet Storage Service (QSS)

## Installation

### Preparation

The Node engine is managed via Volta and should be installed prior to running anything in this README.  Instructions for installing volta can be found [here](https://docs.volta.sh/guide/getting-started).

*NOTE: Because QSS uses `pnpm` you should add `VOLTA_FEATURE_PNPM=1` to an environment file in your shell (e.g. `.zshrc`).*

#### Installing Node engine

Once Volta is installed navigating to this directory should automatically install and use the correct versions of `node` and `npm` but as a first time setup you can manually install both

```bash
$ volta install node@22.14.0
$ volta install npm@10.9.0
```

Once `node` and `npm` are installed via Volta you can install `pnpm`

```bash
$ volta install pnpm@10.6.0
```

#### Docker

You must install `Docker` to run QSS locally as we rely on it to run dependencies like `Postgres`.

##### Linux

Follow the instructions for your distribution on the Docker website [here](https://docs.docker.com/engine/install/).

##### Mac

You can either install via [Docker Desktop](https://docs.docker.com/desktop/) or through brew:

```bash
$ brew install docker
$ brew install docker-compose
$ brew install colima
$ colima start

### Dependencies and building the app

```bash
$ pnpm run bootstrap
```

This will build all submodules, install dependencies and build the application.

## Running commands on the app package.json

Many commands are mapped onto the root `package.json` but for any other pnpm commands you can run them via

```bash
$ pnpm run run:app <command>
```

## Running the app

```bash
# local
$ pnpm run start

# local with debug on
$ pnpm run start:debug

# runs against development databases/services
# NOTE: Don't use this locally if you don't know what you're doing!
$ pnpm run start:dev

# runs against production databases/services
# NOTE: Don't use this locally if you don't know what you're doing!
$ pnpm run start:prod
```

_NOTE: Running with `start` and `start:debug` will spin up dockerized dependencies (e.g. postgres) and run database migrations_

## Running the app in docker

```bash
# spin up complete docker environment
$ pnpm run run:app docker:up:test

# spin down complete docker environment
$ pnpm run run:app docker:down:test
```

_NOTE: Running this spins up services in a different container from the one used in pnpm run start and is used for Quiet E2E tests._

## Running the client

```bash
# runs client against local server (you must start the server in a separate terminal!)
$ pnpm run start:client

# runs client against development server in AWS
$ pnpm run start:client:dev
```

## Database migrations

```bash
# create a new migration
$ pnpm run migrate

# migrate database with existing migrations
$ pnpm run run:app migrate:up
```

## Test

```bash
# unit tests
$ pnpm run run:app test

# e2e tests
$ pnpm run run:app test:e2e

# test coverage
$ pnpm run run:app test:cov
```

## Linting and Formatting

We use `eslint` and `prettier` to format code as well as a `husky` precommit hook to verify formatting on commits.

```bash
# run prettier
$ pnpm run format

# run prettier with auto-fix
$ pnpm run format:fix

# run eslint
$ pnpm run lint

# run eslint with auto-fix
$ pnpm run lint:fix

# run prettier and eslint -> NOTE: this is run as the precommit hook via husky and lint-staged
$ pnpm run format:lint

# run prettier and eslint with auto-fix
$ pnpm run format:lint:fix
```
