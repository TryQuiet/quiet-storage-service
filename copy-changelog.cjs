const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname)
const appPkgDir = path.resolve(rootDir, 'app')
const rootChangelog = fs.readFileSync(path.resolve(rootDir, 'CHANGELOG.md'), 'utf8')

fs.writeFileSync(path.resolve(appPkgDir, 'CHANGELOG.md'), rootChangelog)
