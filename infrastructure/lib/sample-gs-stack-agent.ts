import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';
import { SampleGSStackGuardrail } from './sample-gs-stack-guardrail';
import { SampleGSStackKnowledgeBase as SampleGSStackKnowledgeBase } from './sample-gs-stack-knowledge-base'

export interface SampleGSStackAgentProps {
  sampleGSStackKnowledgeBase: SampleGSStackKnowledgeBase;
  sampleGSStackGuardrail: SampleGSStackGuardrail;
  prefix: string;
}

export class SampleGSStackAgent extends Construct {
  public readonly agent: bedrock.CfnAgent;
  public readonly agentAlias: bedrock.CfnAgentAlias;
  public readonly guardrail: bedrock.CfnGuardrail;
  public readonly guardrailVersion: string;
  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;

  constructor(scope: Construct, id: string, props: SampleGSStackAgentProps) {
    super(scope, id);
    
    // Set the guardrail and guardrail version from the construct
    this.guardrail = props.sampleGSStackGuardrail.guardrail;
    this.guardrailVersion = props.sampleGSStackGuardrail.guardrailVersion;
    this.knowledgeBase = props.sampleGSStackKnowledgeBase.knowledgeBase;

    // Create an agent role with necessary permissions
    const agentRole = new iam.Role(this, 'AgentRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      inlinePolicies: {
        agentPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel',
                'bedrock:ApplyGuardrail'
              ],
              resources: ['*']
            })
          ]
        })
      }
    });

    // If a knowledge base is provided, add permissions to access it
    if (props.sampleGSStackKnowledgeBase) {
      agentRole.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:Retrieve',
          'bedrock:RetrieveAndGenerate',
				  'bedrock:GetInferenceProfile'
        ],
        resources: ['*']
      }));
    }

    // Create the Bedrock agent
    this.agent = new bedrock.CfnAgent(this, 'BedrockAgent', {
      agentName: `${props.prefix}agent`,
      agentResourceRoleArn: agentRole.roleArn,
      foundationModel: `amazon.nova-pro-v1:0`,
      instruction: 'You are an expert at answering questions in a short and concise way. You use the data available in your knowledgebase to respond',
      customerEncryptionKeyArn: undefined, // Using AWS managed key
      idleSessionTtlInSeconds: 1800, // 30 minutes
      description: 'A concise and efficient agent',
      knowledgeBases: [{
        description: 'Provide accurate information from this knowledge base. Cite sources when answering. If information is unavailable, acknowledge and use your foundation model knowledge.',
        knowledgeBaseId: this.knowledgeBase.attrKnowledgeBaseId
      }] //,
      //guardrailConfiguration: {
      //  guardrailIdentifier: this.guardrail.attrGuardrailId,
      //  guardrailVersion: this.guardrailVersion
      //}
    });

    // Create an alias for the agent (required for invocation)
    this.agentAlias = new bedrock.CfnAgentAlias(this, 'BedrockAgentAlias', {
      agentId: this.agent.attrAgentId,
      agentAliasName: 'latest'
    });

    // Add dependency to ensure the guardrail is created before the agent
    this.agent.node.addDependency(this.guardrail);
    this.agentAlias.node.addDependency(this.agent);
    this.agent.node.addDependency(this.knowledgeBase)

    // Output values
    new cdk.CfnOutput(this, 'SampleGS_AgentId', { value: this.agent.attrAgentId });
    new cdk.CfnOutput(this, 'SampleGS_AgentAliasId', { value: this.agentAlias.attrAgentAliasId });
    new cdk.CfnOutput(this, 'SampleGS_AgentTestAliasId', { value: 'TSTALIASID' });
  }
}
