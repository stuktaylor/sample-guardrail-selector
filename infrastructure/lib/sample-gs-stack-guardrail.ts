import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';

export interface GuardrailConfig {
  name: string;
  description: string;
  blockedInputMessaging?: string;
  blockedOutputsMessaging?: string;
  contentFilters?: {
    type: string;
    inputStrength: string;
    outputStrength: string;
  }[];
  topicPolicies?: {
    name: string;
    type: string;
    definition: string;
  }[];
  piiEntityTypes?: {
    type: string;
    action: string;
    inputAction?: string;
    inputEnabled?: boolean;
    outputAction?: string;
    outputEnabled?: boolean;
  }[];
}

export interface SampleGSStackGuardrailProps {
  guardrailConfig?: GuardrailConfig;
  useDefaultContentFilters?: boolean;
  useDefaultTopicPolicies?: boolean;
  useDefaultPiiEntityTypes?: boolean;
}

export class SampleGSStackGuardrail extends Construct {
  public readonly guardrail: bedrock.CfnGuardrail;
  public readonly guardrailVersion: string;
  public readonly guardrailVersionResource?: bedrock.CfnGuardrailVersion;

  constructor(scope: Construct, id: string, props?: SampleGSStackGuardrailProps) {
    super(scope, id);

    // Default configuration for guardrail
    const defaultConfig: GuardrailConfig = {
      name: `guardrail${id.toLowerCase()}`,
      description: 'Guardrail to prevent harmful content',
      blockedInputMessaging: 'Your request contains content that is not allowed by our content policy.',
      blockedOutputsMessaging: 'The response contains content that is not allowed by our content policy.',
      contentFilters: [
        {
          type: 'MISCONDUCT',
          inputStrength: 'MEDIUM',
          outputStrength: 'MEDIUM',
        },
        {
          type: 'HATE',
          inputStrength: 'MEDIUM',
          outputStrength: 'MEDIUM',
        },
        {
          type: 'INSULTS',
          inputStrength: 'MEDIUM',
          outputStrength: 'MEDIUM',
        },
        {
          type: 'SEXUAL',
          inputStrength: 'MEDIUM',
          outputStrength: 'MEDIUM',
        },
        {
          type: 'VIOLENCE',
          inputStrength: 'MEDIUM',
          outputStrength: 'MEDIUM'
        },
        {
          type: 'PROMPT_ATTACK',
          inputStrength: 'MEDIUM',
          outputStrength: 'NONE'
        }
      ],
      topicPolicies: [
        {
          name: 'Financial advice',
          type: 'DENY',
          definition: 'Providing specific financial advice or investment recommendations'
        },
        {
          name: 'Legal advice',
          type: 'DENY',
          definition: 'Providing specific legal advice or legal recommendations'
        },
        {
          name: 'Medical advice',
          type: 'DENY',
          definition: 'Providing specific medical advice or health recommendations'
        }
      ],
      piiEntityTypes: [
        // General PII types
        {
          type: 'ADDRESS',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'AGE',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'NAME',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'NONE',
          outputEnabled: true
        },
        {
          type: 'EMAIL',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'PHONE',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'USERNAME',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'PASSWORD',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'DRIVER_ID',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'LICENSE_PLATE',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'VEHICLE_IDENTIFICATION_NUMBER',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        
        // Finance PII types
        {
          type: 'CREDIT_DEBIT_CARD_CVV',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'CREDIT_DEBIT_CARD_EXPIRY',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'CREDIT_DEBIT_CARD_NUMBER',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'PIN',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'INTERNATIONAL_BANK_ACCOUNT_NUMBER',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'SWIFT_CODE',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        
        // IT PII types
        {
          type: 'IP_ADDRESS',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'MAC_ADDRESS',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'URL',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'AWS_ACCESS_KEY',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'AWS_SECRET_KEY',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        
        // USA specific PII types
        {
          type: 'US_BANK_ACCOUNT_NUMBER',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'US_BANK_ROUTING_NUMBER',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'US_PASSPORT_NUMBER',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'US_SOCIAL_SECURITY_NUMBER',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        
        // Canada specific PII types
        {
          type: 'CA_HEALTH_NUMBER',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'CA_SOCIAL_INSURANCE_NUMBER',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        
        // UK specific PII types
        {
          type: 'UK_NATIONAL_HEALTH_SERVICE_NUMBER',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'UK_NATIONAL_INSURANCE_NUMBER',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        },
        {
          type: 'UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER',
          action: 'NONE',
          inputAction: 'NONE',
          inputEnabled: true,
          outputAction: 'ANONYMIZE',
          outputEnabled: true
        }
      ]
    };

    // Merge provided config with default config
    const config = {
      ...defaultConfig,
      ...props?.guardrailConfig,
      contentFilters: props?.guardrailConfig?.contentFilters || 
        (props?.useDefaultContentFilters !== false ? defaultConfig.contentFilters : []),
      topicPolicies: props?.guardrailConfig?.topicPolicies || 
        (props?.useDefaultTopicPolicies !== false ? defaultConfig.topicPolicies : []),
      piiEntityTypes: props?.guardrailConfig?.piiEntityTypes || 
        (props?.useDefaultPiiEntityTypes !== false ? defaultConfig.piiEntityTypes : [])
    };
    // Create the guardrail configuration
    const guardrailProps: any = {
      name: config.name,
      description: config.description,
      blockedInputMessaging: config.blockedInputMessaging || defaultConfig.blockedInputMessaging || 'Default',
      blockedOutputsMessaging: config.blockedOutputsMessaging || defaultConfig.blockedOutputsMessaging || 'Default'
    };

    // Only add contentPolicyConfig if we have content filters
    if (config.contentFilters && config.contentFilters.length > 0) {
      guardrailProps.contentPolicyConfig = {
        filtersConfig: config.contentFilters.map(filter => ({
          type: filter.type,
          inputStrength: filter.inputStrength,
          outputStrength: filter.outputStrength,
        }))
      }
    }

    // Only add topicPolicyConfig if we have topic filters
    if (config.topicPolicies && config.topicPolicies.length > 0) {
      guardrailProps.topicPolicyConfig = {
        topicsConfig: config.topicPolicies.map(topic => ({
          name: topic.name,
          type: topic.type,
          definition: topic.definition
        }))
      }
    }

    // Only add sensitiveInformationPolicyConfig if we have PII entity types
    if (config.piiEntityTypes && config.piiEntityTypes.length > 0) {
      guardrailProps.sensitiveInformationPolicyConfig = {
        piiEntitiesConfig: config.piiEntityTypes.map(pii => ({
          type: pii.type,
          action: pii.action,
          inputAction: pii.inputAction,
          inputEnabled: pii.inputEnabled,
          outputAction: pii.outputAction,
          outputEnabled: pii.outputEnabled
        }))
      };
    }

    // Create a Bedrock guardrail
    this.guardrail = new bedrock.CfnGuardrail(this, 'Guardrail', guardrailProps);
    
    // Set the guardrail version to the created version ID
    this.guardrailVersion = 'DRAFT';
  }
}
