// @ts-nocheck
import type { Admin } from 'kafkajs';
import type { TopicConfig, TopicMetadata, PartitionInfo } from '../types';
import { TopicConfigSchema } from '../types';
import { RedpandaClient } from './redpanda-client';

/**
 * Topic naming convention:
 * - Core events: core.{domain}.{event} (e.g., core.tenant.created)
 * - Plugin events: plugin.{pluginId}.{event} (e.g., plugin.crm.contact.created)
 */
export class TopicManager {
  private admin: Admin;
  private defaultConfig: TopicConfig = {
    numPartitions: 3, // One partition per Redpanda node
    replicationFactor: 3, // Replicate across all nodes for HA
    retentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    cleanupPolicy: 'delete',
  };

  constructor(private client: RedpandaClient) {
    this.admin = client.getAdmin();
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
        console.log(`ℹ️  Topic already exists: ${name}`);
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

      console.log(`✅ Topic created: ${name}`);
    } catch (error) {
      console.error(`❌ Failed to create topic ${name}:`, error);
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
        console.log(`ℹ️  Topic does not exist: ${name}`);
        return;
      }

      await this.admin.deleteTopics({
        topics: [name],
        timeout: 10000,
      });

      console.log(`✅ Topic deleted: ${name}`);
    } catch (error) {
      console.error(`❌ Failed to delete topic ${name}:`, error);
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
      console.error('❌ Failed to list topics:', error);
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
      console.error(`❌ Failed to get topic metadata for ${topicName}:`, error);
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
      console.error(`❌ Failed to get topic config for ${topicName}:`, error);
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
      console.error(`❌ Failed to check if topic exists: ${name}`, error);
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
        console.log('ℹ️  No topics found matching pattern');
        return;
      }

      console.log(`⚠️  Deleting ${topicsToDelete.length} topics matching pattern...`);
      await this.admin.deleteTopics({
        topics: topicsToDelete,
        timeout: 30000,
      });

      console.log(`✅ Deleted ${topicsToDelete.length} topics`);
    } catch (error) {
      console.error('❌ Failed to delete topics by pattern:', error);
      throw error;
    }
  }
}
