export const LFA_PACKAGES = ['auth', 'auth-provider-automerge-repo', 'crdx', 'crypto', 'shared']

export const GIT_SUBMODULE_COMMAND = 'git submodule update --init --recursive --remote'
export const BASE_PNPM_I_COMMAND = 'yes | pnpm -w run install:deps'
export const DEPLOYED_PNPM_I_COMMAND = 'pnpm -w run install:deps:deployed'
export const PNPM_BUILD_COMMAND = 'pnpm -w run build'
