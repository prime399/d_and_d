import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? '',
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  // Pins `sanity deploy` to a hostname; override with --url if taken.
  studioHost: process.env.SANITY_STUDIO_HOSTNAME || undefined,
})
