// @ts-nocheck
import type { Admin } from 'kafkajs';
import type { TopicConfig, TopicMetadata, PartitionInfo } from '../types';
import { TopicConfigSchema } from '../types';
import { RedpandaClient } from './redpanda-client';

// Optional pino import — peer dependency, may not be installed in all consumers
let pino: typeof import('pino') | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  pino = require('pino');
} catch {
  // pino not available — fall back to no-op logger
}

type PinoLogger = {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
};

const noopLogger: PinoLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * Topic naming convention:
 * - Core events: core.{domain}.{event} (e.g., core.tenant.created)
 * - Plugin events: plugin.{pluginId}.{event} (e.g., plugin.crm.contact.created)
 */
export class TopicManager {
  private admin: Admin;
  private log: PinoLogger;
  private defaultConfig: TopicConfig = {
    numPartitions: 3, // One partition per Redpanda node
    replicationFactor: 3, // Replicate across all nodes for HA
    retentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    cleanupPolicy: 'delete',
  };

  constructor(
    private client: RedpandaClient,
    logger?: PinoLogger
  ) {
    this.admin = client.getAdmin();
    this.log = logger ?? (pino ? pino({ name: 'topic-manager' }) : noopLogger);
  }

  /**
   * Create a topic with optional configuration
   */
  async createTopic(name: string, config?: TopicConfig): Promise<void> {
    try {
      // Validate topic name
      this.validateTopicName(name);

      // Validate and merge config
      const topicConfig = { ...this.defaultConfig, ...config };
      TopicConfigSchema.parse(topicConfig);

      // Check if topic already exists
      const exists = await this.topicExists(name);
      if (exists) {
        this.log.info({ topicName: name }, 'Topic already exists');
        return;
      }

      // Create topic
      await this.admin.createTopics({
        topics: [
          {
            topic: name,
            numPartitions: topicConfig.numPartitions,
            replicationFactor: topicConfig.replicationFactor,
            configEntries: [
              {
                name: 'retention.ms',
                value: String(topicConfig.retentionMs),
              },
              {
                name: 'cleanup.policy',
                value: topicConfig.cleanupPolicy!,
              },
              {
                name: 'compression.type',
                value: 'snappy', // Use Snappy compression for better performance
              },
            ],
          },
        ],
        waitForLeaders: true,
        timeout: 10000,
      });

      this.log.info({ topicName: name }, 'Topic created');
    } catch (error) {
      this.log.error({ topicName: name, error }, 'Failed to create topic');
      throw error;
    }
  }

  /**
   * Delete a topic
   */
  async deleteTopic(name: string): Promise<void> {
    try {
      const exists = await this.topicExists(name);
      if (!exists) {
        this.log.info({ topicName: name }, 'Topic does not exist, skipping delete');
        return;
      }

      await this.admin.deleteTopics({
        topics: [name],
        timeout: 10000,
      });

      this.log.info({ topicName: name }, 'Topic deleted');
    } catch (error) {
      this.log.error({ topicName: name, error }, 'Failed to delete topic');
      throw error;
    }
  }

  /**
   * List all topics
   */
  async listTopics(): Promise<string[]> {
    try {
      const topics = await this.admin.listTopics();
      return topics.filter((topic) => !topic.startsWith('__')); // Filter out internal topics
    } catch (error) {
      this.log.error({ error }, 'Failed to list topics');
      throw error;
    }
  }

  /**
   * Get topic metadata
   */
  async getTopicMetadata(topicName: string): Promise<TopicMetadata> {
    try {
      const metadata = await this.admin.fetchTopicMetadata({
        topics: [topicName],
      });

      const topic = metadata.topics[0];
      if (!topic) {
        throw new Error(`Topic not found: ${topicName}`);
      }

      const partitions: PartitionInfo[] = topic.partitions.map((partition) => ({
        partition: partition.partitionId,
        leader: partition.leader,
        replicas: partition.replicas,
        isr: partition.isr,
      }));

      return {
        name: topic.name,
        partitions,
      };
    } catch (error) {
      this.log.error({ topicName, error }, 'Failed to get topic metadata');
      throw error;
    }
  }

  /**
   * Get topic configuration
   */
  async getTopicConfig(topicName: string): Promise<Record<string, string>> {
    try {
      const resources = await this.admin.describeConfigs({
        includeSynonyms: false,
        resources: [
          {
            type: 2, // TOPIC resource type
            name: topicName,
          },
        ],
      });

      const config: Record<string, string> = {};
      const resource = resources.resources[0];

      if (resource && resource.configEntries) {
        for (const entry of resource.configEntries) {
          config[entry.configName] = entry.configValue;
        }
      }

      return config;
    } catch (error) {
      this.log.error({ topicName, error }, 'Failed to get topic config');
      throw error;
    }
  }

  /**
   * Check if a topic exists
   */
  async topicExists(name: string): Promise<boolean> {
    try {
      const topics = await this.admin.listTopics();
      return topics.includes(name);
    } catch (error) {
      this.log.error({ topicName: name, error }, 'Failed to check if topic exists');
      return false;
    }
  }

  /**
   * Create topic for plugin automatically
   */
  async createPluginTopic(
    pluginId: string,
    eventName: string,
    config?: TopicConfig
  ): Promise<void> {
    const topicName = this.buildPluginTopicName(pluginId, eventName);
    await this.createTopic(topicName, config);
  }

  /**
   * Create topic for core events
   */
  async createCoreTopic(domain: string, eventName: string, config?: TopicConfig): Promise<void> {
    const topicName = this.buildCoreTopicName(domain, eventName);
    await this.createTopic(topicName, config);
  }

  /**
   * Build plugin topic name following convention
   */
  buildPluginTopicName(pluginId: string, eventName: string): string {
    return `plugin.${pluginId}.${eventName}`;
  }

  /**
   * Build core topic name following convention
   */
  buildCoreTopicName(domain: string, eventName: string): string {
    return `core.${domain}.${eventName}`;
  }

  /**
   * Validate topic name format
   * Accepts: core.*, plugin.*, dlq.*, plexica.* topic naming patterns
   */
  private validateTopicName(name: string): void {
    const validPattern = /^(core|plugin|dlq|plexica)\.[a-z0-9-]+(\.[a-z0-9-]+)+$/;

    if (!validPattern.test(name)) {
      throw new Error(
        `Invalid topic name: ${name}. ` +
          `Must follow pattern: core.{domain}.{event}, plugin.{pluginId}.{event}, plexica.{domain}.{event}, or dlq.{topic}`
      );
    }
  }

  /**
   * Delete all topics matching a pattern (use with caution!)
   */
  async deleteTopicsByPattern(pattern: RegExp): Promise<void> {
    try {
      const topics = await this.listTopics();
      const topicsToDelete = topics.filter((topic) => pattern.test(topic));

      if (topicsToDelete.length === 0) {
        this.log.info({ pattern: pattern.toString() }, 'No topics found matching pattern');
        return;
      }

      this.log.warn(
        { pattern: pattern.toString(), count: topicsToDelete.length },
        'Deleting topics matching pattern'
      );
      await this.admin.deleteTopics({
        topics: topicsToDelete,
        timeout: 30000,
      });

      this.log.info(
        { pattern: pattern.toString(), count: topicsToDelete.length },
        'Deleted topics matching pattern'
      );
    } catch (error) {
      this.log.error({ error }, 'Failed to delete topics by pattern');
      throw error;
    }
  }
}
