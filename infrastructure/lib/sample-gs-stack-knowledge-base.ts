import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';
import { SampleGSStackOpenSearch } from './sample-gs-stack-opensearch';
import { SampleGSStackGuardrail } from './sample-gs-stack-guardrail';
import { SampleGSStackAurora } from './sample-gs-stack-aurora';
import { SampleGSStackLambdaLayers } from './sample-gs-stack-lambda-layers';
import { KnowledgeBaseType, KnowledgeBaseTypes } from './sample-gs-stack-props';

export interface SampleGSStackKnowledgeBaseProps {
  sampleGSStackGuardrail: SampleGSStackGuardrail;
  prefix: string;
  lambdaLayers: SampleGSStackLambdaLayers;
  knowledgeBaseType: KnowledgeBaseType; // Use the KnowledgeBaseType instead of boolean flag
}

export class SampleGSStackKnowledgeBase extends Construct {
  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  public readonly dataSource: bedrock.CfnDataSource;
  public readonly dataBucket: s3.Bucket;
  public readonly knowledgeBaseRole: iam.Role;
  public readonly knowledgeBaseDeployment: s3deploy.BucketDeployment;

  constructor(scope: Construct, id: string, props: SampleGSStackKnowledgeBaseProps) {
    super(scope, id);

    // Create the knowledge base role with least privilege permissions
    this.knowledgeBaseRole = new iam.Role(this, 'KnowledgeBaseRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      inlinePolicies: {
        knowledgeBasePolicy: new iam.PolicyDocument({
          statements: [
            // Bedrock permissions for knowledge base operations
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:GetKnowledgeBase',
                'bedrock:StartIngestionJob',
                'bedrock:GetIngestionJob',
                'bedrock:ListIngestionJobs',
                'bedrock:IngestKnowledgeBaseDocuments',
                'bedrock:DeleteKnowledgeBaseDocuments',
                'bedrock:Retrieve',
                'bedrock:RetrieveAndGenerate'
              ],
              resources: [
                // Specific to the knowledge base being created
                `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:knowledge-base/*`
              ]
            }),
            // Bedrock model invocation permissions
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel'
              ],
              resources: [
                // Claude models used for embeddings and retrieval
                `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/*`
              ]
            }),
            // Add storage-specific permissions
            ...this.createStoragePermissions(props)
          ]
        })
      }
    });

    // Create the storage resources based on the selected option
    const openSearchResources = this.createOpenSearchResources(props);
    const aurora = this.createAuroraResources(props);

    // Create an S3 bucket for knowledge base data that will be destroyed on stack deletion
    this.dataBucket = new s3.Bucket(this, 'KnowledgeBaseDataBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    });
    
    // Grant the knowledge base role access to the S3 bucket
    this.dataBucket.grantReadWrite(this.knowledgeBaseRole);
    
    // Create a knowledge base with the selected storage configuration
    const knowledgeBaseConfig = {
      name: props.prefix,
      description: 'Vector store knowledge base using Titan Text Embeddings V2',
      roleArn: this.knowledgeBaseRole.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/amazon.titan-embed-text-v2:0`,
          embeddingModelConfiguration: {
            bedrockEmbeddingModelConfiguration: {
              dimensions: 1024,
              embeddingDataType: 'FLOAT32'
            }
          }
        }
      },
      storageConfiguration: this.createStorageConfiguration(props, openSearchResources, aurora)
    };
    
    this.knowledgeBase = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', knowledgeBaseConfig);
    
    // Add dependencies based on the selected storage option
    this.addStorageDependencies(props, openSearchResources, aurora);

    // Create a data source for the knowledge base
    this.dataSource = new bedrock.CfnDataSource(this, 'KnowledgeBaseDataSource', {
      name: `${props.prefix}datasource`,
      description: 'S3 data source for just in time knowledge base',
      knowledgeBaseId: this.knowledgeBase.ref,
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: this.dataBucket.bucketArn
        }
      }
    });

    // Add dependency to ensure the knowledge base is created before the data source
    this.dataSource.addDependency(this.knowledgeBase);

    // Deploy the NIST text file from the knowledgebase directory to the S3 bucket
    this.knowledgeBaseDeployment = new s3deploy.BucketDeployment(this, 'DeployKnowledgeBaseFiles', {
      sources: [s3deploy.Source.asset('../knowledgebase')],
      destinationBucket: this.dataBucket,
      retainOnDelete: false,
    });

    // Create a Lambda function to sync the knowledge base after deployment
    const syncKnowledgeBaseFunction = new lambda.Function(this, 'SyncKnowledgeBaseFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'SyncKnowledgeBase.handler',
      memorySize: 2048,
      timeout: cdk.Duration.minutes(10),
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      layers: [props.lambdaLayers.powertoolsLayer, props.lambdaLayers.sampleGSLayer],
      environment: {
        KNOWLEDGE_BASE_ID: this.knowledgeBase.attrKnowledgeBaseId,
        DATA_SOURCE_ID: this.dataSource.attrDataSourceId,
        // Add PowerTools environment variables
        ...props.lambdaLayers.powertoolsEnv
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH
    });

    // Add permissions for Bedrock knowledge base operations
    syncKnowledgeBaseFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:StartIngestionJob',
        'bedrock:GetIngestionJob',
        'bedrock:ListIngestionJobs'
      ],
      resources: [`arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:knowledge-base/*`]
    }));

    // Create a custom resource that will trigger the Lambda
    const syncKnowledgeBaseProvider = new cdk.custom_resources.Provider(this, 'SyncKnowledgeBaseProvider', {
      onEventHandler: syncKnowledgeBaseFunction,
      logRetention: logs.RetentionDays.ONE_WEEK
    });

    const syncKnowledgeBaseResource = new cdk.CustomResource(this, 'SyncKnowledgeBaseResource', {
      serviceToken: syncKnowledgeBaseProvider.serviceToken,
      properties: {
        // Add a timestamp to ensure the resource is updated on each deployment
        timestamp: new Date().toISOString()
      }
    });
    
    // Add dependencies to ensure proper execution order
    syncKnowledgeBaseResource.node.addDependency(this.knowledgeBaseDeployment);
    syncKnowledgeBaseResource.node.addDependency(this.dataSource);
    syncKnowledgeBaseResource.node.addDependency(this.knowledgeBase);

    new cdk.CfnOutput(this, 'SampleGS_KnowledgeBaseId', { value: this.knowledgeBase.attrKnowledgeBaseId });
    new cdk.CfnOutput(this, 'SampleGS_KnowledgeBaseDataSourceId', { value: this.dataSource.attrDataSourceId });
    new cdk.CfnOutput(this, 'SampleGS_KnowledgeBaseStorageType', { 
      value: props.knowledgeBaseType 
    });
  }

  // Helper method to create storage-specific IAM permissions
  private createStoragePermissions(props: SampleGSStackKnowledgeBaseProps): iam.PolicyStatement[] {
    if (props.knowledgeBaseType === KnowledgeBaseTypes.AURORA_POSTGRES) {
      // Aurora PostgreSQL permissions
      return [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'rds:DescribeDBClusters',
            'rds:DescribeDBInstances',
            'rds-data:ExecuteStatement',
            'rds-data:BatchExecuteStatement',
            'secretsmanager:GetSecretValue'
          ],
          resources: [
            `arn:aws:rds:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:cluster:*`,
            `arn:aws:rds:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:db:*`,
            `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:*`
          ]
        })
      ];
    } else {
      // OpenSearch Serverless permissions
      return [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'aoss:APIAccessAll',
            'aoss:BatchGetCollection',
            'aoss:CreateCollection',
            'aoss:CreateSecurityPolicy',
            'aoss:GetAccessPolicy',
            'aoss:UpdateAccessPolicy',
            'aoss:CreateAccessPolicy',
            'aoss:GetSecurityPolicy',
            'aoss:UpdateSecurityPolicy'
          ],
          resources: [
            // Specific to collections in this account
            `arn:aws:aoss:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:collection/*`
          ]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'aoss:ReadDocument',
            'aoss:WriteDocument',
            'aoss:DeleteDocument',
            'aoss:CreateIndex',
            'aoss:DeleteIndex',
            'aoss:UpdateIndex'
          ],
          resources: [
            // Specific to collections and indexes in this account
            `arn:aws:aoss:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:collection/*`
          ]
        })
      ];
    }
  }

  // Helper method to create OpenSearch resources if needed
  private createOpenSearchResources(props: SampleGSStackKnowledgeBaseProps): SampleGSStackOpenSearch | undefined {
    if (props.knowledgeBaseType === KnowledgeBaseTypes.OPENSEARCH) {
      return new SampleGSStackOpenSearch(this, 'OpenSearchResources', {
        knowledgeBaseRole: this.knowledgeBaseRole,
        prefix: props.prefix
      });
    }
    return undefined;
  }

  // Helper method to create Aurora resources if needed
  private createAuroraResources(props: SampleGSStackKnowledgeBaseProps): SampleGSStackAurora | undefined {
    if (props.knowledgeBaseType === KnowledgeBaseTypes.AURORA_POSTGRES) {
      return new SampleGSStackAurora(this, 'AuroraResources', {
        knowledgeBaseRole: this.knowledgeBaseRole,
        prefix: props.prefix,
        lambdaLayers: props.lambdaLayers
      });
    }
    return undefined;
  }

  // Helper method to create the appropriate storage configuration
  private createStorageConfiguration(
    props: SampleGSStackKnowledgeBaseProps,
    openSearchResources: SampleGSStackOpenSearch | undefined,
    aurora: SampleGSStackAurora | undefined
  ): any {
    if (props.knowledgeBaseType === KnowledgeBaseTypes.AURORA_POSTGRES && aurora) {
      return {
        type: 'RDS',
        rdsConfiguration: {
          resourceArn: aurora.cluster.clusterArn,
          credentialsSecretArn: aurora.bedrockUserSecret.secretArn,
          databaseName: aurora.databaseName,
          fieldMapping: {
            vectorField: 'embedding',
            textField: 'chunks',
            metadataField: 'metadata',
            primaryKeyField: 'id'
          },
          tableName: 'bedrock_integration.bedrock_kb'
        }
      };
    } else if (props.knowledgeBaseType === KnowledgeBaseTypes.OPENSEARCH && openSearchResources) {
      return {
        type: 'OPENSEARCH_SERVERLESS',
        opensearchServerlessConfiguration: {
          collectionArn: openSearchResources.vectorCollection.attrArn,
          fieldMapping: {
            vectorField: 'vector_field',
            textField: 'text_field',
            metadataField: 'metadata_field'
          },
          vectorIndexName: openSearchResources.indexName
        }
      };
    }
    
    // Default to OpenSearch configuration (should not reach here if code is properly used)
    throw new Error('Neither Aurora nor OpenSearch resources were created. Check configuration.');
  }

  // Helper method to add the appropriate dependencies
  private addStorageDependencies(
    props: SampleGSStackKnowledgeBaseProps,
    openSearchResources: SampleGSStackOpenSearch | undefined,
    aurora: SampleGSStackAurora | undefined
  ): void {
    if (props.knowledgeBaseType === KnowledgeBaseTypes.AURORA_POSTGRES && aurora) {
      this.knowledgeBase.node.addDependency(aurora.cluster);
      this.knowledgeBase.node.addDependency(aurora.secret);
      this.knowledgeBase.node.addDependency(aurora.waitForPgVectorResource); // Add dependency on pgVector initialization
    } else if (props.knowledgeBaseType === KnowledgeBaseTypes.OPENSEARCH && openSearchResources) {
      this.knowledgeBase.node.addDependency(openSearchResources.vectorIndex);
      this.knowledgeBase.node.addDependency(openSearchResources.vectorCollection);
      this.knowledgeBase.node.addDependency(openSearchResources.waitForIndexResource);
    }
  }
}
