import { program } from '@commander-js/extra-typings'
import { createLogger, transports, format } from 'winston'
import { runShellCommandWithRealTimeLogging } from './common.mjs'
import { AUTH_REVISION_STAMP_FILE, BASE_PNPM_I_COMMAND, DEPLOYED_PNPM_I_COMMAND, GIT_SUBMODULE_COMMAND, LFA_PACKAGES, PNPM_BUILD_COMMAND } from './const.mjs'
import colors from 'ansi-colors'
import { execFileSync } from 'node:child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// The revision the auth submodule is currently checked out at, or undefined if it can't be read
// (e.g. a deployed tarball with no git metadata).
const readAuthRevision = (lfaModuleDir, logger) => {
  try {
    return execFileSync('git', ['-C', lfaModuleDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch (err) {
    logger.warn(`Couldn't read the auth submodule revision, leaving any existing LFA packages in place`)
    logger.verbose(err.message)
    return undefined
  }
}

program.name('pnpm run bootstrap').description('QSS Bootstrapper Utility')

program
  .description('Bootstrap the QSS application including initializing submodules, setting up the workspace, installing dependencies and compiling application code')
  .option('-v, --verbose', 'Verbose mode', false)
  .option('-r, --reinstall', 'Force reinstall of dependencies', false)
  .option('-s, --skip-submodules', 'Skip initializing/symlinking submodule(s) (e.g. LFA)', false)
  .option('-c, --copy-submodules', 'Create hard copies of submodule directories rather than symlinks', false)
  .option('-d, --deployed', 'Run bootstrap in a deployed environment', false)
  .option('-m, --skip-submodule-pull', `Don't pull submodules from git`, false)
  .action(async (options) => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const spawnOptions = {
      cwd: path.join(__dirname, '../'),
      shell: true
    }
    const logger = createLogger({
      level: options.verbose ? 'silly' : 'info',
      transports: [
        new transports.Console({
          format: format.combine(
            format.cli({ all: true }),
            format.splat(),
            format.timestamp(),
            format.errors(),
            format.printf(
              info =>
                `${colors.whiteBright.bold(info.timestamp)} ${colors.italic(info.level).trim()}: ${colors.bold(info.message)}`,
            ),
          ),
        }),
      ]
    })

    logger.info(`Starting bootstrap process`)

    if (options.skipSubmodules) {
      logger.warn(`Skipping submodule initialization - NOTE: the install and build will fail if you haven't done this previously!`)
    } else {
      if (!options.skipSubmodulePull) {
        logger.info(`Initializing git submodules`)
        await runShellCommandWithRealTimeLogging(GIT_SUBMODULE_COMMAND, logger, [], spawnOptions)
      } else {
        logger.warn(`Skipping submodule pull from git - NOTE: the install and build will fail if you haven't done this previously!`)
      }

      logger.info(`Ensuring package directories exist`)
      const authPkgDir = path.join(__dirname, '../auth-packages')
      const authPkgLfaDir = path.join(authPkgDir, '/lfa')

      if (!fs.existsSync(authPkgDir)) {
        logger.warn(`"auth-packages" directory was missing, creating now`)
        fs.mkdirSync(authPkgDir)
      }

      if (!fs.existsSync(authPkgLfaDir)) {
        logger.warn(`"auth-packages/lfa" directory was missing, creating now`)
        fs.mkdirSync(authPkgLfaDir)
      }

      const symlinkMessageInnerText = options.copySubmodules ? 'directories are copied' : 'symlinks are created'
      logger.info(`Ensuring LFA package ${symlinkMessageInnerText}`)
      const lfaModuleDir = path.join(__dirname, '../3rd-party/auth')
      const lfaModulePkgDir = path.join(lfaModuleDir, '/packages')

      // Symlinks always follow the submodule, but copies don't: checking out another release branch
      // moves the auth pin and silently leaves the copies behind. Stamp the revision we copied from
      // and re-copy whenever it no longer matches.
      const authRevisionStamp = path.join(authPkgLfaDir, AUTH_REVISION_STAMP_FILE)
      const authRevision = options.copySubmodules ? readAuthRevision(lfaModuleDir, logger) : undefined
      const copiedRevision = fs.existsSync(authRevisionStamp) ? fs.readFileSync(authRevisionStamp, 'utf8').trim() : undefined
      const staleCopies = authRevision != null && copiedRevision !== authRevision
      if (staleCopies && copiedRevision != null) {
        logger.warn(`LFA packages were copied from auth ${copiedRevision} but the submodule is at ${authRevision}, re-copying now`)
      }

      for (const pkg of LFA_PACKAGES) {
        const pkgDir = path.join(authPkgLfaDir, pkg)
        const targetDir = path.join(lfaModulePkgDir, pkg)
        const exists = fs.existsSync(pkgDir)
        if (exists && !(options.copySubmodules && staleCopies)) {
          continue
        }

        if (options.copySubmodules) {
          const logMessage = exists ? `LFA package ${pkg} is stale, re-copying to workspace directory now` : `LFA package ${pkg} wasn't copied to workspace directory, copying now`
          logger.warn(logMessage)
          logger.verbose(`${targetDir} -> ${pkgDir}`)
          // Drop the old copy wholesale: it carries a dist/ and node_modules built against the
          // previous revision. The install and build steps below recreate both.
          fs.rmSync(pkgDir, { recursive: true, force: true })
          fs.cpSync(targetDir, pkgDir, { recursive: true })
          continue
        }

        logger.warn(`Symlink for LFA package ${pkg} was missing, creating now`)
        logger.verbose(`${targetDir} -> ${pkgDir}`)
        fs.symlinkSync(targetDir, pkgDir, 'dir')
      }

      const lfaTsConfig = path.join(lfaModuleDir, 'tsconfig.json')
      const authPkgTsConfig = path.join(authPkgDir, 'tsconfig.json')
      if (options.copySubmodules && staleCopies && fs.existsSync(authPkgTsConfig)) {
        logger.verbose(`Refreshing LFA tsconfig.json alongside the re-copied packages`)
        fs.rmSync(authPkgTsConfig, { force: true })
      }
      if (!fs.existsSync(authPkgTsConfig)) {
        const logMessage = options.copySubmodules ? `LFA tsconfig.json wasn't copied, copying now` : `LFA tsconfig.json symlink was missing, creating now` 
        logger.warn(logMessage)
        logger.verbose(`${lfaTsConfig} -> ${authPkgTsConfig}`)
        if (options.copySubmodules) {
          fs.cpSync(lfaTsConfig, authPkgTsConfig)
        } else {
          fs.symlinkSync(lfaTsConfig, authPkgTsConfig, 'file')
        }
      }

      if (authRevision != null) {
        fs.writeFileSync(authRevisionStamp, `${authRevision}\n`)
        logger.verbose(`LFA packages copied from auth ${authRevision}`)
      }
    }

    logger.info(`Installing dependencies`)
    const pnpmICommand = options.deployed ? DEPLOYED_PNPM_I_COMMAND : BASE_PNPM_I_COMMAND
    await runShellCommandWithRealTimeLogging(pnpmICommand, logger, options.reinstall ? ['--force'] : [], spawnOptions)

    logger.info(`Compiling application`)
    await runShellCommandWithRealTimeLogging(PNPM_BUILD_COMMAND, logger, [], spawnOptions)

    logger.info(`Done!`)
  })

program.parse(process.argv)