import { spawn } from 'node:child_process'

export const runShellCommandWithRealTimeLogging = async (command, logger, args = [], options = { shell: true }) => {
  const childProcess = spawn(command, args, options);

  childProcess.stdout.on('data', (data) => {
    logger.verbose(data)
  })

  childProcess.stderr.on('data', (data) => {
    logger.error(data)
  })

  childProcess.on('error', (err) => {
   logger.error('Failed to start subprocess.', err)
  })

  await new Promise( (resolve) => {
    childProcess.on('close', (code) => {
      const message = `child process exited with code ${code}`
      if (code === 0) {
        logger.verbose(message)
      } else {
        logger.error(message)
      }
      resolve()
    })
  })
}