type SitesEnv = {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

export default {
  fetch(request: Request, env: SitesEnv) {
    return env.ASSETS.fetch(request)
  },
}
