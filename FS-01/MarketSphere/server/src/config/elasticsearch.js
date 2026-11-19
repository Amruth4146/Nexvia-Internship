import { Client } from '@elastic/elasticsearch';
import { config } from './env.js';

let esClient = null;

export const getElasticClient = () => {
  if (!config.elasticsearch.enabled) {
    return null;
  }

  if (!esClient) {
    const options = {
      node: config.elasticsearch.node || 'http://localhost:9200',
    };

    if (config.elasticsearch.username && config.elasticsearch.password) {
      options.auth = {
        username: config.elasticsearch.username,
        password: config.elasticsearch.password,
      };
    }

    esClient = new Client(options);
  }
  return esClient;
};

export const checkElasticConnection = async () => {
  if (!config.elasticsearch.enabled) {
    console.log('[Elasticsearch] Disabled: using MongoDB product search engine');
    return false;
  }

  try {
    const client = getElasticClient();
    if (!client) return false;
    const health = await client.cluster.health({});
    console.log(`[Elasticsearch] Cluster status: ${health.status}`);
    return true;
  } catch (error) {
    console.warn(`[Elasticsearch] Connection warning: ${error.message}`);
    return false;
  }
};

export const closeElasticClient = async () => {
  if (esClient) {
    try {
      await esClient.close();
    } catch (e) {
      // ignore
    }
    esClient = null;
  }
};

