// Scripted GPS: real Chrome geolocation never calls back in headless runs
// here, which leaves the game on its loading screen. One fixed fix, Kathmandu.
export async function scriptGps(page) {
  await page.addInitScript(() => {
    const fix = () => ({
      coords: { latitude: 27.7172, longitude: 85.324, accuracy: 5 },
      timestamp: Date.now(),
    })
    navigator.geolocation.getCurrentPosition = (ok) => ok(fix())
    navigator.geolocation.watchPosition = (ok) => {
      setTimeout(() => ok(fix()), 50)
      return 1
    }
    navigator.geolocation.clearWatch = () => {}
  })
}
