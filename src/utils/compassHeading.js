// Phone compass, as a fallback for the heading-up map ONLY while walking
// slowly with no GPS course and not enough path yet (see headingTracker).
// Never the main source: a phone held while running swings around.
//   iOS:     DeviceOrientationEvent.webkitCompassHeading (clockwise from
//            magnetic north). Only fires once the Motion & Orientation
//            permission was granted - useRunTracker already asks for it at
//            run start (DeviceMotionEvent.requestPermission), one prompt
//            covers both.
//   Android: 'deviceorientationabsolute' (alpha counter-clockwise from north).

// Degrees clockwise from north, or null when this event has no usable one.
export function headingFromOrientationEvent(e) {
  if (!e) return null
  if (typeof e.webkitCompassHeading === 'number') {
    // webkitCompassAccuracy < 0 means "uncalibrated / invalid".
    if (e.webkitCompassAccuracy != null && e.webkitCompassAccuracy < 0)
      return null
    return ((e.webkitCompassHeading % 360) + 360) % 360
  }
  if (e.absolute === true && typeof e.alpha === 'number') {
    return (360 - (((e.alpha % 360) + 360) % 360)) % 360
  }
  return null
}

// cb(degrees, timestampMs). Returns an unsubscribe function.
export function subscribeCompass(cb) {
  if (typeof window === 'undefined') return () => {}
  const onEvent = (e) => {
    const deg = headingFromOrientationEvent(e)
    if (deg !== null) cb(deg, Date.now())
  }
  window.addEventListener('deviceorientationabsolute', onEvent)
  window.addEventListener('deviceorientation', onEvent)
  return () => {
    window.removeEventListener('deviceorientationabsolute', onEvent)
    window.removeEventListener('deviceorientation', onEvent)
  }
}
