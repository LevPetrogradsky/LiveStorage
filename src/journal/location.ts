export type ApproximateLocation = { latitude: number; longitude: number }

export function approximateLocation(latitude: number, longitude: number): ApproximateLocation {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error('Invalid location')
  }
  return { latitude: Math.round(latitude * 10) / 10, longitude: Math.round(longitude * 10) / 10 }
}

export function requestApproximateLocation(geolocation: Pick<Geolocation, 'getCurrentPosition'>): Promise<ApproximateLocation> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(position => {
      try { resolve(approximateLocation(position.coords.latitude, position.coords.longitude)) }
      catch (error) { reject(error) }
    }, reject, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 })
  })
}

export function validApproximateLocation(value: unknown): value is ApproximateLocation {
  if (!value || typeof value !== 'object' || !('latitude' in value) || !('longitude' in value)) return false
  const { latitude, longitude } = value
  return typeof latitude === 'number' && typeof longitude === 'number' &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 &&
    Math.abs(latitude * 10 - Math.round(latitude * 10)) < 1e-8 &&
    Math.abs(longitude * 10 - Math.round(longitude * 10)) < 1e-8
}

export function locationLabel(location: ApproximateLocation, language: 'en' | 'ru'): string {
  const lat = `${Math.abs(location.latitude).toFixed(1)}°${location.latitude < 0 ? 'S' : 'N'}`
  const lon = `${Math.abs(location.longitude).toFixed(1)}°${location.longitude < 0 ? 'W' : 'E'}`
  return `${language === 'ru' ? 'Примерно' : 'Approx.'} ${lat}, ${lon}`
}
