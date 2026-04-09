import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { Construct } from 'constructs';

export class SampleGSStackLambdaLayers extends Construct {
  public readonly powertoolsLayer: lambda.ILayerVersion;
  public readonly sampleGSLayer: lambda.LayerVersion;
  public readonly powertoolsEnv: Record<string, string>;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Set up PowerTools environment variables
    const stackName = cdk.Stack.of(this).stackName;
    this.powertoolsEnv = {
      POWERTOOLS_SERVICE_NAME: stackName,
      POWERTOOLS_METRICS_NAMESPACE: stackName + 'LambdaMetrics',
      LOG_LEVEL: 'INFO',
      POWERTOOLS_LOGGER_LOG_EVENT: 'true',
      POWERTOOLS_LOGGER_SAMPLE_RATE: '0.1',
      POWERTOOLS_TRACER_CAPTURE_RESPONSE: 'true',
      POWERTOOLS_TRACER_CAPTURE_ERROR: 'true',
    };

    // Set up PowerTools layer
    this.powertoolsLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'PowertoolsLayer',
      `arn:aws:lambda:${cdk.Stack.of(this).region}:017000801446:layer:AWSLambdaPowertoolsPythonV3-python312-x86_64:8`
    );
    
    // Use the pre-built layer zip file
    const layerZipPath = path.join(__dirname, '../lambda/layers-zip/sample-gs-layer.zip');
    
    // Create the boto3 layer from the zip file
    this.sampleGSLayer = new lambda.LayerVersion(this, 'SampleGSLayer', {
      code: lambda.Code.fromAsset(layerZipPath),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      description: 'Layer containing boto3 and all other dependencies required',
      license: 'Apache-2.0',
    });
  }
}
