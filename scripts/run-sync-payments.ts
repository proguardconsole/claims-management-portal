import { syncPayments } from '../lib/sync/syncPayments'

syncPayments()
  .then((result) => {
    console.log('DONE:', JSON.stringify(result))
    process.exit(0)
  })
  .catch((err) => {
    console.error('ERROR:', err)
    process.exit(1)
  })
