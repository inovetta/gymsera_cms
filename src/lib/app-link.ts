/**
 * Where "Continue in the GymsEra app" goes. The web sells no App Store or Play plans (spec
 * §0.1 R-1/R-7: no card sales on the web), so anything that needs more capacity is finished in
 * the app. No store URL is recorded in the docs; set NEXT_PUBLIC_GYMSERA_APP_URL to the
 * download or deep-link page, otherwise the public website is used.
 */
export const GYMSERA_APP_URL = process.env.NEXT_PUBLIC_GYMSERA_APP_URL || 'https://gymsera.com'
