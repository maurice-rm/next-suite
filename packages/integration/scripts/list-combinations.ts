import { COMBINATIONS } from '../src/combinations.ts'

process.stdout.write(`${JSON.stringify(COMBINATIONS.map(({ name }) => name))}\n`)
