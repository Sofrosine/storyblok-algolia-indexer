const axios = require('axios')
const algoliasearch = require('algoliasearch')
const StoryblokClient = require('storyblok-js-client')

class StoryblokAlgoliaIndexer {
  constructor({
    algoliaAppId,
    algoliaApiAdminToken,
    algoliaIndexName,
    storyblokContentDeliveryApiToken,
    options
  }) {
    const algolia = algoliasearch(algoliaAppId, algoliaApiAdminToken)
    const storyblok = new StoryblokClient({ accessToken: storyblokContentDeliveryApiToken })

    const storyblokOptions = options || {
      starts_with: '',
      per_page: 100,
      page: 1,
      version: 'draft'
    }

    storyblok.get(`cdn/stories/`, storyblokOptions).then(async res => {
      const total = res.headers.total
      const maxPage = Math.ceil(total / storyblokOptions.per_page)
   
      let contentRequests = []
      for (let page = 1; page <= maxPage; page++) {
          contentRequests.push(storyblok.get(`cdn/stories/`, { ...storyblokOptions, page }))
      }
   
      const index = algolia.initIndex(algoliaIndexName)
   
      axios.all(contentRequests).then(axios.spread(async (...responses) => {
          let records = []
          responses.forEach((response) => {
              let data = response.data
              records = records.concat(data.stories)
          })

          records.forEach(record => {
              record.objectID = record.uuid
          })
          
          await index.saveObjects(records, { autoGenerateObjectIDIfNotExist: false }).wait().catch(e => { console.log(e) })
          console.log('Index stored with ' + records.length + ' Entries.')
      })).catch(e => { console.log(e) })
    }).catch(e => { console.log(e) })
  }
}

module.exports = StoryblokAlgoliaIndexer
