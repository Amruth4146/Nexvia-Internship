import { getElasticClient } from '../config/elasticsearch.js';
import { config } from '../config/env.js';

const INDEX_NAME = 'products_index';

export const searchService = {
  initIndex: async () => {
    if (!config.elasticsearch.enabled) return;
    try {
      const client = getElasticClient();
      if (!client) return;
      const exists = await client.indices.exists({ index: INDEX_NAME });
      if (!exists) {
        await client.indices.create({
          index: INDEX_NAME,
          body: {
            mappings: {
              properties: {
                id: { type: 'keyword' },
                title: { type: 'text', analyzer: 'standard' },
                description: { type: 'text' },
                brand: { type: 'keyword' },
                category: { type: 'keyword' },
                categoryId: { type: 'keyword' },
                price: { type: 'scaled_float', scaling_factor: 100 },
                discountPrice: { type: 'scaled_float', scaling_factor: 100 },
                averageRating: { type: 'float' },
                reviewCount: { type: 'integer' },
                stock: { type: 'integer' },
                status: { type: 'keyword' },
                createdAt: { type: 'date' },
              },
            },
          },
        });
        console.log(`[Elasticsearch] Initialized index: ${INDEX_NAME}`);
      }
    } catch (err) {
      console.warn(`[Elasticsearch Init Warning] ${err.message}`);
    }
  },

  indexProduct: async (product) => {
    if (!config.elasticsearch.enabled) return;
    try {
      const client = getElasticClient();
      if (!client) return;
      await client.index({
        index: INDEX_NAME,
        id: product._id.toString(),
        document: {
          id: product._id.toString(),
          title: product.title,
          description: product.description,
          brand: product.brand || '',
          categoryId: product.categoryId?.toString() || '',
          price: product.price,
          discountPrice: product.discountPrice || null,
          averageRating: product.averageRating || 0,
          reviewCount: product.reviewCount || 0,
          stock: product.stock,
          status: product.status,
          createdAt: product.createdAt,
        },
      });
    } catch (err) {
      console.warn(`[Elasticsearch Index Warning] ID: ${product._id} - ${err.message}`);
    }
  },

  removeProduct: async (productId) => {
    if (!config.elasticsearch.enabled) return;
    try {
      const client = getElasticClient();
      if (!client) return;
      await client.delete({
        index: INDEX_NAME,
        id: productId.toString(),
      });
    } catch (err) {
      console.warn(`[Elasticsearch Delete Warning] ID: ${productId} - ${err.message}`);
    }
  },

  search: async (queryText, filters = {}) => {
    if (!config.elasticsearch.enabled) return null;
    try {
      const client = getElasticClient();
      if (!client) return null;
      const { categoryId, minPrice, maxPrice, sort, page = 1, limit = 12 } = filters;

      const must = [];
      const filter = [{ term: { status: 'published' } }];

      if (queryText) {
        must.push({
          multi_match: {
            query: queryText,
            fields: ['title^3', 'description', 'brand^2'],
            fuzziness: 'AUTO',
          },
        });
      } else {
        must.push({ match_all: {} });
      }

      if (categoryId) {
        filter.push({ term: { categoryId } });
      }

      if (minPrice !== undefined || maxPrice !== undefined) {
        const range = {};
        if (minPrice !== undefined) range.gte = Number(minPrice);
        if (maxPrice !== undefined) range.lte = Number(maxPrice);
        filter.push({ range: { price: range } });
      }

      let sortOption = [{ createdAt: { order: 'desc' } }];
      if (sort === 'price_asc') sortOption = [{ price: { order: 'asc' } }];
      else if (sort === 'price_desc') sortOption = [{ price: { order: 'desc' } }];
      else if (sort === 'rating') sortOption = [{ averageRating: { order: 'desc' } }];

      const from = (parseInt(page, 10) - 1) * parseInt(limit, 10);

      const response = await client.search({
        index: INDEX_NAME,
        body: {
          from,
          size: parseInt(limit, 10),
          query: {
            bool: {
              must,
              filter,
            },
          },
          sort: sortOption,
        },
      });

      const hits = response.hits.hits.map((h) => h._source);
      const total =
        typeof response.hits.total === 'number'
          ? response.hits.total
          : response.hits.total?.value || 0;

      return {
        products: hits,
        total,
      };
    } catch (err) {
      console.warn(`[Elasticsearch Search Warning] Falling back to MongoDB: ${err.message}`);
      return null;
    }
  },
};
