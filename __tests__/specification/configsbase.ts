import { Mutex } from 'async-mutex'
export const configDir = '__tests__/specification/config-dir'
export const dataDir = '__tests__/specification/data-dir'
export let singleMutex = new Mutex()
