// src/logger.js
import { createConsola } from 'consola'

const seqUrl = 'http://localhost:5341/api/events/raw'
const levelMap = {
  trace: 'Verbose',
  debug: 'Debug',
  info:  'Information',
  warn:  'Warning',
  error: 'Error',
  fatal: 'Fatal',
}

// build a Seq‐shipping reporter for a given module/tag
function makeSeqReporter(moduleName) {
  return {
    log: async logObj => {
      // envelope as Seq expects
      const payload = {
        Events: [{
          Timestamp:       logObj.date,
          Level:           levelMap[logObj.type] || 'Information',
          MessageTemplate: logObj.args[0],
          Properties: {
            module: moduleName,
            args:   logObj.args.slice(1)
          }
        }]
      }

      try {
        const res = await fetch(seqUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload)
        })
        if (!res.ok) {
          const errText = await res.text()
          console.error(`Seq ingestion failed (${res.status}):`, errText)
        }
      }
      catch (err) {
        console.warn('Network error shipping log to Seq:', err)
      }
    }
  }
}

/**
 * Create a logger for a given module.
 *
 * @param {string} moduleName  — the name you want attached to every event
 * @param {object} [options]   — optional Consola createConsola options (e.g. { level: 'debug' })
 * @returns {Consola}           — a logger that prints locally & ships to Seq with your module name
 */
export function getLogger(moduleName, options = {}) {
  // 1) make a fresh Consola instance (with default console reporter)
  const logger = createConsola(options)

  // 2) wire up the Seq reporter for this module
  logger.addReporter(makeSeqReporter(moduleName))

  // 3) tag all messages so logObj.tag === moduleName
  return logger.withTag(moduleName)
}