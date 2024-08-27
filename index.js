const axios = require('axios');
const algoliasearch = require('algoliasearch');
const StoryblokClient = require('storyblok-js-client');

class StoryblokAlgoliaIndexer {
  constructor({
    algoliaAppId,
    algoliaApiAdminToken,
    storyblokContentDeliveryApiToken,
    options
  }) {
    const algolia = algoliasearch(algoliaAppId, algoliaApiAdminToken);
    const storyblok = new StoryblokClient({ accessToken: storyblokContentDeliveryApiToken });

    const storyblokOptions = options || {
      starts_with: '',
      per_page: 100,
      page: 1,
      version: 'draft'
    };

    // Fetch the initial set of stories to determine pagination
    storyblok.get('cdn/stories/', storyblokOptions).then(async res => {
      const total = res.headers.total;
      const maxPage = Math.ceil(total / storyblokOptions.per_page);

      let contentRequests = [];
      for (let page = 1; page <= maxPage; page++) {
        contentRequests.push(storyblok.get('cdn/stories/', { ...storyblokOptions, page }));
      }

      // Make all requests in parallel using axios
      axios.all(contentRequests).then(axios.spread(async (...responses) => {
        const groupedRecords = {}; // Object to store records grouped by component type

        // Group records by component type
        responses.forEach((response) => {
          const stories = response.data.stories;

          stories.forEach(story => {
            const content = story.content;
            const component = content.component;
            
            if (!groupedRecords[component]) {
              groupedRecords[component] = [];
            }

            content.objectID = content._uid; // Set Algolia objectID
            groupedRecords[component].push(content);
          });
        });

        // Save each group to a separate Algolia index
        for (const component in groupedRecords) {
          if (groupedRecords.hasOwnProperty(component)) {
            const indexName = component
            const index = algolia.initIndex(indexName);
            const records = groupedRecords[component];

            await index.saveObjects(records, { autoGenerateObjectIDIfNotExist: false }).wait().catch(e => {
              console.error(`Error indexing component ${component}:`, e);
            });

            console.log(`Index '${indexName}' stored with ${records.length} entries.`);
          }
        }
      })).catch(e => { console.error('Error with Axios requests:', e) });
    }).catch(e => { console.error('Error fetching stories from Storyblok:', e) });
  }
}

module.exports = StoryblokAlgoliaIndexer;
