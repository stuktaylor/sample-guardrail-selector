import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import { SampleGSStackKnowledgeBase as SampleGSStackKnowledgeBase } from './sample-gs-stack-knowledge-base'
import { SampleGSStackAgent as SampleGSStackAgent } from './sample-gs-stack-agent'
import { SampleGSStackLambdaLayers } from './sample-gs-stack-lambda-layers';

export interface SampleGSStackRestAPIProps {
  sampleGSStackKnowledgeBase: SampleGSStackKnowledgeBase;
  sampleGSStackAgent: SampleGSStackAgent;
  allowHeaders: string;
  allowOrigins: string;
  enableLocalhost: boolean;
  distributionDomainName: string;
  lambdaLayers: SampleGSStackLambdaLayers;
}

export class SampleGSStackRestAPI extends Construct {
  public readonly queryKnowledgeBaseFunction: lambda.Function;
  public readonly queryLLMFunction: lambda.Function;
  public readonly invokeAgentFunction: lambda.Function;
  public readonly manageGuardrailsFunction: lambda.Function;
  public readonly api: apigw.RestApi;

  constructor(scope: Construct, id: string, props: SampleGSStackRestAPIProps) {
    super(scope, id);

    // Create a Lambda function for querying the knowledge base
    this.queryKnowledgeBaseFunction = new lambda.Function(this, 'QueryKnowledgeBaseFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'QueryKnowledgeBase.handler',
      memorySize: 2048,
      timeout: cdk.Duration.minutes(2),
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      layers: [props.lambdaLayers.powertoolsLayer, props.lambdaLayers.sampleGSLayer],
      environment: {
        KNOWLEDGE_BASE_ID: props.sampleGSStackKnowledgeBase.knowledgeBase.attrKnowledgeBaseId,
        DATA_SOURCE_ID: props.sampleGSStackKnowledgeBase.dataSource.attrDataSourceId,
        ALLOW_ORIGINS: props.allowOrigins,
        ALLOW_HEADERS: props.allowHeaders,
        // Add PowerTools environment variables
        ...props.lambdaLayers.powertoolsEnv
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH
    });

    // Add permissions for Bedrock knowledge base operations
    this.queryKnowledgeBaseFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:Retrieve',
        'bedrock:RetrieveAndGenerate',
        'bedrock:InvokeModel',
        'bedrock:GetKnowledgeBase',
        'bedrock:ApplyGuardrail'
      ],
      resources: ['*']
    }));

    // Create a Lambda function for querying an LLM
    this.queryLLMFunction = new lambda.Function(this, 'QueryLLMFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'Query.handler',
      memorySize: 2048,
      timeout: cdk.Duration.minutes(2),
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      layers: [props.lambdaLayers.powertoolsLayer, props.lambdaLayers.sampleGSLayer],
      environment: {
        ALLOW_ORIGINS: props.allowOrigins,
        ALLOW_HEADERS: props.allowHeaders,
        // Add PowerTools environment variables
        ...props.lambdaLayers.powertoolsEnv
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH
    });
    
    // Add permissions for Bedrock knowledge base operations
    this.queryLLMFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:ApplyGuardrail'
      ],
      resources: ['*']
    }));

    // Create a Lambda function for invoking the agent
    this.invokeAgentFunction = new lambda.Function(this, 'InvokeAgentFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'InvokeAgent.handler',
      memorySize: 2024,
      timeout: cdk.Duration.minutes(2),
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      layers: [props.lambdaLayers.powertoolsLayer, props.lambdaLayers.sampleGSLayer],
      environment: {
        AGENT_ID: props.sampleGSStackAgent.agent.attrAgentId,
        AGENT_ALIAS_ID: props.sampleGSStackAgent.agentAlias.attrAgentAliasId,
        GUARDRAIL_ID: props.sampleGSStackAgent.guardrail.attrGuardrailId,
        GUARDRAIL_VERSION: props.sampleGSStackAgent.guardrailVersion,
        KNOWLEDGE_BASE_ID: props.sampleGSStackKnowledgeBase.knowledgeBase.attrKnowledgeBaseId,
        ALLOW_ORIGINS: props.allowOrigins,
        ALLOW_HEADERS: props.allowHeaders,
        // Add PowerTools environment variables
        ...props.lambdaLayers.powertoolsEnv
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH
    });

    // Add permissions for Bedrock agent operations
    this.invokeAgentFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeAgent'
      ],
      resources: ['*']
    }));

    // Create a Lambda function for managing guardrails
    this.manageGuardrailsFunction = new lambda.Function(this, 'ManageGuardrailsFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'ManageGuardrails.handler',
      memorySize: 2048,
      timeout: cdk.Duration.minutes(2),
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      layers: [props.lambdaLayers.powertoolsLayer, props.lambdaLayers.sampleGSLayer],
      environment: {
        KNOWLEDGE_BASE_ID: props.sampleGSStackKnowledgeBase.knowledgeBase.attrKnowledgeBaseId,
        AGENT_ID: props.sampleGSStackAgent.agent.attrAgentId,
        AGENT_ALIAS_ID: props.sampleGSStackAgent.agentAlias.attrAgentAliasId,
        ALLOW_ORIGINS: props.allowOrigins,
        ALLOW_HEADERS: props.allowHeaders,
        ...props.lambdaLayers.powertoolsEnv
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH
    });

    // Add permissions for Bedrock guardrail and agent operations
    this.manageGuardrailsFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:ListGuardrails',
        'bedrock:GetGuardrail',
        'bedrock:ApplyGuardrail',
        'bedrock:GetAgent',
        'bedrock:UpdateAgent',  // Add permission to update agents
        'bedrock:PrepareAgent'
      ],
      resources: ['*']
    }));
    
    // Add iam:PassRole permission for the agent role
    this.manageGuardrailsFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iam:PassRole'
      ],
      resources: [
        `arn:aws:iam::${cdk.Stack.of(this).account}:role/SampleGS-AgentStackAgentRole*`
      ]
    }));


    this.api = new apigw.RestApi(this, 'SampleGSApi', {
      defaultCorsPreflightOptions: {
        allowOrigins: props.enableLocalhost
          ? [
            `https://${props.distributionDomainName}`,
            'http://localhost:8000'
          ]
          : [`https://${props.distributionDomainName}`],
        allowMethods: ['GET', 'OPTIONS', 'POST', 'PUT', 'DELETE'],
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token'
        ],
        allowCredentials: true
      }
    });

    // Add the API Gateway resource and method for knowledge base queries
    const knowledgeBaseAPI = this.api.root.addResource('knowledge-base');
    const queryKBResource = knowledgeBaseAPI.addResource('query');
    queryKBResource.addMethod('POST', new apigw.LambdaIntegration(this.queryKnowledgeBaseFunction), {
      authorizationType: apigw.AuthorizationType.NONE
    });

    // Add the API Gateway resource and method for LLM queries
    const llmAPI = this.api.root.addResource('llm');
    const queryLLMResource = llmAPI.addResource('query');
    queryLLMResource.addMethod('POST', new apigw.LambdaIntegration(this.queryLLMFunction), {
      authorizationType: apigw.AuthorizationType.NONE
    });
    
    // Add API Gateway resource and method for agent invocation
    const agentAPI = this.api.root.addResource('agent');
    const queryAgentResource = agentAPI.addResource('invoke');
    queryAgentResource.addMethod('POST', new apigw.LambdaIntegration(this.invokeAgentFunction), {
      authorizationType: apigw.AuthorizationType.NONE
    });
    
    // Add API Gateway resource and method for guardrail management
    const guardrailsResource = this.api.root.addResource('guardrails');
    guardrailsResource.addMethod('GET', new apigw.LambdaIntegration(this.manageGuardrailsFunction), {
      authorizationType: apigw.AuthorizationType.NONE
    });

    const agentGuardrailResource = guardrailsResource.addResource('{agentId}');
    agentGuardrailResource.addMethod('GET', new apigw.LambdaIntegration(this.manageGuardrailsFunction), {
      authorizationType: apigw.AuthorizationType.NONE
    });

    guardrailsResource.addMethod('PUT', new apigw.LambdaIntegration(this.manageGuardrailsFunction), {
      authorizationType: apigw.AuthorizationType.NONE
    });

    new cdk.CfnOutput(this, 'SampleGS_ApiUrl', { value: this.api.url });
  }
}