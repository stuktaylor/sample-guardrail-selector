import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import { SampleGSStackProps, KnowledgeBaseType, KnowledgeBaseTypes } from './sample-gs-stack-props';
import { SampleGSStackKnowledgeBase } from './sample-gs-stack-knowledge-base';
import { SampleGSStackAgent } from './sample-gs-stack-agent';
import { SampleGSStackRestAPI } from './sample-gs-stack-rest-api';
import { SampleGSStackGuardrail } from './sample-gs-stack-guardrail';
import { SampleGSStackLambdaLayers } from './sample-gs-stack-lambda-layers';

export class SampleGSStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: SampleGSStackProps) {
    super(scope, id, props);

    // Default to false if not provided
    const enableLocalhost = props?.enableLocalhost ?? false;
    const prefix = props?.prefix ?? 'samplegskb';
    
    // Default to OPENSEARCH if knowledgeBaseType is not provided
    const knowledgeBaseType: KnowledgeBaseType = props?.knowledgeBaseType ?? KnowledgeBaseTypes.OPENSEARCH;

    console.log('enableLocalhost:', enableLocalhost);
    console.log('Prefix:', prefix);
    console.log('Stack Name:', this.stackName);
    console.log('Knowledge Base Type:', knowledgeBaseType);

    // Create S3 bucket for website hosting (no public access needed)
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Only for development
      autoDeleteObjects: true, // Only for development
      enforceSSL: true, // Enforce SSL/TLS for data in transit
      encryption: s3.BucketEncryption.S3_MANAGED, // Enable server-side encryption by default
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED, // Enforce object ownership
    });

    // Create CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html'
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html'
        }
      ]
    });

    const allowHeaders = enableLocalhost
      ? 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Origin'
      : 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token';

    const allowOrigins = enableLocalhost
      ? `https://${distribution.distributionDomainName},http://localhost:8000`
      : `https://${distribution.distributionDomainName}`;

    // Create a Bedrock guardrail using the abstracted construct
    const guardrail = new SampleGSStackGuardrail(this, 'Guardrail', {
      guardrailConfig: {
        name: `${props?.prefix}_Full`,
        description: 'Guardrail to prevent harmful content'
      },
      useDefaultContentFilters: true,
      useDefaultTopicPolicies: true,
      useDefaultPiiEntityTypes: true
    });

    // Basic has PROMPT_ATTACK as each guardrail must have at least one content filter.
    const guardrailBasic = new SampleGSStackGuardrail(this, 'GuardrailBasic', {
      guardrailConfig: {
        name: `${props?.prefix}_Basic`,
        description: 'Guardrail to prevent harmful content',
        contentFilters: [
          {
            type: 'PROMPT_ATTACK',
            inputStrength: 'MEDIUM',
            outputStrength: 'NONE'
          }
        ]
      },
      useDefaultContentFilters: false,
      useDefaultTopicPolicies: false,
      useDefaultPiiEntityTypes: false
    });
    const guardrailContent = new SampleGSStackGuardrail(this, 'GuardrailContent', {
      guardrailConfig: {
        name: `${props?.prefix}_Content`,
        description: 'Guardrail to prevent harmful content'
      },
      useDefaultContentFilters: true,
      useDefaultTopicPolicies: false,
      useDefaultPiiEntityTypes: false
    });
    const guardrailTopics = new SampleGSStackGuardrail(this, 'GuardrailTopics', {
      guardrailConfig: {
        name: `${props?.prefix}_Topics`,
        description: 'Guardrail to prevent harmful content'
      },
      useDefaultContentFilters: false,
      useDefaultTopicPolicies: true,
      useDefaultPiiEntityTypes: false
    });
    const guardrailPII = new SampleGSStackGuardrail(this, 'GuardrailPii', {
      guardrailConfig: {
        name: `${props?.prefix}_PII`,
        description: 'Guardrail to prevent harmful content'
      },
      useDefaultContentFilters: false,
      useDefaultTopicPolicies: false,
      useDefaultPiiEntityTypes: true
    });

    // Get the shared Lambda layers
    const lambdaLayers = new SampleGSStackLambdaLayers(this, 'LambdaLayers');

    // Create the OpenSearch and Knowledge Base resources
    const sampleGSStackKnowledgeBase = new SampleGSStackKnowledgeBase(this, 'KnowledgeBase', {
      sampleGSStackGuardrail: guardrail,
      prefix: prefix,
      lambdaLayers: lambdaLayers,
      knowledgeBaseType: knowledgeBaseType
    });
    
    // Create the Bedrock agent
    const agentStack = new SampleGSStackAgent(this, 'AgentStack', {
      sampleGSStackGuardrail: guardrail,
      sampleGSStackKnowledgeBase: sampleGSStackKnowledgeBase,
      prefix: prefix
    });

    const restAPI = new SampleGSStackRestAPI(this, 'RestAPIStack', {
      sampleGSStackKnowledgeBase: sampleGSStackKnowledgeBase,
      sampleGSStackAgent: agentStack,
      allowHeaders: allowHeaders,
      allowOrigins: allowOrigins,
      enableLocalhost: enableLocalhost,
      distributionDomainName: distribution.distributionDomainName,
      lambdaLayers: lambdaLayers
    })

    const configContent = JSON.stringify({
      Region: cdk.Stack.of(this).region,
      API: restAPI.api.url,
      AgentID: agentStack.agent.attrAgentId,
      AgentAliasID: agentStack.agentAlias.attrAgentAliasId,
      KnowledgeBaseID: sampleGSStackKnowledgeBase.knowledgeBase.attrKnowledgeBaseId
    });

    // Deploy static website files to S3
    new s3deploy.BucketDeployment(this, 'WebsiteDeploymentBucket', {
      sources: [
        s3deploy.Source.asset('../website/dist'),
        s3deploy.Source.data('config.js', `window.config = ${configContent};`)
      ],
      destinationBucket: websiteBucket,
      memoryLimit: 2048
    });

    // Output values
    new cdk.CfnOutput(this, 'SampleGS_DistributionDomainName', { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'SampleGS_DistributionId', { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'SampleGS_EnableLocalhost', { value: enableLocalhost.toString() });
    new cdk.CfnOutput(this, 'SampleGS_WebsiteBucket', { value: websiteBucket.bucketName });
    
    // Add CLI command to download config.js file
    new cdk.CfnOutput(this, 'SampleGS_ConfigDownloadCommand', { 
      value: `aws s3 cp s3://${websiteBucket.bucketName}/config.js ./website/config.js --region ${this.region}` 
    });
  }
}
