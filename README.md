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
$ volta install node@22.11.0
$ volta install npm@10.9.0
```

Once `node` and `npm` are installed via Volta you can install `pnpm`

```bash
$ volta install pnpm@10.4.1
```

### Dependencies

```bash
$ pnpm i
```

### Building the app

```bash
$ pnpm run build
```

## Running the app

```bash
# development with watch mode
$ pnpm run start:dev

# development with watch mode and debug on
$ pnpm run start:debug

# development using compiled code
$ pnpm run start:dist:dev

# production mode
$ pnpm run start:dist:prod
```

## Test

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
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
