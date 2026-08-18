declare global {
  const MIO_VERSION: string
  const MIO_CHANNEL: string
}

export const InstallationVersion = typeof MIO_VERSION === "string" ? MIO_VERSION : "local"
export const InstallationChannel = typeof MIO_CHANNEL === "string" ? MIO_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
