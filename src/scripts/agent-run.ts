// Runs one watch cycle from the command line (the server also runs it on a schedule).
import '../env.js'
import { runAgent } from '../agent/run.js'

const run = await runAgent()
console.log(
  `checked ${run.itemsChecked} new items · ${run.hits} matches · ${run.verdicts} verdicts · ` +
    `${run.copies} copies · spent $${run.spentUsd ?? '?'}` +
    (run.stoppedBecause ? ` · stopped: ${run.stoppedBecause}` : ''),
)
