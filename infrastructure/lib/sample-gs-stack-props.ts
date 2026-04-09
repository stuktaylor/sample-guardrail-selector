import * as cdk from 'aws-cdk-lib';

/**
 * Constants for knowledge base backend types
 */
export const KnowledgeBaseTypes = {
  OPENSEARCH: 'opensearch',
  AURORA_POSTGRES: 'aurora_postgres'
} as const;

/**
 * Type for knowledge base backend selection
 */
export type KnowledgeBaseType = typeof KnowledgeBaseTypes[keyof typeof KnowledgeBaseTypes];

export interface SampleGSStackProps extends cdk.StackProps {
    enableLocalhost?: boolean;
    prefix: string;
    /**
     * Type of knowledge base to use for the application
     * Can be either 'opensearch' or 'aurora_postgres'
     */
    knowledgeBaseType: KnowledgeBaseType;
}
