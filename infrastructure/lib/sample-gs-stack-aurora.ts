import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as path from 'path';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { SampleGSStackLambdaLayers } from './sample-gs-stack-lambda-layers';

export interface SampleGSStackAuroraProps {
  knowledgeBaseRole: iam.Role;
  prefix: string;
  lambdaLayers: SampleGSStackLambdaLayers;
  vpc?: ec2.IVpc; // Optional VPC, will create one if not provided
}

export class SampleGSStackAurora extends Construct {
  public readonly cluster: rds.DatabaseCluster;
  public readonly databaseName: string;
  public readonly secret: secretsmanager.ISecret;
  public readonly bedrockUserSecret: secretsmanager.ISecret;
  public readonly pgVectorInitFunction: lambda.Function;
  public readonly waitForPgVectorResource: cr.AwsCustomResource;

  constructor(scope: Construct, id: string, props: SampleGSStackAuroraProps) {
    super(scope, id);
    
    this.databaseName = `${props.prefix}vectordb`;
    
    // Create a VPC
    const vpc = new ec2.Vpc(this, 'AuroraVPC', {
      maxAzs: 2,
      natGateways: 1,
    });
    
    // Create a security group for the database
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      description: 'Security group for Aurora PostgreSQL Serverless v2',
      allowAllOutbound: true,
    });

    // Create a subnet group for the database
    const subnetGroup = new rds.SubnetGroup(this, 'AuroraSubnetGroup', {
      description: 'Subnet group for Aurora PostgreSQL Serverless v2',
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });
    
    // Create the Aurora Serverless v2 cluster
    this.cluster = new rds.DatabaseCluster(this, 'AuroraServerlessV2Cluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
      writer: rds.ClusterInstance.serverlessV2('writer'),
      // No readers to minimize costs for low-usage scenarios
      readers: [],
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [dbSecurityGroup],
      defaultDatabaseName: this.databaseName,
      subnetGroup,
      serverlessV2MinCapacity: 0.5, // Minimum ACU (Aurora Capacity Units)
      serverlessV2MaxCapacity: 4,  // Maximum ACU
      backup: {
        retention: cdk.Duration.days(7), // Backup retention period
      },
      storageEncrypted: true,
      deletionProtection: false, // Set to true for production
    });
    
    // Store reference to the secret for later use
    this.secret = this.cluster.secret!;
    
    // Create a dedicated secret for the bedrock_user
    this.bedrockUserSecret = new secretsmanager.Secret(this, 'BedrockUserSecret', {
      secretName: `${props.prefix}-bedrock-user-secret`,
      description: 'Secret for bedrock_user database credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'bedrock_user',
          dbname: this.databaseName,
          engine: 'postgres',
          host: this.cluster.clusterEndpoint.hostname,
          port: this.cluster.clusterEndpoint.port,
        }),
        generateStringKey: 'password',
        excludeCharacters: '/@"\'\\',
        passwordLength: 30
      }
    });
    
    // Grant access to the knowledge base role
    this.cluster.grantDataApiAccess(props.knowledgeBaseRole);
    this.bedrockUserSecret.grantRead(props.knowledgeBaseRole);
    
    this.pgVectorInitFunction = new lambda.Function(this, 'PgVectorInitFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'PgVectorInit.handler',
      memorySize: 2048,
      timeout: cdk.Duration.minutes(5),
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      layers: [props.lambdaLayers.powertoolsLayer, props.lambdaLayers.sampleGSLayer],
      environment: {
        'SECRET_ARN': this.secret.secretArn,
        'DATABASE_NAME': this.databaseName,
        'CLUSTER_ARN': this.cluster.clusterArn,
        'BEDROCK_USER_SECRET_ARN': this.bedrockUserSecret.secretArn,
        // Add PowerTools environment variables
        ...props.lambdaLayers.powertoolsEnv
      },
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH
    });
    
    // Grant the Lambda function permissions to use the Data API and read secrets
    this.cluster.grantDataApiAccess(this.pgVectorInitFunction);
    this.secret.grantRead(this.pgVectorInitFunction);
    this.bedrockUserSecret.grantRead(this.pgVectorInitFunction);
    
    // Create a custom resource to initialize pgvector
    this.waitForPgVectorResource = new cr.AwsCustomResource(this, 'PgVectorInitResource', {
      onUpdate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: this.pgVectorInitFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Update',
            ResourceProperties: {},
          }),
        },
        physicalResourceId: cr.PhysicalResourceId.of('PgVectorInitUpdate'),
      },
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: this.pgVectorInitFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Create',
            ResourceProperties: {},
          }),
        },
        physicalResourceId: cr.PhysicalResourceId.of('PgVectorInitCreate'),
      },
      onDelete: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: this.pgVectorInitFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Delete',
            ResourceProperties: {},
          }),
        },
        physicalResourceId: cr.PhysicalResourceId.of('PgVectorInitDelete'),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [this.pgVectorInitFunction.functionArn],
        }),
      ]),
      installLatestAwsSdk: true,
      timeout: cdk.Duration.minutes(10),
      resourceType: 'Custom::PgVectorInit',
    });
    
    // Add dependency to ensure the cluster is created first
    this.waitForPgVectorResource.node.addDependency(this.cluster);
    this.waitForPgVectorResource.node.addDependency(this.pgVectorInitFunction);
    
    // Output important information
    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint.hostname,
      description: 'Aurora PostgreSQL Cluster Endpoint',
    });
    
    new cdk.CfnOutput(this, 'DatabaseName', {
      value: this.databaseName,
      description: 'Aurora PostgreSQL Database Name',
    });
    
    new cdk.CfnOutput(this, 'SecretArn', {
      value: this.secret.secretArn,
      description: 'Secret ARN for database credentials',
    });
    
    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'Aurora PostgreSQL Cluster ARN',
    });
    
    new cdk.CfnOutput(this, 'BedrockUserSecretArn', {
      value: this.bedrockUserSecret.secretArn,
      description: 'Secret ARN for bedrock_user credentials',
    });
  }
}

